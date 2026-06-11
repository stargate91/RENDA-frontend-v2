from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Float, DateTime, Enum as SQLEnum, JSON, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from .enums import ImageStatus

class Person(Base):
    """Cast and crew - Global information."""
    __tablename__ = "persons"
    id: Mapped[int] = mapped_column(primary_key=True); birthday: Mapped[Optional[str]] = mapped_column(String)
    deathday: Mapped[Optional[str]] = mapped_column(String); place_of_birth: Mapped[Optional[str]] = mapped_column(String)
    gender: Mapped[Optional[int]] = mapped_column(Integer); popularity: Mapped[Optional[float]] = mapped_column(Float)
    known_for_department: Mapped[Optional[str]] = mapped_column(String); profile_path: Mapped[Optional[str]] = mapped_column(String)
    local_profile_path: Mapped[Optional[str]] = mapped_column(String)
    images: Mapped[Optional[List[str]]] = mapped_column(JSON); external_ids: Mapped[Optional[dict]] = mapped_column(JSON)
    fetched_languages: Mapped[Optional[str]] = mapped_column(String); image_status: Mapped[ImageStatus] = mapped_column(SQLEnum(ImageStatus), default=ImageStatus.PENDING, index=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    is_adult: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    user_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_rating_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    user_comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    custom_tags: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    localizations: Mapped[List["PersonLocalization"]] = relationship(back_populates="person", cascade="all, delete-orphan")
    media_links: Mapped[List["MediaPersonLink"]] = relationship(back_populates="person")


class PersonLocalization(Base):
    """Cast and crew - Language-specific information."""
    __tablename__ = "person_localizations"
    id: Mapped[int] = mapped_column(primary_key=True); person_id: Mapped[int] = mapped_column(ForeignKey("persons.id"), index=True)
    language: Mapped[str] = mapped_column(String, default="en", index=True); name: Mapped[str] = mapped_column(String, nullable=False)
    biography: Mapped[Optional[str]] = mapped_column(String); person: Mapped["Person"] = relationship(back_populates="localizations")


class MediaPersonLink(Base):
    """Link table between media matches and people (cast/crew)."""
    __tablename__ = "media_person_links"
    id: Mapped[int] = mapped_column(primary_key=True); media_match_id: Mapped[int] = mapped_column(ForeignKey("media_matches.id", ondelete="CASCADE"), index=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id"), index=True); job: Mapped[str] = mapped_column(String, index=True)
    character_name: Mapped[Optional[str]] = mapped_column(String); order: Mapped[int] = mapped_column(Integer, default=0)
    media_match: Mapped["MediaMatch"] = relationship(back_populates="people"); person: Mapped["Person"] = relationship(back_populates="media_links")
