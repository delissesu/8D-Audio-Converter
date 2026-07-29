import logging

from pathlib import Path

from flask import Blueprint, jsonify, request, send_file

from adapters.web.request_parsers import (
    parse_conversion_params,
    parse_effect_ids,
    parse_output_format,
    save_valid_upload,
)

from application.services.batch_service import (
    create_batch,
    get_batch_download_results,
    get_batch_status_data,
)

from application.services.effect_registry import build_effect_chain

from infrastructure.web.file_security import is_valid_job_id

from infrastructure.web.zip_builder import build_batch_zip

batch_bp = Blueprint("batch", __name__)

logger = logging.getLogger("8d_converter")

@batch_bp.route("/batch-convert", methods=["POST"])

def start_batch_conversion():

    files = request.files.getlist("files[]") or request.files.getlist("files")

    if not files:

        return jsonify({"error": "No files uploaded."}), 400

    if len(files) > 20:

        return jsonify({"error": "Maximum 20 files per batch."}), 400

    out_format, format_error = parse_output_format(request.form, "mp3")

    if format_error:

        return jsonify({"error": format_error}), 400

    try:

        effect_chain = build_effect_chain(parse_effect_ids(request.form))

    except ValueError as error:

        return jsonify({"error": str(error)}), 400

    params = parse_conversion_params(request.form)

    jobs = []

    for audio_file in files:

        tmp_in, safe_name, upload_error, _actual_size = save_valid_upload(audio_file)

        if upload_error:

            logger.warning("batch upload rejected ip=%s file=%s reason=%s", request.remote_addr, audio_file.filename, upload_error)

            continue

        jobs.append({
            "input_path": tmp_in,
            "filename": Path(safe_name).stem,
            "params": params,
            "effect_chain": effect_chain,
        })

    if not jobs:

        return jsonify({"error": "No valid audio files in batch."}), 400

    batch_id, job_ids = create_batch(jobs, out_format)

    logger.info("batch accepted ip=%s batch=%s files=%d format=%s", request.remote_addr, batch_id[:8], len(job_ids), out_format)

    return jsonify({"batchId": batch_id, "jobIds": job_ids}), 202

@batch_bp.route("/batch-status/<batch_id>", methods=["GET"])

def get_batch_status(batch_id: str):

    if not is_valid_job_id(batch_id):

        return jsonify({"error": "Invalid batch ID."}), 400

    status = get_batch_status_data(batch_id)

    if not status:

        return jsonify({"error": "Batch not found."}), 404

    return jsonify(status)

@batch_bp.route("/batch-download/<batch_id>", methods=["GET"])

def download_batch(batch_id: str):

    if not is_valid_job_id(batch_id):

        return jsonify({"error": "Invalid batch ID."}), 400

    batch, results, any_done = get_batch_download_results(batch_id)

    if not batch:

        return jsonify({"error": "Batch not found."}), 404

    if not any_done:

        return jsonify({"error": "No completed files yet."}), 202

    zip_buffer = build_batch_zip(results, batch["format"])

    return send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="8d_audio_batch.zip",
    )
