from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from .base import Base


class Sport(Base):
    __tablename__ = 'sports'
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
