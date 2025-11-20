from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.sql import func
from .base import Base
from db import query


class PlayerPoints(Base):
    __tablename__ = 'player_points'
    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey('games.id'), nullable=False)
    player_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    points = Column(Integer, nullable=False)
    inserted_at = Column(DateTime(timezone=True), server_default=func.now())


def insert_player_points_bulk(session, game_id, player_id, pts):
    pp = PlayerPoints(game_id=game_id, player_id=player_id, points=int(pts))
    session.add(pp)


def get_points_for_player(player_id):
    rows = query('SELECT points FROM player_points WHERE player_id = %s ORDER BY inserted_at', (player_id,))
    if not rows:
        return []
    return [r['points'] for r in rows]
