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

# ── API Blueprint Registration ─────────────────────────────────────────
from adapters.web.api_v1_blueprint import api_v1
app.register_blueprint(api_v1)

import adapters.web.openapi_spec as openapi_spec
@app.route("/api/v1/openapi.json")
def get_openapi_spec():
    return jsonify(openapi_spec.OPENAPI_SPEC)

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
            trim_start  = params.get("trim_start", 0.0),
            trim_end    = params.get("trim_end",   0.0),
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
        "speed":      _safe_float(request.form.get("speed"),      DEFAULT_PARAMS["speed"],   0.01, 2.0),
        "depth":      _safe_float(request.form.get("depth"),      DEFAULT_PARAMS["depth"],   0.0,  1.0),
        "room":       _safe_float(request.form.get("room"),       DEFAULT_PARAMS["room"],    0.0,  1.0),
        "wet":        _safe_float(request.form.get("wet"),        DEFAULT_PARAMS["wet"],     0.0,  1.0),
        "damping":    _safe_float(request.form.get("damping"),    DEFAULT_PARAMS["damping"], 0.0,  1.0),
        "trim_start": _safe_float(request.form.get("trim_start"), 0.0, 0.0, 3600.0),
        "trim_end":   _safe_float(request.form.get("trim_end"),   0.0, 0.0, 3600.0),
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
# Batch Conversion
# ════════════════════════════════════════════════════════════════════

_batches: dict = {}   # batchId → { job_ids, format, filenames, status }


def _run_batch_sequential(batch_id: str) -> None:
    """Run all jobs in a batch sequentially (not parallel) to avoid OOM."""
    batch = _batches.get(batch_id)
    if not batch:
        return

    batch["status"] = "processing"

    for job_id in batch["job_ids"]:
        job = _jobs.get(job_id)
        if not job:
            continue

        # Run conversion synchronously in this thread
        input_path = job.get("input_path")
        output_path = job.get("output_path")
        params = job.get("params", {})
        effect_chain = job.get("effect_chain")

        class _BatchJobProgressCallback:
            def __init__(self, jid: str) -> None:
                self.job_id = jid
            def on_step(self, step_idx: int, total_steps: int, step_name: str) -> None:
                progress = int((step_idx / total_steps) * 100)
                _jobs[self.job_id]["progress"] = progress
                _jobs[self.job_id]["step"] = step_name

        cb = _BatchJobProgressCallback(job_id)
        try:
            _jobs[job_id]["status"] = "processing"
            convert_to_8d(
                input_path=input_path,
                output_path=output_path,
                pan_speed=params.get("speed", DEFAULT_PARAMS["speed"]),
                pan_depth=params.get("depth", DEFAULT_PARAMS["depth"]),
                room_size=params.get("room", DEFAULT_PARAMS["room"]),
                wet_level=params.get("wet", DEFAULT_PARAMS["wet"]),
                damping=params.get("damping", DEFAULT_PARAMS["damping"]),
                progress_callback=cb.on_step,
                effect_chain=effect_chain,
            )
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["progress"] = 100
            logger.info("batch=%s job=%s completed", batch_id[:8], job_id[:8])
        except Exception as e:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = str(e)
            logger.error("batch=%s job=%s failed: %s", batch_id[:8], job_id[:8], e)
            # Clean up output on error
            if os.path.exists(output_path):
                try:
                    os.unlink(output_path)
                except OSError:
                    pass
        finally:
            # Always clean up input temp file
            if input_path and os.path.exists(input_path):
                try:
                    os.unlink(input_path)
                except OSError:
                    pass

    batch["status"] = "done"


@app.route("/batch-convert", methods=["POST"])
def start_batch_conversion():
    """
    POST /batch-convert
    Form fields:
      - files[]   : multiple audio files (multipart)
      - format    : output format extension
      - speed, depth, room, wet, damping : floats
      - effects[] : optional effect IDs
    Returns: { batchId, jobIds: string[] }
    """
    files = request.files.getlist("files[]")
    if not files:
        files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    if len(files) > 20:
        return jsonify({"error": "Maximum 20 files per batch."}), 400

    # Parse output format
    out_format = request.form.get("format", "mp3").lower().strip().lstrip(".")
    if out_format not in ALLOWED_OUTPUT_FORMATS:
        return jsonify({"error": f"Format '{out_format}' is not allowed."}), 400

    # Parse params
    params: dict = {
        "speed":   _safe_float(request.form.get("speed"),   DEFAULT_PARAMS["speed"],   0.01, 2.0),
        "depth":   _safe_float(request.form.get("depth"),   DEFAULT_PARAMS["depth"],   0.0,  1.0),
        "room":    _safe_float(request.form.get("room"),    DEFAULT_PARAMS["room"],    0.0,  1.0),
        "wet":     _safe_float(request.form.get("wet"),     DEFAULT_PARAMS["wet"],     0.0,  1.0),
        "damping": _safe_float(request.form.get("damping"), DEFAULT_PARAMS["damping"], 0.0,  1.0),
    }

    # Build effect chain
    effect_ids = request.form.getlist("effects[]")
    if not effect_ids:
        effect_ids = request.form.getlist("effects")

    effect_chain = None
    if effect_ids:
        chain = []
        for eid in effect_ids:
            if eid in EFFECT_REGISTRY:
                chain.append(EFFECT_REGISTRY[eid])
            else:
                return jsonify({"error": f"Unknown effect: '{eid}'."}), 400
        effect_chain = chain
    else:
        effect_chain = [EFFECT_REGISTRY[eid] for eid in DEFAULT_EFFECT_IDS]

    batch_id: str = str(uuid.uuid4())
    job_ids: list[str] = []
    filenames: list[str] = []

    for audio_file in files:
        # Validate magic bytes
        header = audio_file.read(16)
        audio_file.seek(0)

        if not _validate_magic_bytes(header):
            logger.warning(
                "batch upload rejected ip=%s file=%s reason=invalid_magic_bytes",
                request.remote_addr, audio_file.filename,
            )
            continue  # Skip invalid files, don't abort entire batch

        safe_name = _sanitize_filename(audio_file.filename or "upload.mp3")
        suffix = Path(safe_name).suffix or ".mp3"

        # Save input to temp
        tmp_fd_in, tmp_in = tempfile.mkstemp(suffix=suffix)
        os.close(tmp_fd_in)
        try:
            audio_file.save(tmp_in)
        except Exception:
            if os.path.exists(tmp_in):
                os.unlink(tmp_in)
            continue

        # Size check
        actual_size = os.path.getsize(tmp_in)
        if actual_size > MAX_UPLOAD_BYTES or actual_size == 0:
            os.unlink(tmp_in)
            continue

        # Create output temp file
        tmp_fd_out, tmp_out = tempfile.mkstemp(suffix=f".{out_format}")
        os.close(tmp_fd_out)

        job_id = str(uuid.uuid4())
        _jobs[job_id] = {
            "status": "queued",
            "progress": 0,
            "step": "Waiting to start",
            "output_path": tmp_out,
            "input_path": tmp_in,
            "params": params,
            "effect_chain": effect_chain,
            "error": None,
        }

        job_ids.append(job_id)
        filenames.append(Path(safe_name).stem)

    if not job_ids:
        return jsonify({"error": "No valid audio files in batch."}), 400

    _batches[batch_id] = {
        "job_ids": job_ids,
        "format": out_format,
        "filenames": filenames,
        "status": "processing",
    }

    logger.info(
        "batch accepted ip=%s batch=%s files=%d format=%s",
        request.remote_addr, batch_id[:8], len(job_ids), out_format,
    )

    # Run batch in a background thread (sequential within)
    thread = threading.Thread(
        target=_run_batch_sequential,
        args=(batch_id,),
        daemon=True,
    )
    thread.start()

    return jsonify({"batchId": batch_id, "jobIds": job_ids}), 202


@app.route("/batch-status/<batch_id>", methods=["GET"])
def get_batch_status(batch_id: str):
    """
    GET /batch-status/<batchId>
    Returns: { total, done, failed, status, jobs: [{jobId, status, progress, step, error}] }
    """
    if not _is_valid_job_id(batch_id):
        return jsonify({"error": "Invalid batch ID."}), 400

    batch = _batches.get(batch_id)
    if not batch:
        return jsonify({"error": "Batch not found."}), 404

    jobs_info = []
    done_count = 0
    failed_count = 0

    for i, job_id in enumerate(batch["job_ids"]):
        job = _jobs.get(job_id, {})
        job_status = job.get("status", "unknown")

        if job_status == "done":
            done_count += 1
        elif job_status == "error":
            failed_count += 1

        jobs_info.append({
            "jobId": job_id,
            "filename": batch["filenames"][i] if i < len(batch["filenames"]) else "",
            "status": job_status,
            "progress": job.get("progress", 0),
            "step": job.get("step", ""),
            "error": job.get("error"),
        })

    return jsonify({
        "batchId": batch_id,
        "total": len(batch["job_ids"]),
        "done": done_count,
        "failed": failed_count,
        "status": batch["status"],
        "jobs": jobs_info,
    })


@app.route("/batch-download/<batch_id>", methods=["GET"])
def download_batch(batch_id: str):
    """
    GET /batch-download/<batchId>
    Returns: ZIP file with all completed conversions, or 202 if still processing.
    """
    if not _is_valid_job_id(batch_id):
        return jsonify({"error": "Invalid batch ID."}), 400

    batch = _batches.get(batch_id)
    if not batch:
        return jsonify({"error": "Batch not found."}), 404

    # Check if at least some jobs are done
    results = []
    all_done = True
    any_done = False

    for i, job_id in enumerate(batch["job_ids"]):
        job = _jobs.get(job_id, {})
        status = job.get("status", "unknown")

        if status not in ("done", "error"):
            all_done = False

        if status == "done":
            any_done = True

        results.append({
            "filename": batch["filenames"][i] if i < len(batch["filenames"]) else f"track_{i+1}",
            "output_path": job.get("output_path", ""),
            "status": status,
        })

    if not any_done:
        return jsonify({"error": "No completed files yet."}), 202

    # Build ZIP
    from infrastructure.web.zip_builder import build_batch_zip
    zip_buffer = build_batch_zip(results, batch["format"])

    return send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"8d_audio_batch.zip",
    )


# ════════════════════════════════════════════════════════════════════
# Share Links
# ════════════════════════════════════════════════════════════════════
import secrets
import time
from datetime import datetime, timezone

from infrastructure.link.memory_link_store import MemoryLinkStore
from flask import redirect, url_for

_link_store = MemoryLinkStore()
SHARE_LINK_TTL_SECONDS = int(os.environ.get("SHARE_LINK_TTL_SECONDS", 24 * 60 * 60))

@app.route("/api/share/<job_id>", methods=["POST"])
def create_share_link(job_id: str):
    """
    POST /api/share/<job_id>
    Creates a temporary public link for a completed job.
    """
    if not _is_valid_job_id(job_id):
        return jsonify({"error": "Invalid job ID."}), 400

    job = _jobs.get(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "Job not found or not completed."}), 404

    token = secrets.token_urlsafe(16)
    expires_at = time.time() + SHARE_LINK_TTL_SECONDS
    
    _link_store.create_link(token, job_id, expires_at)
    
    share_url = request.host_url.rstrip("/") + "/s/" + token
    expires_iso = datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat()
    
    return jsonify({
        "shareUrl": share_url,
        "expiresAt": expires_iso
    }), 201

@app.route("/s/<token>", methods=["GET"])
def handle_share_link(token: str):
    """
    GET /s/<token>
    Redirects to the actual download endpoint or returns 410 if expired.
    """
    job_id = _link_store.get_job_id(token)
    if not job_id:
        return jsonify({"error": "This link has expired."}), 410
        
    job = _jobs.get(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "File no longer available."}), 410
        
    return redirect(url_for("download_file", job_id=job_id))

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
        "worker-src 'self' blob:; "
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
