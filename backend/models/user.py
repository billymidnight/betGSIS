from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from .base import Base


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    role = Column(String, default='guest')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
