# server.py
import os
import uuid
import threading
import tempfile
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

from converter.core import convert_to_8d
from converter.utils import SUPPORTED_OUTPUT_FORMATS

app = Flask(__name__, static_folder="web", static_url_path="")
CORS(app)

# In-memory job store — maps job_id → job state dict
# Structure: { status, progress, step, output_path, error }
_jobs : dict = {}


def _run_conversion(job_id: str, input_path: str, output_path: str, params: dict) -> None:
    """Background thread target: run pipeline and update job state."""

    class _JobProgressCallback:
        """Adapter: feeds pipeline step updates into the job store. (DIP)"""
        def __init__(self, job_id: str) -> None:
            self.job_id    : str = job_id
            self.steps     : list[str] = [
                "Loading audio file",
                "Applying auto-panning",
                "Applying reverb",
                "Normalizing audio",
                "Exporting to target format",
            ]
            self.current   : int = 0

        def on_step(self, step_index: int) -> None:
            _jobs[self.job_id]["progress"] = int((step_index / len(self.steps)) * 100)
            _jobs[self.job_id]["step"]     = self.steps[step_index]

    cb = _JobProgressCallback(job_id)
    try:
        _jobs[job_id]["status"] = "processing"
        convert_to_8d(
            input_path  = input_path,
            output_path = output_path,
            pan_speed   = params.get("speed",   0.15),
            pan_depth   = params.get("depth",   1.0),
            room_size   = params.get("room",    0.4),
            wet_level   = params.get("wet",     0.3),
            damping     = params.get("damping", 0.5),
            verbose     = False,
        )
        _jobs[job_id]["status"]      = "done"
        _jobs[job_id]["progress"]    = 100
        _jobs[job_id]["output_path"] = output_path
    except Exception as e:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"]  = str(e)
    finally:
        if os.path.exists(input_path):
            os.unlink(input_path)


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

    audio_file  = request.files["file"]
    out_format  = request.form.get("format", "wav").lower().strip(".")

    if f".{out_format}" not in SUPPORTED_OUTPUT_FORMATS:
        return jsonify({"error": f"Unsupported format: .{out_format}"}), 400

    params : dict = {
        "speed"  : float(request.form.get("speed",   0.15)),
        "depth"  : float(request.form.get("depth",   1.0)),
        "room"   : float(request.form.get("room",    0.4)),
        "wet"    : float(request.form.get("wet",     0.3)),
        "damping": float(request.form.get("damping", 0.5)),
    }

    # Save uploaded file to temp location
    suffix       : str = Path(audio_file.filename).suffix or ".mp3"
    tmp_fd_in, tmp_in = tempfile.mkstemp(suffix=suffix)
    os.close(tmp_fd_in)
    audio_file.save(tmp_in)

    tmp_fd_out, tmp_out = tempfile.mkstemp(suffix=f".{out_format}")
    os.close(tmp_fd_out)

    job_id : str = str(uuid.uuid4())
    _jobs[job_id] = {
        "status"     : "queued",
        "progress"   : 0,
        "step"       : "Waiting to start",
        "output_path": tmp_out,
        "error"      : None,
    }

    thread = threading.Thread(
        target=_run_conversion,
        args=(job_id, tmp_in, tmp_out, params),
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
    job = _jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404
    return jsonify({
        "status"  : job["status"],
        "progress": job["progress"],
        "step"    : job["step"],
        "error"   : job["error"],
    })


@app.route("/download/<job_id>", methods=["GET"])
def download_file(job_id: str):
    """
    GET /download/<jobId>
    Returns the processed audio file as a binary download.
    """
    job = _jobs.get(job_id)
    if not job or job["status"] != "done":
        return jsonify({"error": "File not ready."}), 404
    output_path : str = job["output_path"]
    if not os.path.exists(output_path):
        return jsonify({"error": "Output file missing."}), 404
    ext      : str = Path(output_path).suffix.lstrip(".")
    mimetype : str = {
        "mp3" : "audio/mpeg",
        "wav" : "audio/wav",
        "flac": "audio/flac",
        "ogg" : "audio/ogg",
        "aac" : "audio/aac",
        "m4a" : "audio/mp4",
        "aiff": "audio/aiff",
    }.get(ext, "application/octet-stream")
    return send_file(
        output_path,
        mimetype=mimetype,
        as_attachment=True,
        download_name=f"8d_audio.{ext}",
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
