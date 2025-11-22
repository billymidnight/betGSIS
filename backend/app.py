import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app"
            ],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-User-Email", "X-User-Name", "X-User-Role", "ngrok-skip-browser-warning"],
            "supports_credentials": True
        }
    })

    # Register API blueprint
    from api.routes import api_bp
    app.register_blueprint(api_bp)

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok"})

    return app


if __name__ == '__main__':
    app = create_app()
    # Auto-create tables and seed minimal GeoGuessr data if DB is configured
    try:
        from db import engine, SessionLocal  # type: ignore
        from models.base import Base  # type: ignore
        # import all models so they are registered on Base
        import models.player as player_model  # noqa: F401
        import models.player_stats as player_stats_model  # noqa: F401
        import models.line as line_model  # noqa: F401
        import models.sport as sport_model  # noqa: F401

        if engine is not None:
            Base.metadata.create_all(bind=engine)
            # seed data
            session = SessionLocal()
            try:
                # ensure sport
                from models.sport import Sport
                sport = session.query(Sport).filter_by(name='GeoGuessr').first()
                if not sport:
                    sport = Sport(name='GeoGuessr', code='GEO')
                    session.add(sport)
                    session.flush()

                # seed players with stable ids and handles
                from models.player import Player
                existing = {p.id: p for p in session.query(Player).filter(Player.id.in_([1,2,3,4])).all()}

                players_to_seed = [
                    (1, 'Pam', 'SPECIAL ONE'),
                    (2, 'Sohan', 'MaddoxX'),
                    (3, 'Pritesh', 'EnchantingCity274'),
                    (4, 'Naresh', 'Diggy Patnayak'),
                ]
                for pid, name, handle in players_to_seed:
                    if pid in existing:
                        p = existing[pid]
                        p.name = name
                        p.handle = handle
                    else:
                        p = Player(id=pid, sport_id=sport.id, name=name, handle=handle)
                        session.add(p)

                session.flush()

                # seed player_stats
                from models.player_stats import upsert_player_stats
                stats_seed = {
                    1: (14880.0, 2400.0, 6),
                    2: (16500.0, 2092.0, 6),
                    3: (15111.0, 2900.0, 6),
                    4: (12400.0, 4800.0, 6),
                }
                for pid, (mean, stddev, sample) in stats_seed.items():
                    variance = stddev * stddev
                    try:
                        upsert_player_stats(session, pid, float(mean), float(stddev), float(variance), int(sample))
                    except Exception:
                        pass

                session.commit()
            finally:
                session.close()
    except Exception:
        # DB not configured or other error; continue without seeding
        pass

    port = int(os.getenv('PORT', 4000))
    app.run(host='0.0.0.0', port=port, debug=True)
