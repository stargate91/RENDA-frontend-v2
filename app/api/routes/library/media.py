from fastapi import APIRouter, BackgroundTasks
from app.db.base import Session
from app.services.library_detail_service import LibraryDetailService

router = APIRouter()

@router.get("/library/item/{item_id}")
def get_library_item_detail(item_id: str, full_people: bool = False):
    """Returns comprehensive detail data for a single library item (movie detail page)."""
    db = Session()
    try:
        service = LibraryDetailService(db)
        return service.get_library_item_detail(item_id, full_people=full_people)
    finally:
        db.close()


@router.get("/library/series/{series_tmdb_id}")
def get_library_series_detail(
    series_tmdb_id: str,
    background_tasks: BackgroundTasks,
    seasons_limit: int = 5,
    initial_episodes_limit: int = 4,
):
    """Returns comprehensive detail data for a full series, including seasons and episodes."""
    db = Session()
    try:
        service = LibraryDetailService(db)
        return service.get_library_series_detail(series_tmdb_id, seasons_limit=seasons_limit, initial_episodes_limit=initial_episodes_limit)
    finally:
        db.close()


@router.get("/library/series/{series_tmdb_id}/season/{season_number}")
def get_library_series_season_detail(series_tmdb_id: str, season_number: int):
    db = Session()
    try:
        service = LibraryDetailService(db)
        return service.get_library_series_season_detail(series_tmdb_id, season_number)
    finally:
        db.close()


@router.get("/library/collection/{collection_tmdb_id}")
def get_library_collection_detail(collection_tmdb_id: str, language: str | None = None):
    db = Session()
    try:
        service = LibraryDetailService(db)
        return service.get_collection_detail(collection_tmdb_id, language=language)
    finally:
        db.close()
