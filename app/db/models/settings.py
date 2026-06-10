from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class UserSetting(Base):
    """Application-wide user configurations."""
    __tablename__ = "user_settings"
    key: Mapped[str] = mapped_column(String, primary_key=True); value: Mapped[Any] = mapped_column(JSON)
    description: Mapped[Optional[str]] = mapped_column(String); updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    def __repr__(self) -> str: return f"<UserSetting(key={self.key}, value={self.value})>"
