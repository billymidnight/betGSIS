from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base
from db import get_conn


class Player(Base):
    __tablename__ = 'players'
    id = Column(Integer, primary_key=True)
    sport_id = Column(Integer, ForeignKey('sports.id'), nullable=False)
    name = Column(String, nullable=False)
    handle = Column(String, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sport = relationship('Sport')

def get_players_for_sport(sport_name: str):
    # Return list of player dicts for given sport name
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT p.id, p.name, p.handle
                FROM players p
                JOIN sports s ON s.id = p.sport_id
                WHERE s.name = %s
                ORDER BY p.name
                """,
                (sport_name,)
            )
            rows = cur.fetchall()
            return rows
    finally:
        conn.close()


def get_or_create_player_by_name(session, name: str, sport_id: int = 1, handle: str = None):
    # session is SQLAlchemy session
    p = session.query(Player).filter_by(name=name).first()
    if p:
        return p
    if not handle:
        handle = name.lower().replace(' ', '_')
    p = Player(sport_id=sport_id, name=name, handle=handle)
    session.add(p)
    session.flush()
    return p
