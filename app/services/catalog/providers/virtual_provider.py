from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.models import VirtualMediaState, CustomListItem, MediaItem, MediaMatch, ItemStatus, ItemType
from app.services.catalog.filters import (
    _apply_rating_filter, 
    _apply_exact_rating_filter, 
    _normalize_media_type
)
from app.services.catalog.helpers import (
    _preload_virtual_catalog_data,
    _serialize_virtual_state,
)

def backfill_virtual_states_from_lists(db: Session):
    local_movie_ids = {
        row[0]
        for row in db.query(MediaMatch.tmdb_id).join(MediaItem).filter(
            MediaMatch.is_active == True,
            MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
            MediaItem.item_type == ItemType.MOVIE,
            MediaMatch.tmdb_id.isnot(None),
        ).all()
    }
    local_series_ids = {
        row[0]
        for row in db.query(func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id)).join(MediaItem).filter(
            MediaMatch.is_active == True,
            MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
            MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]),
            func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id).isnot(None),
        ).all()
    }
    existing_states = {
        (_normalize_media_type(row.media_type), row.tmdb_id)
        for row in db.query(VirtualMediaState.tmdb_id, VirtualMediaState.media_type).all()
        if row.tmdb_id
    }
    created = False
    for row in db.query(CustomListItem.tmdb_id, CustomListItem.media_type).filter(CustomListItem.tmdb_id.isnot(None)).all():
        media_type = _normalize_media_type(row.media_type)
        if media_type == "movie" and row.tmdb_id in local_movie_ids:
            continue
        if media_type == "tv" and row.tmdb_id in local_series_ids:
            continue
        state_key = (media_type, row.tmdb_id)
        if state_key in existing_states:
            continue
        db.add(VirtualMediaState(tmdb_id=row.tmdb_id, media_type=media_type, custom_tags=[], is_tracked=True))
        existing_states.add(state_key)
        created = True
    if created:
        db.commit()

def fetch_virtual_items(db: Session, normalized_rating_filter: str, normalized_exact_rating: float, favorite_only: bool):
    virtual_query = db.query(VirtualMediaState)
    if normalized_rating_filter == "unrated":
        virtual_query = virtual_query.filter(VirtualMediaState.is_tracked == True)
    virtual_query = _apply_rating_filter(virtual_query, VirtualMediaState.user_rating, normalized_rating_filter)
    virtual_query = _apply_exact_rating_filter(virtual_query, VirtualMediaState.user_rating, normalized_exact_rating)
    return virtual_query.all()

def _virtual_query(db: Session, media_type: str, normalized_rating_filter: str, normalized_exact_rating: float, favorite_only: bool):
    query = db.query(VirtualMediaState).filter(VirtualMediaState.media_type == media_type)
    if normalized_rating_filter == "unrated":
        query = query.filter(VirtualMediaState.is_tracked == True)
    query = _apply_rating_filter(query, VirtualMediaState.user_rating, normalized_rating_filter)
    query = _apply_exact_rating_filter(query, VirtualMediaState.user_rating, normalized_exact_rating)
    return query
