from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any, Dict
from datetime import datetime
from ..db.models import ItemStatus, ItemType

class MediaMatchDTO(BaseModel):
    id: int
    tmdb_id: Optional[int]
    type: str
    title: str
    year: Optional[int]
    poster_path: Optional[str] = None
    vote_average: Optional[float] = None
    is_active: bool
    confidence: float

    model_config = ConfigDict(from_attributes=True)

class MediaImageDTO(BaseModel):
    type: str
    path: str
    label: Optional[str] = None

class MediaItemDTO(BaseModel):
    id: int
    filename: str
    status: str
    type: str
    tmdb_id: Optional[int] = None
    series_tmdb_id: Optional[int] = None
    title: str
    year: Optional[int] = None
    season: Optional[int] = None
    episode: Optional[Any] = None
    planned_path: Optional[str] = None
    extension: str
    size_mb: float
    images: List[MediaImageDTO] = []
    matches: List[MediaMatchDTO] = []
    current_path: Optional[str] = None
    action: Optional[str] = None
    has_collision: Optional[bool] = False
    collision_group_id: Optional[str] = None
    audio_type: Optional[str] = None
    edition: Optional[str] = None
    source: Optional[str] = None
    target_language: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ExtraFileDTO(BaseModel):
    id: int
    parent_id: int
    parent_name: str
    filename: str
    extension: str
    category: str
    subtype: str
    language: Optional[str] = None
    path: str
    planned_path: Optional[str] = None
    action: Optional[str] = None
    parent_status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class DiscoveryGroupsDTO(BaseModel):
    manual: List[MediaItemDTO] = []
    movies: List[MediaItemDTO] = []
    series: List[MediaItemDTO] = []
    extras: List[ExtraFileDTO] = []
    collisions: List[MediaItemDTO] = []

class LibraryItemDTO(BaseModel):
    id: int
    title: str
    year: Optional[int]
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    rating: float
    rating_imdb: Optional[float] = None
    type: str
    path: Optional[str] = None
    duration: Optional[float] = None
    last_watched_at: Optional[str] = None
    size: Optional[int] = None
    user_rating: Optional[float] = None

class LibraryCollectionItemDTO(BaseModel):
    id: int
    title: str
    year: Optional[int]
    poster_path: Optional[str] = None
    has_local_poster: bool = False
    backdrop_path: Optional[str] = None
    rating: float = 0
    rating_imdb: Optional[float] = None
    type: str
    tmdb_id: Optional[int] = None
    path: Optional[str] = None
    is_favorite: bool = False
    user_rating: Optional[float] = None

class LibraryCollectionDTO(BaseModel):
    id: str
    tmdb_id: int
    title: str
    overview: Optional[str] = None
    poster_path: Optional[str] = None
    has_local_poster: bool = False
    poster_remote_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    owned_count: int = 0
    total_count: int = 0
    type: str = "collection"
    movies: List[LibraryCollectionItemDTO] = []

class LibraryCollectionsPageDTO(BaseModel):
    items: List[LibraryCollectionDTO] = []
    total_items: int = 0
    page: int = 1
    page_size: Optional[int] = 40
    total_pages: int = 1

class LibraryGroupedDTO(BaseModel):
    movies: List[LibraryItemDTO] = []
    series: List[LibraryItemDTO] = []
    adult: List[LibraryItemDTO] = []
    people: List[LibraryItemDTO] = []
    counts: Dict[str, int] = {"movies": 0, "series": 0, "adult": 0, "people": 0}

class LibraryStatsDTO(BaseModel):
    total_movies: int
    total_series: int
    total_episodes: int
    total_adult_movies: int = 0
    storage: str
    drive_count: int
    unmatched: int
    storage_breakdown: Dict[str, str] = {}
    manual_review_total: int = 0
    manual_review_breakdown: Dict[str, int] = {}
    genre_distribution: Dict[str, int] = {}
    genre_distribution_ids: Dict[str, int] = {}
    genre_labels: Dict[str, str] = {}
    genre_constellation: Dict[str, Any] = {}
    decade_distribution: Dict[str, int] = {}
