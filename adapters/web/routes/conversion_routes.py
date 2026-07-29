import logging

import os

from pathlib import Path

from flask import Blueprint, jsonify, request, send_file

from adapters.web.request_parsers import (
    parse_conversion_params,
    parse_effect_ids,
    parse_output_format,
    save_valid_upload,
)

from application.services.conversion_service import (
    create_conversion_job,
    get_download_job,
    get_job_status,
)

from application.services.effect_registry import build_effect_chain

from infrastructure.web.file_security import (
    get_audio_mimetype,
    is_safe_path,
    is_valid_job_id,
    sanitize_filename,
)

conversion_bp = Blueprint("conversion", __name__)

logger = logging.getLogger("8d_converter")

@conversion_bp.route("/convert", methods=["POST"])

def start_conversion():

    if "file" not in request.files:

        return jsonify({"error": "No file uploaded."}), 400

    out_format, format_error = parse_output_format(request.form, "wav")

    if format_error:

        return jsonify({"error": format_error}), 400

    try:

        effect_chain = build_effect_chain(parse_effect_ids(request.form))

    except ValueError as error:

        return jsonify({"error": str(error)}), 400

    tmp_in, _safe_name, upload_error, actual_size = save_valid_upload(request.files["file"])

    if upload_error:

        status = 415 if "invalid" in upload_error else 413 if "large" in upload_error else 400

        logger.warning("upload rejected ip=%s reason=%s", request.remote_addr, upload_error)

        return jsonify({"error": upload_error}), status

    logger.info("upload accepted ip=%s size=%dB format=%s", request.remote_addr, actual_size, out_format)

    params = parse_conversion_params(request.form, include_trim=True)

    job_id = create_conversion_job(tmp_in, out_format, params, effect_chain)

    return jsonify({"jobId": job_id}), 202

@conversion_bp.route("/status/<job_id>", methods=["GET"])

def get_status(job_id: str):

    if not is_valid_job_id(job_id):

        return jsonify({"error": "Invalid job ID."}), 400

    status = get_job_status(job_id)

    if not status:

        return jsonify({"error": "Job not found."}), 404

    return jsonify(status)

@conversion_bp.route("/download/<job_id>", methods=["GET"])

def download_file(job_id: str):

    if not is_valid_job_id(job_id):

        return jsonify({"error": "Invalid job ID."}), 400

    job = get_download_job(job_id)

    if not job or job["status"] != "done":

        return jsonify({"error": "File not ready."}), 404

    output_path = job["output_path"]

    if not is_safe_path(output_path):

        logger.warning("path traversal attempt job=%s path=%s", job_id[:8], output_path)

        return jsonify({"error": "Access denied."}), 403

    if not os.path.exists(output_path):

        return jsonify({"error": "File has expired. Please convert again."}), 410

    ext = Path(output_path).suffix.lstrip(".")

    raw_name = request.args.get("name", f"8d_audio.{ext}")

    download_name = sanitize_filename(raw_name) or f"8d_audio.{ext}"

    return send_file(
        output_path,
        mimetype=get_audio_mimetype(ext),
        as_attachment=True,
        download_name=download_name,
    )
