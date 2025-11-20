from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from .base import Base


class PlayerStats(Base):
    __tablename__ = 'player_stats'
    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey('players.id'), unique=True, nullable=False)
    mean_points = Column(Float)
    stddev_points = Column(Float)
    variance_points = Column(Float)
    sample_size = Column(Integer)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


def upsert_player_stats(session, player_id: int, mean: float, stddev: float, variance: float, sample_size: int):
    ps = session.query(PlayerStats).filter_by(player_id=player_id).first()
    if not ps:
        ps = PlayerStats(player_id=player_id, mean_points=mean, stddev_points=stddev, variance_points=variance, sample_size=sample_size)
        session.add(ps)
    else:
        ps.mean_points = mean
        ps.stddev_points = stddev
        ps.variance_points = variance
        ps.sample_size = sample_size
    session.flush()
    return ps


def get_player_stats(session, player_id: int):
    return session.query(PlayerStats).filter_by(player_id=player_id).first()
