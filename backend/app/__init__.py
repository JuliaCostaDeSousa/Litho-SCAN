from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
from app.api.rocks_infos import rocks_bp

def create_app():
    load_dotenv()
    app = Flask(__name__)
    CORS(app)

    app.config['JSON_AS_ASCII'] = False

    @app.get("/health")
    def health():
        return {"status": "ok"}, 200

    app.register_blueprint(rocks_bp)

    return app
