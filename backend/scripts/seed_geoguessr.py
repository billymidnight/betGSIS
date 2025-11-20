"""
Seed GeoGuessr sport, players and initial player_stats, then compute initial lines.
Run: python -m backend.scripts.seed_geoguessr (or from project root: python backend/scripts/seed_geoguessr.py)
"""
from db import get_session
from models.sport import Sport
from models.player import Player
from models.player_stats import upsert_player_stats
from services.pricing_service import recompute_all_lines

PLAYERS = [
    {'name': 'Pam', 'handle': 'SPECIAL_ONE', 'mean': 14800, 'stddev': 2900},
    {'name': 'Pritesh', 'handle': 'EnchantingCity274', 'mean': 13950, 'stddev': 3200},
    {'name': 'Sohan', 'handle': 'MaddoxX', 'mean': 17450, 'stddev': 4000},
    {'name': 'Naresh', 'handle': 'Diggy_Patnayak', 'mean': 12850, 'stddev': 5000},
]


def seed():
    session = get_session()
    try:
        sport = session.query(Sport).filter_by(name='GeoGuessr').first()
        if not sport:
            sport = Sport(name='GeoGuessr', code='GEO')
            session.add(sport)
            session.flush()

        for p in PLAYERS:
            existing = session.query(Player).filter_by(name=p['name'], sport_id=sport.id).first()
            if not existing:
                existing = Player(name=p['name'], handle=p['handle'], sport_id=sport.id)
                session.add(existing)
                session.flush()

            variance = p['stddev'] * p['stddev']
            upsert_player_stats(session, existing.id, float(p['mean']), float(p['stddev']), float(variance), 30)

        session.commit()

        # recompute lines using new stats
        res = recompute_all_lines(session=session, thresholds=list(range(7500, 23001, 500)), margin_bps=0)
        session.commit()
        print('Seed complete:', res)
    except Exception as e:
        session.rollback()
        print('Seed failed:', e)
    finally:
        session.close()


if __name__ == '__main__':
    seed()
