from datetime import datetime
from typing import List, Optional, Any
from sqlalchemy import String, Integer, Float, DateTime, Enum as SQLEnum, JSON, Boolean, BigInteger, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship, backref
from app.db.base import Base, CacheBase
from .enums import ItemType, ImageStatus

class MediaCollection(Base):
    """Collection-level metadata shared across movies in the same TMDB collection."""
    __tablename__ = "media_collections"

    tmdb_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    total_parts: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    localizations: Mapped[List["MediaCollectionLocalization"]] = relationship(
        back_populates="collection",
        cascade="all, delete-orphan"
    )
    matches: Mapped[List["MediaMatch"]] = relationship(back_populates="collection_entity")


class MediaCollectionLocalization(Base):
    """Language-specific collection metadata for localized collection views."""
    __tablename__ = "media_collection_localizations"
    __table_args__ = (
        UniqueConstraint("collection_tmdb_id", "target_language", name="uq_collection_localization_lang"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    collection_tmdb_id: Mapped[int] = mapped_column(ForeignKey("media_collections.tmdb_id", ondelete="CASCADE"), index=True)
    target_language: Mapped[str] = mapped_column(String, default="en", index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[str] = mapped_column(String)
    overview: Mapped[Optional[str]] = mapped_column(String)
    poster_path: Mapped[Optional[str]] = mapped_column(String)
    local_poster_path: Mapped[Optional[str]] = mapped_column(String)
    backdrop_path: Mapped[Optional[str]] = mapped_column(String)
    local_backdrop_path: Mapped[Optional[str]] = mapped_column(String)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    collection: Mapped["MediaCollection"] = relationship(back_populates="localizations")


class MediaMatch(Base):
    """Level 2: Global metadata match (e.g., TMDB result)."""
    __tablename__ = "media_matches"
    id: Mapped[int] = mapped_column(primary_key=True); media_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("media_matches.id", ondelete="CASCADE"), index=True); tmdb_id: Mapped[int] = mapped_column(Integer, index=True)
    imdb_id: Mapped[Optional[str]] = mapped_column(String, index=True); series_tmdb_id: Mapped[Optional[int]] = mapped_column(Integer)
    season_tmdb_id: Mapped[Optional[int]] = mapped_column(Integer); item_type: Mapped[ItemType] = mapped_column(SQLEnum(ItemType))
    season_number: Mapped[Optional[int]] = mapped_column(Integer); episode_number: Mapped[Optional[Any]] = mapped_column(JSON)
    episode_count: Mapped[Optional[int]] = mapped_column(Integer); rating_tmdb: Mapped[Optional[float]] = mapped_column(Float)
    rating_imdb: Mapped[Optional[float]] = mapped_column(Float); rating_rotten: Mapped[Optional[str]] = mapped_column(String)
    rating_meta: Mapped[Optional[int]] = mapped_column(Integer); vote_count_tmdb: Mapped[Optional[int]] = mapped_column(Integer)
    vote_count_imdb: Mapped[Optional[int]] = mapped_column(Integer); budget: Mapped[Optional[int]] = mapped_column(BigInteger)
    revenue: Mapped[Optional[int]] = mapped_column(BigInteger); runtime: Mapped[Optional[int]] = mapped_column(Integer)
    popularity: Mapped[Optional[float]] = mapped_column(Float); release_status: Mapped[Optional[str]] = mapped_column(String)
    series_type: Mapped[Optional[str]] = mapped_column(String)  # Scripted, Documentary, Miniseries, Reality
    cast: Mapped[Optional[List[dict]]] = mapped_column(JSON); director: Mapped[Optional[str]] = mapped_column(String)
    networks: Mapped[Optional[List[dict]]] = mapped_column(JSON)
    companies: Mapped[Optional[List[dict]]] = mapped_column(JSON)
    collection: Mapped[Optional[str]] = mapped_column(String)
    collection_tmdb_id: Mapped[Optional[int]] = mapped_column(ForeignKey("media_collections.tmdb_id", ondelete="SET NULL"), index=True)
    release_date: Mapped[Optional[datetime]] = mapped_column(DateTime); first_air_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_air_date: Mapped[Optional[datetime]] = mapped_column(DateTime); episode_air_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    season_air_date: Mapped[Optional[datetime]] = mapped_column(DateTime); number_of_seasons: Mapped[Optional[int]] = mapped_column(Integer)
    number_of_episodes: Mapped[Optional[int]] = mapped_column(Integer)
    fetched_languages: Mapped[Optional[str]] = mapped_column(String)
    image_status: Mapped[ImageStatus] = mapped_column(SQLEnum(ImageStatus), default=ImageStatus.PENDING, index=True)
    backdrop_status: Mapped[ImageStatus] = mapped_column(SQLEnum(ImageStatus), default=ImageStatus.PENDING, index=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0)
    is_adult: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    localizations: Mapped[List["MetadataLocalization"]] = relationship(back_populates="match", cascade="all, delete-orphan")
    media_item: Mapped[Optional["MediaItem"]] = relationship(back_populates="matches")
    children: Mapped[List["MediaMatch"]] = relationship("MediaMatch", backref=backref("parent", remote_side=[id]))
    people: Mapped[List["MediaPersonLink"]] = relationship(back_populates="media_match", cascade="all, delete-orphan")
    collection_entity: Mapped[Optional["MediaCollection"]] = relationship(back_populates="matches")


class MetadataLocalization(Base):
    """Level 3: Language-specific metadata (localized titles, overviews)."""
    __tablename__ = "metadata_localizations"
    id: Mapped[int] = mapped_column(primary_key=True); match_id: Mapped[int] = mapped_column(ForeignKey("media_matches.id", ondelete="CASCADE"))
    target_language: Mapped[str] = mapped_column(String, default="en", index=True); is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    title: Mapped[str] = mapped_column(String); original_title: Mapped[Optional[str]] = mapped_column(String)
    series_title: Mapped[Optional[str]] = mapped_column(String); original_series_title: Mapped[Optional[str]] = mapped_column(String)
    season_title: Mapped[Optional[str]] = mapped_column(String)
    episode_title: Mapped[Optional[str]] = mapped_column(String); tagline: Mapped[Optional[str]] = mapped_column(String)
    overview: Mapped[Optional[str]] = mapped_column(String); genres: Mapped[Optional[List[str]]] = mapped_column(JSON)
    origin_country: Mapped[Optional[List[str]]] = mapped_column(JSON)
    original_language: Mapped[Optional[str]] = mapped_column(String)
    spoken_languages: Mapped[Optional[List[str]]] = mapped_column(JSON)
    poster_path: Mapped[Optional[str]] = mapped_column(String)
    local_poster_path: Mapped[Optional[str]] = mapped_column(String)
    series_poster_path: Mapped[Optional[str]] = mapped_column(String)
    local_series_poster_path: Mapped[Optional[str]] = mapped_column(String)
    logo_path: Mapped[Optional[str]] = mapped_column(String)
    local_logo_path: Mapped[Optional[str]] = mapped_column(String)
    backdrop_path: Mapped[Optional[str]] = mapped_column(String)
    local_backdrop_path: Mapped[Optional[str]] = mapped_column(String)
    still_path: Mapped[Optional[str]] = mapped_column(String)
    trailer_url: Mapped[Optional[str]] = mapped_column(String)
    local_still_path: Mapped[Optional[str]] = mapped_column(String)
    all_stills: Mapped[Optional[List[str]]] = mapped_column(JSON) # JSON list of paths
    local_all_stills: Mapped[Optional[List[str]]] = mapped_column(JSON)
    local_thumb_path: Mapped[Optional[str]] = mapped_column(String) # For fast UI previews
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    match: Mapped["MediaMatch"] = relationship(back_populates="localizations")


class TMDBCache(CacheBase):
    """Persistent storage for raw TMDB API responses."""
    __tablename__ = "tmdb_cache"
    id: Mapped[int] = mapped_column(primary_key=True)
    cache_key: Mapped[str] = mapped_column(String, unique=True, index=True) # Unique key for query/params
    tmdb_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    item_type: Mapped[Optional[ItemType]] = mapped_column(SQLEnum(ItemType))
    target_language: Mapped[str] = mapped_column(String, index=True)
    raw_data: Mapped[dict[str, Any]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class OMDBCache(CacheBase):
    """Persistent storage for raw OMDb API responses."""
    __tablename__ = "omdb_cache"
    id: Mapped[int] = mapped_column(primary_key=True)
    imdb_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    raw_data: Mapped[dict[str, Any]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OMDBRequestQueue(CacheBase):
    """Persistent queue for deferred OMDb rating fetches."""
    __tablename__ = "omdb_request_queue"
    id: Mapped[int] = mapped_column(primary_key=True)
    imdb_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[int] = mapped_column(Integer, default=100, index=True)
    last_error: Mapped[Optional[str]] = mapped_column(String)
    next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime, index=True)
    last_attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
