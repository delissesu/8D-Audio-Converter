import logging

import os

from flask import Flask, current_app

from flask_cors import CORS

from adapters.web.error_handlers import register_error_handlers

from adapters.web.routes.api_v1_routes import api_v1

from adapters.web.routes.batch_routes import batch_bp

from adapters.web.routes.conversion_routes import conversion_bp

from adapters.web.routes.share_routes import share_bp

from adapters.web.security_headers import register_security_headers

def create_app() -> Flask:

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    app = Flask(__name__, static_folder="../../web", static_url_path="")

    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

    app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or os.urandom(32)

    CORS(app, resources={
        r"/convert": {"origins": ["http://localhost:5000", "http://127.0.0.1:5000"]},
        r"/status/*": {"origins": ["http://localhost:5000", "http://127.0.0.1:5000"]},
        r"/download/*": {"origins": ["http://localhost:5000", "http://127.0.0.1:5000"]},
    })

    @app.route("/")

    def index():

        return current_app.send_static_file("index.html")

    app.register_blueprint(conversion_bp)

    app.register_blueprint(batch_bp)

    app.register_blueprint(share_bp)

    app.register_blueprint(api_v1)

    register_error_handlers(app)

    register_security_headers(app)

    return app
