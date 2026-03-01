# server.py
import os
import re
import uuid
import logging
import threading
import tempfile
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

from converter.core import convert_to_8d
from converter.utils import SUPPORTED_OUTPUT_FORMATS, DEFAULT_PARAMS

# Effect chain imports
from infrastructure.audio.effects import (
    Rotate8DEffect,
    ReverbEffect,
    StereoWidthEffect,
    VinylWarmthEffect,
)

# ── Effect Registry ──────────────────────────────────────────────
# Maps effect_id strings to effect class instances.
# Only registered IDs are allowed from the frontend.
EFFECT_REGISTRY = {
    "8d_rotate":     Rotate8DEffect(),
    "reverb":        ReverbEffect(),
    "stereo_width":  StereoWidthEffect(),
    "vinyl_warmth":  VinylWarmthEffect(),
}

# Default chain when no effects[] is specified
DEFAULT_EFFECT_IDS = ["8d_rotate", "reverb"]

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("8d_converter")

# ── Flask app ────────────────────────────────────────────────────────
app = Flask(__name__, static_folder="web", static_url_path="")

# P0: Upload size limit (100 MB hard cap)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

# P1: Restrict CORS to own origin
CORS(app, resources={
    r"/convert":    {"origins": ["http://localhost:5000", "http://127.0.0.1:5000"]},
    r"/status/*":   {"origins": ["http://localhost:5000", "http://127.0.0.1:5000"]},
    r"/download/*": {"origins": ["http://localhost:5000", "http://127.0.0.1:5000"]},
})

# P1: Load secret key from env or generate random
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or os.urandom(32)


# ════════════════════════════════════════════════════════════════════
# Security helpers
# ════════════════════════════════════════════════════════════════════

# P0: Magic bytes for known audio formats
AUDIO_MAGIC_BYTES: dict[bytes, str] = {
    b"\xff\xfb":              ".mp3",  # MP3 (MPEG layer 3)
    b"\xff\xf3":              ".mp3",
    b"\xff\xf2":              ".mp3",
    b"ID3":                   ".mp3",  # MP3 with ID3 tag
    b"RIFF":                  ".wav",  # WAV
    b"fLaC":                  ".flac", # FLAC
    b"OggS":                  ".ogg",  # OGG
    b"\x00\x00\x00\x20ftyp": ".m4a",
    b"\x00\x00\x00\x1cftyp": ".m4a",
}


def _validate_magic_bytes(file_bytes: bytes) -> bool:
    """Return True only if the file starts with a known audio signature."""
    for magic in AUDIO_MAGIC_BYTES:
        if file_bytes[:len(magic)] == magic:
            return True
    return False


def _sanitize_filename(name: str) -> str:
    """Strip path components, control chars, and limit length."""
    name = Path(name).name                        # strip directory traversal
    name = re.sub(r"[^\w\s\-.]", "", name)        # only safe chars
    name = re.sub(r"\.{2,}", ".", name)            # no double-extension tricks
    return name[:128].strip()


def _is_valid_job_id(job_id: str) -> bool:
    """Return True only for valid UUID4 strings."""
    try:
        val = uuid.UUID(job_id, version=4)
        return str(val) == job_id
    except ValueError:
        return False


SAFE_TEMP_DIR: str = os.path.realpath(tempfile.gettempdir())


def _is_safe_path(path: str) -> bool:
    """Return True only if path resolves inside the OS temp directory."""
    resolved = os.path.realpath(path)
    return resolved.startswith(SAFE_TEMP_DIR + os.sep)


def _safe_float(value, default: float, min_v: float, max_v: float) -> float:
    """Parse float from form input, clamp to valid range, never raise."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    return max(min_v, min(max_v, v))


# P0: Strict output format whitelist
ALLOWED_OUTPUT_FORMATS: frozenset = frozenset({"mp3", "wav", "flac", "ogg", "m4a"})

MAX_UPLOAD_BYTES: int = 100 * 1024 * 1024  # 100 MB


# ════════════════════════════════════════════════════════════════════
# In-memory job store
# ════════════════════════════════════════════════════════════════════
_jobs: dict = {}


def _run_conversion(job_id: str, input_path: str, output_path: str, params: dict, effect_chain: list = None) -> None:
    """Background thread target: run pipeline and update job state."""

    class _JobProgressCallback:
        """Adapter: feeds pipeline step updates into the job store."""
        def __init__(self, jid: str) -> None:
            self.job_id = jid

        def on_step(self, step_idx: int, total_steps: int, step_name: str) -> None:
            progress = int((step_idx / total_steps) * 100)
            _jobs[self.job_id]["progress"] = progress
            _jobs[self.job_id]["step"]     = step_name

    cb = _JobProgressCallback(job_id)
    try:
        _jobs[job_id]["status"] = "processing"
        convert_to_8d(
            input_path  = input_path,
            output_path = output_path,
            pan_speed   = params.get("speed",   DEFAULT_PARAMS["speed"]),
            pan_depth   = params.get("depth",   DEFAULT_PARAMS["depth"]),
            room_size   = params.get("room",    DEFAULT_PARAMS["room"]),
            wet_level   = params.get("wet",     DEFAULT_PARAMS["wet"]),
            damping     = params.get("damping", DEFAULT_PARAMS["damping"]),
            progress_callback = cb.on_step,
            effect_chain = effect_chain,
        )
        _jobs[job_id]["status"]      = "done"
        _jobs[job_id]["progress"]    = 100
        _jobs[job_id]["output_path"] = output_path
        logger.info("job=%s completed", job_id[:8])
    except Exception as e:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"]  = str(e)
        logger.error("job=%s failed: %s", job_id[:8], e)
        # Clean up output file on error
        if os.path.exists(output_path):
            try:
                os.unlink(output_path)
            except OSError:
                pass
    finally:
        # Always clean up input temp file
        if os.path.exists(input_path):
            os.unlink(input_path)


# ════════════════════════════════════════════════════════════════════
# Routes
# ════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    """Serve the frontend."""
    return send_file("web/index.html")


@app.route("/convert", methods=["POST"])
def start_conversion():
    """
    POST /convert
    Form fields:
      - file       : audio file (multipart)
      - format     : output format extension (e.g., "mp3", "wav")
      - speed      : float
      - depth      : float
      - room       : float
      - wet        : float
      - damping    : float
    Returns: { jobId: str }
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded."}), 400

    audio_file = request.files["file"]

    # P0: Magic-byte validation — read header before saving
    header = audio_file.read(16)
    audio_file.seek(0)

    if not _validate_magic_bytes(header):
        logger.warning(
            "upload rejected ip=%s reason=invalid_magic_bytes",
            request.remote_addr,
        )
        return jsonify({"error": "Unsupported or invalid audio file."}), 415

    # P0: Strict output format whitelist
    out_format = request.form.get("format", "wav").lower().strip().lstrip(".")
    if out_format not in ALLOWED_OUTPUT_FORMATS:
        return jsonify({"error": f"Format '{out_format}' is not allowed."}), 400

    # P0: Safe float parsing with clamping
    params: dict = {
        "speed":   _safe_float(request.form.get("speed"),   DEFAULT_PARAMS["speed"],   0.01, 2.0),
        "depth":   _safe_float(request.form.get("depth"),   DEFAULT_PARAMS["depth"],   0.0,  1.0),
        "room":    _safe_float(request.form.get("room"),    DEFAULT_PARAMS["room"],    0.0,  1.0),
        "wet":     _safe_float(request.form.get("wet"),     DEFAULT_PARAMS["wet"],     0.0,  1.0),
        "damping": _safe_float(request.form.get("damping"), DEFAULT_PARAMS["damping"], 0.0,  1.0),
    }

    # Build effect chain from optional effects[] form field
    effect_ids = request.form.getlist("effects[]")
    if not effect_ids:
        effect_ids = request.form.getlist("effects")
    
    effect_chain = None
    if effect_ids:
        # Validate: only registered IDs allowed
        chain = []
        for eid in effect_ids:
            if eid in EFFECT_REGISTRY:
                chain.append(EFFECT_REGISTRY[eid])
            else:
                return jsonify({"error": f"Unknown effect: '{eid}'."}), 400
        effect_chain = chain
    else:
        # Use default chain
        effect_chain = [EFFECT_REGISTRY[eid] for eid in DEFAULT_EFFECT_IDS]

    # P0: Sanitize filename — only use the extension from the safe name
    safe_name  = _sanitize_filename(audio_file.filename or "upload.mp3")
    suffix     = Path(safe_name).suffix or ".mp3"

    # Save uploaded file to temp location
    tmp_fd_in, tmp_in = tempfile.mkstemp(suffix=suffix)
    os.close(tmp_fd_in)
    try:
        audio_file.save(tmp_in)
    except Exception:
        if os.path.exists(tmp_in):
            os.unlink(tmp_in)
        raise

    # P0: Post-save size check
    actual_size = os.path.getsize(tmp_in)
    if actual_size > MAX_UPLOAD_BYTES:
        os.unlink(tmp_in)
        return jsonify({"error": "File too large after save."}), 413
    if actual_size == 0:
        os.unlink(tmp_in)
        return jsonify({"error": "Empty file uploaded."}), 400

    logger.info(
        "upload accepted ip=%s size=%dB format=%s",
        request.remote_addr, actual_size, out_format,
    )

    tmp_fd_out, tmp_out = tempfile.mkstemp(suffix=f".{out_format}")
    os.close(tmp_fd_out)

    job_id: str = str(uuid.uuid4())
    _jobs[job_id] = {
        "status":      "queued",
        "progress":    0,
        "step":        "Waiting to start",
        "output_path": tmp_out,
        "error":       None,
    }

    thread = threading.Thread(
        target=_run_conversion,
        args=(job_id, tmp_in, tmp_out, params, effect_chain),
        daemon=True,
    )
    thread.start()

    return jsonify({"jobId": job_id}), 202


@app.route("/status/<job_id>", methods=["GET"])
def get_status(job_id: str):
    """
    GET /status/<jobId>
    Returns: { status, progress, step, error }
    """
    # P0: Validate job ID as UUID4
    if not _is_valid_job_id(job_id):
        return jsonify({"error": "Invalid job ID."}), 400

    job = _jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404
    return jsonify({
        "status":   job["status"],
        "progress": job["progress"],
        "step":     job["step"],
        "error":    job["error"],
    })


@app.route("/download/<job_id>", methods=["GET"])
def download_file(job_id: str):
    """
    GET /download/<jobId>
    Returns the processed audio file as a binary download.
    """
    # P0: Validate job ID as UUID4
    if not _is_valid_job_id(job_id):
        return jsonify({"error": "Invalid job ID."}), 400

    job = _jobs.get(job_id)
    if not job or job["status"] != "done":
        return jsonify({"error": "File not ready."}), 404

    output_path: str = job["output_path"]

    # P0: Path traversal defense — verify file is in temp dir
    if not _is_safe_path(output_path):
        logger.warning("path traversal attempt job=%s path=%s", job_id[:8], output_path)
        return jsonify({"error": "Access denied."}), 403

    if not os.path.exists(output_path):
        return jsonify({"error": "Output file missing."}), 404

    ext: str = Path(output_path).suffix.lstrip(".")
    mimetype: str = {
        "mp3":  "audio/mpeg",
        "wav":  "audio/wav",
        "flac": "audio/flac",
        "ogg":  "audio/ogg",
        "aac":  "audio/aac",
        "m4a":  "audio/mp4",
        "aiff": "audio/aiff",
    }.get(ext, "application/octet-stream")

    # P1: Sanitize download name from query param
    raw_name = request.args.get("name", f"8d_audio.{ext}")
    download_name = _sanitize_filename(raw_name)
    if not download_name:
        download_name = f"8d_audio.{ext}"

    return send_file(
        output_path,
        mimetype=mimetype,
        as_attachment=True,
        download_name=download_name,
    )


# ════════════════════════════════════════════════════════════════════
# Error handlers & Security headers
# ════════════════════════════════════════════════════════════════════

@app.errorhandler(413)
def request_entity_too_large(e):
    return jsonify({"error": "File too large. Maximum size is 100 MB."}), 413


@app.errorhandler(404)
def not_found(e):
    path = request.path
    # Log suspicious path patterns
    suspicious = any(p in path for p in ["..", "etc", "passwd", "wp-admin", ".env"])
    if suspicious:
        logger.warning("suspicious 404 ip=%s path=%s", request.remote_addr, path)
    return jsonify({"error": "Not found."}), 404


@app.errorhandler(Exception)
def handle_exception(e):
    """Generic handler — never leak internal details to client."""
    logger.error("unhandled exception: %s", e, exc_info=True)
    return jsonify({"error": "An internal error occurred."}), 500


@app.after_request
def set_security_headers(response):
    """P1: Add security headers to every response."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "media-src 'self' blob:; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self';"
    )
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=()"
    )
    return response


# ════════════════════════════════════════════════════════════════════
# Entry point
# ════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode, port=5000)
