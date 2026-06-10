import logging
from sqlalchemy import or_, and_, desc, func
from sqlalchemy.orm import Session, joinedload
from app.db.models import *
from app.utils.library_utils import (
    _public_image_path,
    _preferred_metadata_languages,
    _pick_match_localization,
    _resolve_virtual_catalog_metadata,
)
from app.utils.people_utils import (
    _normalize_user_rating,
    _pick_person_localization,
    _resolve_person_profile_path,
)
from urllib.parse import urlsplit, parse_qs
from app.services.catalog.filters import _matches_catalog_filters, _is_rated_value, _normalize_media_type

logger = logging.getLogger(__name__)

def _year_range_from_cache(db: Session, tmdb_id, terminal_series_statuses):
    if not tmdb_id:
        return None
    cached = db.query(TMDBCache).filter(
        TMDBCache.tmdb_id == tmdb_id,
        TMDBCache.cache_key.like(f"/tv/{tmdb_id}%"),
    ).first()
    if not cached or not isinstance(cached.raw_data, dict):
        return None
    if str(cached.raw_data.get("status") or "").lower() not in terminal_series_statuses:
        return None
    first_air_date = cached.raw_data.get("first_air_date")
    last_air_date = cached.raw_data.get("last_air_date")
    if not first_air_date or not last_air_date or len(first_air_date) < 4 or len(last_air_date) < 4:
        return None
    return f"{first_air_date[:4]}-{last_air_date[:4]}"

def _virtual_original_titles(db: Session, tmdb_id, media_type):
    if not tmdb_id:
        return None, None
    cached = db.query(TMDBCache).filter(
        TMDBCache.tmdb_id == tmdb_id,
        TMDBCache.cache_key.like(f"/{'tv' if media_type == 'tv' else 'movie'}/{tmdb_id}%"),
    ).order_by(TMDBCache.updated_at.desc()).first()
    if not cached or not isinstance(cached.raw_data, dict):
        return None, None
    return cached.raw_data.get("original_title"), cached.raw_data.get("original_name")

def _language_matches(lang_a, lang_b):
    if not lang_a or not lang_b:
        return False
    a = str(lang_a).lower()
    b = str(lang_b).lower()
    return a == b or a.split("-", 1)[0] == b.split("-", 1)[0]

def _cache_matches_media(cache, media_type, tmdb_id):
    cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
    endpoint_prefix = f"/{media_type}/{tmdb_id}"
    if not cache_key.startswith(endpoint_prefix):
        return False
    suffix = cache_key[len(endpoint_prefix):]
    return suffix == "" or suffix.startswith("?")

def _pick_best_cached_row(rows, preferred_languages):
    if not rows:
        return None

    def _cache_language(cache):
        cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
        try:
            parsed = urlsplit(cache_key)
            parsed_language = str((parse_qs(parsed.query).get("language") or [""])[0] or "")
            if parsed_language:
                return parsed_language
        except Exception:
            pass
        return str(cache.target_language or "")

    def _rank(cache):
        cache_lang = _cache_language(cache)
        for idx, preferred in enumerate(preferred_languages):
            if _language_matches(cache_lang, preferred):
                return idx, -cache.updated_at.timestamp()
        if _language_matches(cache_lang, "en"):
            return len(preferred_languages), -cache.updated_at.timestamp()
        return len(preferred_languages) + 1, -cache.updated_at.timestamp()

    return sorted(rows, key=_rank)[0]

def _preload_virtual_catalog_data(db: Session, states, preferred_languages, terminal_series_statuses):
    keys = {
        ((state.media_type or "movie"), state.tmdb_id)
        for state in (states or [])
        if getattr(state, "tmdb_id", None) and (state.media_type or "movie") in {"movie", "tv"}
    }
    if not keys:
        return {}

    candidate_ids = sorted({tmdb_id for _, tmdb_id in keys})
    list_rows = db.query(CustomListItem).filter(
        CustomListItem.tmdb_id.in_(candidate_ids),
        CustomListItem.media_type.in_(["movie", "tv"]),
    ).order_by(CustomListItem.id.desc()).all()
    list_item_map = {}
    for row in list_rows:
        key = ((row.media_type or "movie").lower(), row.tmdb_id)
        if key in keys and key not in list_item_map:
            list_item_map[key] = row

    cache_rows = db.query(TMDBCache).filter(TMDBCache.tmdb_id.in_(candidate_ids)).all()
    cache_grouped = {}
    for cache in cache_rows:
        for media_type, tmdb_id in keys:
            if cache.tmdb_id != tmdb_id or not _cache_matches_media(cache, media_type, tmdb_id):
                continue
            cache_grouped.setdefault((media_type, tmdb_id), []).append(cache)

    cache_map = {
        key: _pick_best_cached_row(rows, preferred_languages)
        for key, rows in cache_grouped.items()
    }

    payload = {}
    for key in keys:
        media_type, tmdb_id = key
        list_item = list_item_map.get(key)
        cached = cache_map.get(key)
        raw_data = cached.raw_data if cached and isinstance(cached.raw_data, dict) else {}

        title = "Unknown TMDB Item"
        if list_item and (list_item.title or "").strip():
            title = list_item.title.strip()
        elif media_type == "tv":
            title = raw_data.get("name") or raw_data.get("title") or title
        else:
            title = raw_data.get("title") or raw_data.get("name") or title

        poster = None
        if list_item and list_item.poster_path:
            poster = _public_image_path(list_item.poster_path, "posters") or list_item.poster_path
        if not poster:
            cached_poster = raw_data.get("poster_path")
            if cached_poster:
                poster = _public_image_path(cached_poster, "posters") or cached_poster

        year = None
        year_display = None
        release_date = raw_data.get("first_air_date") if media_type == "tv" else raw_data.get("release_date")
        if release_date and len(str(release_date)) >= 4:
            try:
                year = int(str(release_date)[:4])
            except (TypeError, ValueError):
                year = None

        if media_type == "tv" and str(raw_data.get("status") or "").lower() in terminal_series_statuses:
            first_air_date = raw_data.get("first_air_date")
            last_air_date = raw_data.get("last_air_date")
            if first_air_date and last_air_date and len(first_air_date) >= 4 and len(last_air_date) >= 4:
                first_year = first_air_date[:4]
                last_year = last_air_date[:4]
                year_display = first_year if first_year == last_year else f"{first_year}-{last_year}"

        payload[key] = {
            "title": title,
            "year": year,
            "year_display": year_display,
            "poster_path": poster,
            "original_title": raw_data.get("original_title"),
            "original_series_title": raw_data.get("original_name"),
        }
    return payload

def _serialize_virtual_state(db: Session, state, preferred_languages, terminal_series_statuses, preloaded_virtual_data=None):
    virtual_key = ((state.media_type or "movie"), state.tmdb_id)
    preloaded = (preloaded_virtual_data or {}).get(virtual_key)
    if preloaded:
        title = preloaded.get("title")
        year = preloaded.get("year")
        year_display = preloaded.get("year_display")
        poster = preloaded.get("poster_path")
        original_title = preloaded.get("original_title")
        original_series_title = preloaded.get("original_series_title")
    else:
        title, year, year_display, poster = _resolve_virtual_catalog_metadata(
            db,
            state.tmdb_id,
            state.media_type,
            preferred_languages,
            terminal_series_statuses,
        )
        original_title, original_series_title = _virtual_original_titles(db, state.tmdb_id, state.media_type)

    return {
        "id": None,
        "tmdb_id": state.tmdb_id,
        "title": title,
        "original_title": original_title,
        "original_series_title": original_series_title,
        "year": year,
        "year_display": year_display,
        "user_rating": state.user_rating or 0,
        "is_favorite": state.is_favorite,
        "poster_path": poster,
        "type": "virtual",
        "media_type": state.media_type,
    }

def _active_match(item):
    return next((match for match in item.matches if match.is_active), item.matches[0] if item.matches else None)

def _pick_match_loc(match, preferred_languages):
    return _pick_match_localization(match, preferred_languages)

def _serialize_movie_item(item, preferred_languages):
    match = _active_match(item)
    loc = _pick_match_loc(match, preferred_languages)
    poster = None
    if loc and (loc.poster_path or loc.series_poster_path):
        poster = _public_image_path(loc.poster_path or loc.series_poster_path, "posters")
    date_value = match.release_date or match.first_air_date if match else None
    return {
        "id": item.id,
        "tmdb_id": (match.tmdb_id or match.series_tmdb_id) if match else None,
        "title": (loc.title or loc.series_title) if loc else (item.internal_title or item.fn_title or item.folder_name),
        "original_title": loc.original_title if loc else None,
        "original_series_title": loc.original_series_title if loc else None,
        "year": date_value.year if date_value else (item.it_year or item.fd_year or item.fn_year),
        "year_display": None,
        "user_rating": item.user_rating or 0,
        "is_favorite": item.is_favorite,
        "poster_path": poster,
        "type": "physical",
        "media_type": "movie",
    }

def _serialize_person(person, preferred_language):
    loc = _pick_person_localization(person, preferred_language)
    return {
        "id": person.id,
        "name": loc.name if loc else "Unknown",
        "user_rating": person.user_rating or 0,
        "is_favorite": person.is_favorite,
        "profile_path": _resolve_person_profile_path(person),
        "has_local_profile": bool(_public_image_path(person.profile_path, "persons")),
    }

def _serialize_series_item(item, series_state_by_tmdb, preferred_languages, terminal_series_statuses, normalized_rating_filter, normalized_exact_rating, favorite_only, db):
    match = _active_match(item)
    if not match:
        return None

    tmdb_id = match.series_tmdb_id or match.tmdb_id
    state = series_state_by_tmdb.get(tmdb_id) if tmdb_id else None
    if state:
        user_rating = state.user_rating or 0
        is_favorite = state.is_favorite
    else:
        user_rating = (item.user_rating or 0) if item.item_type == ItemType.SERIES else 0
        is_favorite = item.is_favorite if item.item_type == ItemType.SERIES else False

    if not _matches_catalog_filters(user_rating, is_favorite, normalized_rating_filter, normalized_exact_rating, False):
        return None

    loc = _pick_match_loc(match, preferred_languages)
    poster = None
    if loc and (loc.series_poster_path or loc.poster_path):
        poster = _public_image_path(loc.series_poster_path or loc.poster_path, "posters")
    date_value = match.first_air_date or match.release_date
    year_display = None
    if str(match.release_status or "").lower() in terminal_series_statuses:
        year_display = _year_range_from_cache(db, tmdb_id, terminal_series_statuses)

    return {
        "id": item.id,
        "tmdb_id": tmdb_id,
        "title": (loc.series_title or loc.title) if loc else (item.internal_title or item.fn_title or item.folder_name),
        "original_title": loc.original_title if loc else None,
        "original_series_title": loc.original_series_title if loc else None,
        "year": date_value.year if date_value else (item.it_year or item.fd_year or item.fn_year),
        "year_display": year_display,
        "user_rating": user_rating,
        "is_favorite": is_favorite,
        "poster_path": poster,
        "type": "physical",
        "media_type": "tv",
    }

def _matches_catalog_search(item, search_term):
    if not search_term:
        return True
    values = [
        item.get("title"),
        item.get("original_title"),
        item.get("original_series_title"),
        item.get("name"),
        item.get("year_display"),
        item.get("year"),
    ]
    haystack = " ".join(str(value).lower() for value in values if value not in (None, ""))
    return search_term in haystack

def _sort_catalog_items(items, mode):
    direction = "desc" if str(mode or "").endswith("_desc") else "asc"
    metric = str(mode or "title_asc").replace("_asc", "").replace("_desc", "")

    def _text_value(item):
        return str(item.get("title") or item.get("name") or "").lower()

    def _numeric_value(item, key):
        value = item.get(key)
        return value if isinstance(value, (int, float)) and value is not None else 0

    if metric in {"title", "name"}:
        return sorted(items, key=_text_value, reverse=direction == "desc")
    if metric == "year":
        return sorted(
            items,
            key=lambda item: (_numeric_value(item, "year"), _text_value(item)),
            reverse=direction == "desc",
        )
    if metric == "user_rating":
        return sorted(
            items,
            key=lambda item: (_numeric_value(item, "user_rating"), _text_value(item)),
            reverse=direction == "desc",
        )
    if metric in {"favorite", "is_favorite"}:
        return sorted(
            items,
            key=lambda item: (1 if item.get("is_favorite") else 0, _text_value(item)),
            reverse=direction == "desc",
        )
    return sorted(items, key=_text_value)
