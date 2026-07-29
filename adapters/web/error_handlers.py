import logging

from flask import jsonify, request

logger = logging.getLogger("8d_converter")

def register_error_handlers(app):

    @app.errorhandler(413)

    def request_entity_too_large(_error):

        return jsonify({"error": "File too large. Maximum size is 100 MB."}), 413

    @app.errorhandler(404)

    def not_found(_error):

        path = request.path

        suspicious = any(pattern in path for pattern in ["..", "etc", "passwd", "wp-admin", ".env"])

        if suspicious:

            logger.warning("suspicious 404 ip=%s path=%s", request.remote_addr, path)

        return jsonify({"error": "Not found."}), 404

    @app.errorhandler(Exception)

    def handle_exception(error):

        logger.error("unhandled exception: %s", error, exc_info=True)

        return jsonify({"error": "An internal error occurred."}), 500
