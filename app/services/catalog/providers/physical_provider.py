from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func
from app.db.models import MediaItem, MediaMatch, MetadataLocalization, ItemStatus, ItemType, VirtualMediaState
from app.services.catalog.filters import (
    _apply_rating_filter, 
    _apply_exact_rating_filter
)
from app.services.catalog.helpers import (
    _active_match,
    _serialize_movie_item,
    _serialize_series_item,
)

def _media_item_search_filter(search_term, search_like):
    if not search_term:
        return None
    return or_(
        MediaItem.internal_title.ilike(search_like),
        MediaItem.fn_title.ilike(search_like),
        MediaItem.fd_title.ilike(search_like),
        MediaItem.it_title.ilike(search_like),
        MediaItem.folder_name.ilike(search_like),
        MediaItem.matches.any(and_(
            MediaMatch.is_active == True,
            MediaMatch.localizations.any(or_(
                MetadataLocalization.title.ilike(search_like),
                MetadataLocalization.original_title.ilike(search_like),
                MetadataLocalization.series_title.ilike(search_like),
                MetadataLocalization.original_series_title.ilike(search_like),
            )),
        )),
    )

def _movie_query(db: Session, normalized_rating_filter: str, normalized_exact_rating: float, favorite_only: bool, search_term: str, search_like: str):
    query = db.query(MediaItem).options(
        joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
    ).filter(
        MediaItem.item_type == ItemType.MOVIE,
        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
    )
    query = _apply_rating_filter(query, MediaItem.user_rating, normalized_rating_filter)
    query = _apply_exact_rating_filter(query, MediaItem.user_rating, normalized_exact_rating)
    media_search_filter = _media_item_search_filter(search_term, search_like)
    if media_search_filter is not None:
        query = query.filter(media_search_filter)
    return query

def _local_series_rows(db: Session, search_term: str, search_like: str, preferred_languages, terminal_series_statuses, normalized_rating_filter: str, normalized_exact_rating: float, favorite_only: bool):
    base_query = db.query(MediaItem).options(
        joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
    ).join(MediaMatch, MediaMatch.media_item_id == MediaItem.id).filter(
        MediaMatch.is_active == True,
        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
    )
    media_search_filter = _media_item_search_filter(search_term, search_like)
    if media_search_filter is not None:
        base_query = base_query.filter(media_search_filter)

    series_items = base_query.filter(
        MediaItem.item_type == ItemType.SERIES
    ).order_by(MediaItem.id.asc()).all()

    owned_series_tmdb_ids = {
        (match.series_tmdb_id or match.tmdb_id)
        for item in series_items
        for match in item.matches
        if match.is_active and (match.series_tmdb_id or match.tmdb_id)
    }

    fallback_episode_rows = base_query.with_entities(
        func.min(MediaItem.id).label("item_id"),
        func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id).label("series_id"),
    ).filter(
        MediaItem.item_type == ItemType.EPISODE,
        func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id).isnot(None),
    )
    if owned_series_tmdb_ids:
        fallback_episode_rows = fallback_episode_rows.filter(
            ~func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id).in_(owned_series_tmdb_ids)
        )
    fallback_episode_ids = [
        row.item_id
        for row in fallback_episode_rows.group_by(
            func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id)
        ).all()
    ]

    fallback_episode_items = []
    if fallback_episode_ids:
        fallback_episode_items = db.query(MediaItem).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
        ).filter(
            MediaItem.id.in_(fallback_episode_ids)
        ).order_by(MediaItem.id.asc()).all()

    rows = [*series_items, *fallback_episode_items]

    series_tmdb_ids = {
        (match.series_tmdb_id or match.tmdb_id)
        for item in rows
        for match in item.matches
        if match.is_active and (match.series_tmdb_id or match.tmdb_id)
    }
    series_state_by_tmdb = {}
    if series_tmdb_ids:
        series_state_by_tmdb = {
            state.tmdb_id: state
            for state in db.query(VirtualMediaState).filter(
                VirtualMediaState.media_type == "tv",
                VirtualMediaState.tmdb_id.in_(series_tmdb_ids),
            ).all()
        }

    series = []
    seen = set()
    for item in rows:
        match = _active_match(item)
        if not match:
            continue
        tmdb_id = match.series_tmdb_id or match.tmdb_id
        series_key = tmdb_id or item.internal_title or item.fn_title or item.folder_name
        if series_key in seen:
            continue
        seen.add(series_key)
        serialized = _serialize_series_item(item, series_state_by_tmdb, preferred_languages, terminal_series_statuses, normalized_rating_filter, normalized_exact_rating, favorite_only, db)
        if serialized:
            series.append(serialized)
    return series

def _local_movie_tmdb_ids(db: Session):
    rows = db.query(MediaMatch.tmdb_id).join(MediaItem).filter(
        MediaMatch.is_active == True,
        MediaItem.item_type == ItemType.MOVIE,
        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
    ).all()
    return {row[0] for row in rows if row[0]}

def fetch_physical_items(db: Session, normalized_rating_filter: str, normalized_exact_rating: float, favorite_only: bool):
    physical_query = db.query(MediaItem).filter(
        MediaItem.item_type.in_([ItemType.MOVIE, ItemType.SERIES, ItemType.EPISODE]),
        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
    )
    physical_query = _apply_rating_filter(physical_query, MediaItem.user_rating, normalized_rating_filter)
    physical_query = _apply_exact_rating_filter(physical_query, MediaItem.user_rating, normalized_exact_rating)
    return physical_query.all()
