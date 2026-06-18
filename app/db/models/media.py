from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Float, DateTime, Enum as SQLEnum, JSON, Boolean, BigInteger, ForeignKey, Table, Column, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from .enums import ItemType, ItemStatus, MovieEdition, MediaSource, MediaAudioType, PartType, PartStyle, ExtraCategory, ExtraSubtype

media_item_tags = Table(
    "media_item_tags",
    Base.metadata,
    Column("media_item_id", Integer, ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True)
)

class Tag(Base):
    """Global user-defined tags."""
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    color: Mapped[Optional[str]] = mapped_column(String, default="#3b82f6")
    target_type: Mapped[str] = mapped_column(String, default="media", server_default="media", index=True)
    is_adult: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    custom_images: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    manual_preview_images: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class MediaItem(Base):
    """Level 1: The physical file on the disk."""
    __tablename__ = "media_items"
    id: Mapped[int] = mapped_column(primary_key=True); item_type: Mapped[ItemType] = mapped_column(SQLEnum(ItemType), index=True)
    original_path: Mapped[str] = mapped_column(String, nullable=False, index=True)
    current_path: Mapped[str] = mapped_column(String, nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String, index=True); extension: Mapped[str] = mapped_column(String); size: Mapped[int] = mapped_column(BigInteger, default=0, index=True)
    mtime: Mapped[Optional[float]] = mapped_column(Float, index=True) # Last modified time (filesystem)
    folder_name: Mapped[Optional[str]] = mapped_column(String) # Immediate parent directory name
    file_hash: Mapped[Optional[str]] = mapped_column(String, index=True)
    group_hash: Mapped[Optional[str]] = mapped_column(String, index=True) # For linking split files (CD1/CD2)
    nfo_imdb_id: Mapped[Optional[str]] = mapped_column(String); internal_title: Mapped[Optional[str]] = mapped_column(String)
    duration: Mapped[Optional[float]] = mapped_column(Float); resolution: Mapped[Optional[str]] = mapped_column(String)
    video_codec: Mapped[Optional[str]] = mapped_column(String); video_bitrate: Mapped[Optional[int]] = mapped_column(Integer)
    framerate: Mapped[Optional[str]] = mapped_column(String); bit_depth: Mapped[Optional[int]] = mapped_column(Integer)
    hdr_type: Mapped[Optional[str]] = mapped_column(String); audio_codec: Mapped[Optional[str]] = mapped_column(String)
    audio_channels: Mapped[Optional[str]] = mapped_column(String); audio_bitrate: Mapped[Optional[int]] = mapped_column(Integer)
    audio_streams: Mapped[Optional[List[dict]]] = mapped_column(JSON)
    fn_title: Mapped[Optional[str]] = mapped_column(String); fn_year: Mapped[Optional[int]] = mapped_column(Integer)
    fn_season: Mapped[Optional[int]] = mapped_column(Integer); fn_episode: Mapped[Optional[str]] = mapped_column(String)
    fn_item_type: Mapped[Optional[str]] = mapped_column(String); fn_part: Mapped[Optional[int]] = mapped_column(Integer)
    fd_title: Mapped[Optional[str]] = mapped_column(String); fd_year: Mapped[Optional[int]] = mapped_column(Integer)
    fd_season: Mapped[Optional[int]] = mapped_column(Integer); fd_episode: Mapped[Optional[str]] = mapped_column(String)
    fd_item_type: Mapped[Optional[str]] = mapped_column(String); fd_part: Mapped[Optional[int]] = mapped_column(Integer)
    it_title: Mapped[Optional[str]] = mapped_column(String); it_year: Mapped[Optional[int]] = mapped_column(Integer)
    it_season: Mapped[Optional[int]] = mapped_column(Integer); it_episode: Mapped[Optional[str]] = mapped_column(String)
    it_item_type: Mapped[Optional[str]] = mapped_column(String)
    locale: Mapped[Optional[str]] = mapped_column(String); source: Mapped[MediaSource] = mapped_column(SQLEnum(MediaSource), default=MediaSource.NONE)
    edition: Mapped[MovieEdition] = mapped_column(SQLEnum(MovieEdition), default=MovieEdition.NONE)
    audio_type: Mapped[MediaAudioType] = mapped_column(SQLEnum(MediaAudioType), default=MediaAudioType.NONE)
    part: Mapped[Optional[int]] = mapped_column(Integer)
    part_type: Mapped[PartType] = mapped_column(SQLEnum(PartType), default=PartType.PART)
    part_style: Mapped[PartStyle] = mapped_column(SQLEnum(PartStyle), default=PartStyle.NONE)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False); status: Mapped[ItemStatus] = mapped_column(SQLEnum(ItemStatus), default=ItemStatus.NEW, index=True)
    ignored_previous_status: Mapped[Optional[ItemStatus]] = mapped_column(SQLEnum(ItemStatus), nullable=True)
    ignored_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    planned_path: Mapped[Optional[str]] = mapped_column(String) # The path proposed by the Formatter
    category: Mapped[str] = mapped_column(String, default="video", index=True); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    user_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_rating_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    user_comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[List["Tag"]] = relationship("Tag", secondary=media_item_tags, backref="media_items")
    last_watched_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    resume_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    watch_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", index=True)
    is_watched: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    matches: Mapped[List["MediaMatch"]] = relationship(back_populates="media_item", cascade="all, delete-orphan")
    extras: Mapped[List["ExtraFile"]] = relationship(back_populates="parent_item", cascade="all, delete-orphan")
    action_logs: Mapped[List["ActionLog"]] = relationship(back_populates="media_item")
    playback_logs: Mapped[List["PlaybackLog"]] = relationship(back_populates="media_item", cascade="all, delete-orphan")
    def __repr__(self) -> str: return f"<MediaItem(id={self.id}, status={self.status.value}, path={self.current_path})>"


class ExtraFile(Base):
    """Associated files like subtitles, images, and trailers."""
    __tablename__ = "extra_files"
    id: Mapped[int] = mapped_column(primary_key=True); parent_item_id: Mapped[int] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), index=True)
    category: Mapped[ExtraCategory] = mapped_column(SQLEnum(ExtraCategory), nullable=False)
    subtype: Mapped[Optional[ExtraSubtype]] = mapped_column(SQLEnum(ExtraSubtype), nullable=True)
    original_path: Mapped[str] = mapped_column(String, nullable=False, index=True); current_path: Mapped[str] = mapped_column(String, nullable=False, index=True)
    extension: Mapped[str] = mapped_column(String)
    language: Mapped[Optional[str]] = mapped_column(String)
    file_hash: Mapped[Optional[str]] = mapped_column(String, index=True)
    parent_item: Mapped["MediaItem"] = relationship(back_populates="extras")
    action_logs: Mapped[List["ActionLog"]] = relationship(back_populates="extra_file")


class PlaybackLog(Base):
    """Level 4: Tracking history of playback clicks."""
    __tablename__ = "playback_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    media_item_id: Mapped[int] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), index=True)
    watched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    media_item: Mapped["MediaItem"] = relationship(back_populates="playback_logs")


class CustomList(Base):
    """User-created custom media lists."""
    __tablename__ = "custom_lists"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    items: Mapped[List["CustomListItem"]] = relationship(
        "CustomListItem", back_populates="custom_list", cascade="all, delete-orphan"
    )


class CustomListItem(Base):
    """Items inside user-created custom lists, can link to physical media or virtual TMDB ID."""
    __tablename__ = "custom_list_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column(ForeignKey("custom_lists.id", ondelete="CASCADE"), index=True)
    tmdb_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    media_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), nullable=True, index=True)
    media_type: Mapped[str] = mapped_column(String, default="movie")  # 'movie' or 'tv'
    title: Mapped[str] = mapped_column(String, nullable=False)
    poster_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    custom_list: Mapped["CustomList"] = relationship("CustomList", back_populates="items")
    media_item: Mapped[Optional["MediaItem"]] = relationship("MediaItem")


class VirtualMediaState(Base):
    """User state for TMDB-only titles that are not physical library items."""
    __tablename__ = "virtual_media_states"
    __table_args__ = (UniqueConstraint("tmdb_id", "media_type", name="uq_virtual_media_state_tmdb_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tmdb_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    media_type: Mapped[str] = mapped_column(String, nullable=False, index=True)  # movie | tv
    is_tracked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", index=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    is_watched: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    user_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_rating_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    user_comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    custom_tags: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    manual_poster_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    manual_local_poster_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    manual_backdrop_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    manual_local_backdrop_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    manual_logo_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    manual_local_logo_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VirtualEpisodeState(Base):
    """User watched state for TMDB-only episodes that do not exist as physical files."""
    __tablename__ = "virtual_episode_states"
    __table_args__ = (
        UniqueConstraint("series_tmdb_id", "season_number", "episode_number", name="uq_virtual_episode_state_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    series_tmdb_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    season_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    is_watched: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

