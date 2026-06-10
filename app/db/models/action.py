from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, DateTime, Enum as SQLEnum, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from .enums import ActionType, ActionStatus

class ActionBatch(Base):
    """Represents a group of operations performed together (for Undo)."""
    __tablename__ = "action_batches"
    id: Mapped[int] = mapped_column(primary_key=True); name: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    logs: Mapped[List["ActionLog"]] = relationship(back_populates="batch", cascade="all, delete-orphan")


class ActionLog(Base):
    """Audit log for individual file operations."""
    __tablename__ = "action_logs"
    id: Mapped[int] = mapped_column(primary_key=True); batch_id: Mapped[int] = mapped_column(ForeignKey("action_batches.id"), index=True)
    media_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("media_items.id", ondelete="SET NULL"), index=True)
    extra_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("extra_files.id", ondelete="SET NULL"), index=True)
    action_type: Mapped[ActionType] = mapped_column(SQLEnum(ActionType))
    status: Mapped[ActionStatus] = mapped_column(SQLEnum(ActionStatus), default=ActionStatus.PENDING)
    old_value: Mapped[Optional[str]] = mapped_column(String); new_value: Mapped[Optional[str]] = mapped_column(String)
    error_message: Mapped[Optional[str]] = mapped_column(String)
    details: Mapped[Optional[dict]] = mapped_column(JSON); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    batch: Mapped["ActionBatch"] = relationship(back_populates="logs")
    media_item: Mapped[Optional["MediaItem"]] = relationship(back_populates="action_logs")
    extra_file: Mapped[Optional["ExtraFile"]] = relationship(back_populates="action_logs")
