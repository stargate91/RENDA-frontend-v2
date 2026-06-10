from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date

class TMDBGenre(BaseModel):
    id: int
    name: str

class TMDBCollection(BaseModel):
    id: int
    name: str
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None

class TMDBNetwork(BaseModel):
    id: int
    name: str
    logo_path: Optional[str] = None

class TMDBCompany(BaseModel):
    id: int
    name: str
    logo_path: Optional[str] = None

class TMDBPerson(BaseModel):
    id: int
    name: str
    character: Optional[str] = None
    profile_path: Optional[str] = None
    order: int = 0
    job: Optional[str] = None
    gender: Optional[int] = None

class TMDBCredits(BaseModel):
    cast: List[TMDBPerson] = []
    crew: List[TMDBPerson] = []

class TMDBVideo(BaseModel):
    key: str
    site: str
    type: str
    official: bool = False

class TMDBVideosResponse(BaseModel):
    results: List[TMDBVideo] = []

class TMDBBase(BaseModel):
    id: int
    overview: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    vote_average: float = 0.0
    vote_count: int = 0
    popularity: float = 0.0
    status: Optional[str] = None
    genres: List[TMDBGenre] = []
    original_language: Optional[str] = None
    origin_country: List[str] = []
    credits: Optional[TMDBCredits] = None
    videos: Optional[TMDBVideosResponse] = None

    class Config:
        populate_by_name = True

class TMDBMovie(TMDBBase):
    title: str
    original_title: Optional[str] = None
    release_date: Optional[date] = None
    runtime: Optional[int] = None
    imdb_id: Optional[str] = None
    revenue: int = 0
    budget: int = 0
    belongs_to_collection: Optional[TMDBCollection] = None
    production_companies: List[TMDBCompany] = []
    adult: bool = False
    tagline: Optional[str] = None

class TMDBSeason(BaseModel):
    id: int
    name: str
    overview: Optional[str] = None
    air_date: Optional[date] = None
    season_number: int
    episode_count: int = 0
    poster_path: Optional[str] = None

class TMDBRole(BaseModel):
    character: Optional[str] = None
    episode_count: int = 0

class TMDBAggregatePerson(BaseModel):
    id: int
    name: str
    roles: List[TMDBRole] = []
    profile_path: Optional[str] = None
    order: int = 0
    popularity: float = 0.0
    gender: Optional[int] = None

class TMDBAggregateCredits(BaseModel):
    cast: List[TMDBAggregatePerson] = []
    crew: List[TMDBPerson] = []

class TMDBSeries(TMDBBase):
    name: str
    original_name: Optional[str] = None
    first_air_date: Optional[date] = None
    last_air_date: Optional[date] = None
    number_of_seasons: int = 0
    number_of_episodes: int = 0
    networks: List[TMDBNetwork] = []
    type: Optional[str] = None
    episode_run_time: List[int] = []
    created_by: List[Dict[str, Any]] = [] # Often simplified persons
    seasons: List[TMDBSeason] = []
    aggregate_credits: Optional[TMDBAggregateCredits] = None

class TMDBEpisode(BaseModel):
    id: int
    name: str
    overview: Optional[str] = None
    air_date: Optional[date] = None
    episode_number: int
    season_number: int
    vote_average: float = 0.0
    still_path: Optional[str] = None
    runtime: Optional[int] = None
    credits: Optional[TMDBCredits] = None
