import logging

from flask import Blueprint, jsonify, redirect, request, url_for

from application.services.conversion_service import get_download_job

from application.services.share_service import create_share_token, resolve_share_token

from infrastructure.web.file_security import is_valid_job_id

share_bp = Blueprint("share", __name__)

logger = logging.getLogger("8d_converter")

@share_bp.route("/api/share/<job_id>", methods=["POST"])

def create_share_link(job_id: str):

    if not is_valid_job_id(job_id):

        return jsonify({"error": "Invalid job ID format."}), 400

    try:

        result = create_share_token(job_id)

    except Exception as error:

        logger.error("share token creation failed: %s", error)

        return jsonify({"error": f"Could not create share link: {str(error)}"}), 500

    if "error" in result:

        return jsonify({"error": result["error"]}), result["status_code"]

    share_url = request.host_url.rstrip("/") + "/s/" + result["token"]

    return jsonify({
        "shareUrl": share_url,
        "expiresAt": result["expires_at"],
        "token": result["token"],
    }), 201

@share_bp.route("/s/<token>", methods=["GET"])

def handle_share_link(token: str):

    job_id = resolve_share_token(token)

    if not job_id:

        return jsonify({"error": "This link has expired or does not exist."}), 410

    job = get_download_job(job_id)

    if not job or job.get("status") != "done":

        return jsonify({"error": "File no longer available."}), 410

    return redirect(url_for("conversion.download_file", job_id=job_id))
