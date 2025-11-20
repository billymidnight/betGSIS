from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from .base import Base


class Market(Base):
    __tablename__ = 'markets'
    id = Column(Integer, primary_key=True)
    sport_id = Column(Integer, ForeignKey('sports.id'), nullable=False)
    name = Column(String)
    status = Column(String, default='active')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
