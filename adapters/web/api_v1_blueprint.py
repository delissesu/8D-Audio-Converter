# adapters/web/api_v1_blueprint.py
# REST API Blueprint for programmatic access.

import os
from functools import wraps
from flask import Blueprint, request, jsonify, current_app

api_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')

# Simple API Key auth
def require_api_key(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Look for API_KEY env var; if not set, API is open (for local dev)
        expected_key = os.environ.get("API_KEY")
        if expected_key:
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                return jsonify({"error": "Unauthorized. Missing Bearer token."}), 401
            token = auth_header.split(" ")[1]
            if token != expected_key:
                return jsonify({"error": "Unauthorized. Invalid API key."}), 403
        return f(*args, **kwargs)
    return decorated

@api_v1.route('/convert', methods=['POST'])
@require_api_key
def api_convert():
    """
    POST /api/v1/convert
    Expects multipart/form-data with 'file'.
    Returns JSON with jobId.
    """
    # Simply forward to the main app's conversion logic
    from server import start_conversion
    return start_conversion()

@api_v1.route('/status/<job_id>', methods=['GET'])
@require_api_key
def api_status(job_id):
    """
    GET /api/v1/status/<job_id>
    """
    from server import get_status
    return get_status(job_id)

@api_v1.route('/download/<job_id>', methods=['GET'])
@require_api_key
def api_download(job_id):
    """
    GET /api/v1/download/<job_id>
    """
    from server import download_file
    return download_file(job_id)
