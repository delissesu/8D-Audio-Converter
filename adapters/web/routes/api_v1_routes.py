import os

from functools import wraps

from flask import Blueprint, jsonify, request

from adapters.web.openapi_spec import OPENAPI_SPEC

from adapters.web.routes.conversion_routes import download_file, get_status, start_conversion

api_v1 = Blueprint("api_v1", __name__, url_prefix="/api/v1")

def require_api_key(handler):

    @wraps(handler)

    def decorated(*args, **kwargs):

        expected_key = os.environ.get("API_KEY")

        if expected_key:

            auth_header = request.headers.get("Authorization")

            if not auth_header or not auth_header.startswith("Bearer "):

                return jsonify({"error": "Unauthorized. Missing Bearer token."}), 401

            token = auth_header.split(" ")[1]

            if token != expected_key:

                return jsonify({"error": "Unauthorized. Invalid API key."}), 403

        return handler(*args, **kwargs)

    return decorated

@api_v1.route("/convert", methods=["POST"])

@require_api_key

def api_convert():

    return start_conversion()

@api_v1.route("/status/<job_id>", methods=["GET"])

@require_api_key

def api_status(job_id):

    return get_status(job_id)

@api_v1.route("/download/<job_id>", methods=["GET"])

@require_api_key

def api_download(job_id):

    return download_file(job_id)

@api_v1.route("/openapi.json")

def api_openapi_spec():

    return jsonify(OPENAPI_SPEC)
