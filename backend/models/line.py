from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, DateTime
from sqlalchemy.sql import func
from .base import Base


class Line(Base):
    __tablename__ = 'lines'
    id = Column(Integer, primary_key=True)
    market_id = Column(Integer, ForeignKey('markets.id'), nullable=False)
    player_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    line_type = Column(String, default='OU')
    threshold = Column(Integer, nullable=False)
    price_model = Column(String, default='normal')
    margin_bps = Column(Integer, default=500)
    prob_over = Column(Numeric)
    prob_under = Column(Numeric)
    odds_over_decimal = Column(Numeric)
    odds_under_decimal = Column(Numeric)
    # store american odds as strings (e.g. "+145" or "-175")
    odds_over_american = Column(String)
    odds_under_american = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
