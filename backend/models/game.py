from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from .base import Base


class Game(Base):
    __tablename__ = 'games'
    id = Column(Integer, primary_key=True)
    sport_id = Column(Integer, ForeignKey('sports.id'), nullable=False)
    game_no = Column(Integer, nullable=False)
    played_at = Column(DateTime(timezone=True), server_default=func.now())

def get_or_create_game_by_gameno(session, gameno: int):
    # simple helper: try to find game, otherwise create
    g = session.query(Game).filter_by(game_no=gameno).first()
    if g:
        return g
    g = Game(game_no=gameno, sport_id=1)
    session.add(g)
    session.flush()
    return g
