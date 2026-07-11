import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-User-Email", "X-User-Name", "X-User-Role", "X-Access-Key", "ngrok-skip-browser-warning"],
            "supports_credentials": True
        },
        r"/sopranos/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET"],
            "allow_headers": ["Content-Type"],
            "supports_credentials": False
        },
        r"/api/trading/breakingbad/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-User-Email", "X-User-Name", "X-User-Role"],
            "supports_credentials": False
        },
        r"/api/trading/harrypotter/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-User-Email", "X-User-Name", "X-User-Role"],
            "supports_credentials": False
        },
        r"/api/trading/goodshepherd/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-User-Email", "X-User-Name", "X-User-Role"],
            "supports_credentials": False
        },
        r"/api/trading/gameofthrones/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-User-Email", "X-User-Name", "X-User-Role"],
            "supports_credentials": False
        },
        r"/gameofthrones/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": False
        },
        r"/breakingbad/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": False
        },
        r"/harrypotter/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": False
        },
        r"/goodshepherd/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://betgsis2.vercel.app",
                "https://betgsis2-qfq97111j-priteshs-projects-d318466e.vercel.app",
                "https://betgsis-backend.onrender.com"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": False
        }
    })

    # Register API blueprint
    from api.routes import api_bp
    app.register_blueprint(api_bp)
    
    # Register trading blueprint
    from routes.trading import trading_bp
    app.register_blueprint(trading_bp)
    
    # Register breaking bad trading blueprint
    from routes.breakingbad import breakingbad_bp
    app.register_blueprint(breakingbad_bp)
    
    # Register harry potter trading blueprint
    from routes.harrypotter import harrypotter_bp
    app.register_blueprint(harrypotter_bp)
    
    # Register good shepherd trading blueprint
    from routes.goodshepherd import goodshepherd_bp
    app.register_blueprint(goodshepherd_bp)

    # Register game of thrones trading blueprint
    from routes.gameofthrones import gameofthrones_bp
    app.register_blueprint(gameofthrones_bp)

    # Register leaderboard blueprint (access-key gated stats pages)
    from routes.leaderboard import leaderboard_bp
    app.register_blueprint(leaderboard_bp)

    # Register Dammox birthday tribute blueprint
    from routes.dammox import dammox_bp
    app.register_blueprint(dammox_bp)

    # Register racing blueprint (Horse Racing — offline / Churchill Downs)
    from routes.racing import racing_bp
    app.register_blueprint(racing_bp)

    # Register Cheltenham blueprint (pari-mutuel sessions on the same horses)
    from routes.cheltenham import cheltenham_bp
    app.register_blueprint(cheltenham_bp)

    from routes.fifa import fifa_bp
    app.register_blueprint(fifa_bp)


    # Serve Sopranos character images
    @app.route('/sopranos/<path:filename>')
    def serve_sopranos_image(filename):
        sopranos_dir = os.path.join(os.path.dirname(__file__), 'sopranos')
        return send_from_directory(sopranos_dir, filename)
    
    # Serve Breaking Bad character images
    @app.route('/breakingbad/<path:filename>')
    def serve_breakingbad_image(filename):
        breakingbad_dir = os.path.join(os.path.dirname(__file__), 'breakingbad')
        return send_from_directory(breakingbad_dir, filename)
    
    # Serve Harry Potter character images
    @app.route('/harrypotter/<path:filename>')
    def serve_harrypotter_image(filename):
        harrypotter_dir = os.path.join(os.path.dirname(__file__), 'harrypotter')
        return send_from_directory(harrypotter_dir, filename)
    
    # Serve Good Shepherd student images
    @app.route('/goodshepherd/<path:filename>')
    def serve_goodshepherd_image(filename):
        goodshepherd_dir = os.path.join(os.path.dirname(__file__), 'goodshepherd')
        return send_from_directory(goodshepherd_dir, filename)

    # Serve Game of Thrones character images (+ gotmainbg.jpg thumbnail)
    @app.route('/gameofthrones/<path:filename>')
    def serve_gameofthrones_image(filename):
        gameofthrones_dir = os.path.join(os.path.dirname(__file__), 'gameofthrones')
        return send_from_directory(gameofthrones_dir, filename)

    # Serve Horse Racing assets (track bg + venue thumbnails + horse art)
    @app.route('/horses/<path:filename>')
    def serve_horse_image(filename):
        horses_dir = os.path.join(os.path.dirname(__file__), 'horses')
        return send_from_directory(horses_dir, filename)

    # Serve Dammox birthday tribute assets
    @app.route('/yayabday/<path:filename>')
    def serve_yayabday_image(filename):
        yayabday_dir = os.path.join(os.path.dirname(__file__), 'yayabday')
        return send_from_directory(yayabday_dir, filename)

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

# Expose app for gunicorn
app = create_app()
