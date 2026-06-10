from fastapi import APIRouter
from typing import Optional

from app.db.base import Session
from app.services.media_library_service import MediaLibraryService

router = APIRouter()

@router.get("/library/stats")
def get_stats():
    """Returns library statistics for the dashboard."""
    db = Session()
    try:
        stats = MediaLibraryService(db).get_stats()
        return stats.model_dump() if hasattr(stats, "model_dump") else stats.dict()
    finally:
        db.close()


@router.get("/library/continue-watching")
def get_continue_watching(limit: int = 12):
    db = Session()
    try:
        return MediaLibraryService(db).get_continue_watching(limit=limit)
    finally:
        db.close()


@router.get("/library")
def get_library_items(
    tab: Optional[str] = None,
    page: int = 1,
    page_size: Optional[int] = 40,
    sort_by: str = "title_asc",
    search: str = "",
    selected_tags: Optional[str] = None,
    selected_genre: Optional[str] = None,
    selected_decade: Optional[str] = None,
    selected_year: Optional[int] = None,
    filter_favorite: str = "all",
    filter_watched: str = "all",
    filter_ownership: str = "owned",
    filter_status: str = "active",
    filter_gender: str = "all",
    people_role: str = "all",
):
    """Returns grouped organized items for the Library view."""
    db = Session()
    try:
        service = MediaLibraryService(db)
        if tab and tab.lower() in {"movies", "series", "adult", "people", "adult_people", "actors", "directors"}:
            parsed_tags = [tag for tag in (selected_tags or "").split(",") if tag]
            library = service.get_library_tab_page(
                tab=tab,
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                search=search,
                selected_tags=parsed_tags,
                selected_genre=selected_genre,
                selected_decade=selected_decade,
                selected_year=selected_year,
                filter_favorite=filter_favorite,
                filter_watched=filter_watched,
                filter_ownership=filter_ownership,
                filter_status=filter_status,
                filter_gender=filter_gender,
                people_role=people_role,
            )
        else:
            library = service.get_grouped_library()
        return library.model_dump() if hasattr(library, "model_dump") else (library.dict() if hasattr(library, "dict") else library)
    finally:
        db.close()


@router.get("/library/tags")
def get_library_tags():
    db = Session()
    try:
        tags = MediaLibraryService(db).get_tag_groups()
        return tags
    finally:
        db.close()


@router.get("/library/filters")
def get_library_filters(
    tab: str = "movies",
    filter_ownership: str = "owned",
    filter_status: str = "active"
):
    db = Session()
    try:
        filters = MediaLibraryService(db).get_library_filter_options(
            tab=tab,
            filter_ownership=filter_ownership,
            filter_status=filter_status
        )
        return filters
    finally:
        db.close()


@router.get("/library/collections")
def get_movie_collections(
    page: int = 1,
    page_size: Optional[int] = 40,
    search: str = "",
):
    db = Session()
    try:
        collections = MediaLibraryService(db).get_movie_collections(
            page=page,
            page_size=page_size,
            search=search,
        )
        return collections.model_dump() if hasattr(collections, "model_dump") else collections
    finally:
        db.close()


@router.get("/library/people/{role}")
def get_library_people(role: str, filter_status: str = "active", tab: str = "people"):
    db = Session()
    try:
        people = MediaLibraryService(db).get_people_group(role, filter_status=filter_status, tab=tab)
        return people
    finally:
        db.close()
