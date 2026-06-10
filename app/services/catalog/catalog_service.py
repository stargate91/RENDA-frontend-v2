import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, desc, func
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
from fastapi.responses import JSONResponse
from app.services.catalog.filters import (
    _apply_rating_filter,
    _apply_exact_rating_filter,
    _apply_favorite_filter,
    _apply_people_role_filter,
    _matches_catalog_filters,
    _normalize_media_type,
    _is_rated_value,
)
from app.services.catalog.helpers import (
    _year_range_from_cache,
    _preload_virtual_catalog_data,
    _serialize_virtual_state,
    _serialize_movie_item,
    _serialize_person,
    _serialize_series_item,
    _matches_catalog_search,
    _sort_catalog_items,
)
from app.services.catalog.providers.physical_provider import (
    _movie_query,
    _local_series_rows,
    _local_movie_tmdb_ids,
    fetch_physical_items,
)
from app.services.catalog.providers.virtual_provider import (
    backfill_virtual_states_from_lists,
    fetch_virtual_items,
    _virtual_query,
)
from app.services.catalog.providers.people_provider import (
    _library_visible_people_query,
    fetch_people,
)

logger = logging.getLogger(__name__)

class UserCatalogService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_catalog(
        self,
        unrated: bool = False,
        tab: str = None,
        offset: int = 0,
        limit: int = 40,
        search: str = "",
        sort_by: str = "title_asc",
        rating_filter: str = "all",
        exact_rating: float | None = None,
        favorite_only: bool = False,
        people_role: str = "all",
    ):
        """Returns catalog items filtered by rating state and favorite state."""
        db = self.db
        try:
            preferred_languages = _preferred_metadata_languages(db)
            preferred_language = preferred_languages[0]
            safe_offset = max(0, offset)
            safe_limit = max(1, min(limit, 1000))
            search_term = (search or "").strip().lower()
            search_like = f"%{search_term}%"
            terminal_series_statuses = {"ended", "canceled", "cancelled"}
            normalized_rating_filter = str(rating_filter or "all").strip().lower()
            normalized_people_role = str(people_role or "all").strip().lower()
            if tab == "actors":
                normalized_people_role = "actor"
            elif tab == "directors":
                normalized_people_role = "director"
            elif tab == "people":
                normalized_people_role = normalized_people_role or "all"
            if unrated and normalized_rating_filter == "all":
                normalized_rating_filter = "unrated"
            if normalized_rating_filter not in {"all", "rated", "unrated"}:
                normalized_rating_filter = "all"
            if normalized_people_role not in {"all", "actor", "director", "writer"}:
                normalized_people_role = "all"
            normalized_exact_rating = None
            if exact_rating is not None:
                try:
                    parsed_exact_rating = float(exact_rating)
                    if 0.5 <= parsed_exact_rating <= 10:
                        normalized_exact_rating = round(parsed_exact_rating * 2) / 2
                except (TypeError, ValueError):
                    normalized_exact_rating = None

            def _collect_available_ratings(items):
                ratings = {
                    round(float(item.get("user_rating") or 0) * 2) / 2
                    for item in items
                    if _is_rated_value(item.get("user_rating"))
                }
                return sorted(ratings)

            # Backfill states from lists using virtual provider
            backfill_virtual_states_from_lists(db)

            def _empty_paged_response(counts=None, page_items=None):
                counts = counts or {"movies": 0, "series": 0, "people": 0}
                page_items = page_items or []
                return {
                    "movies": page_items if tab == "movies" else [],
                    "series": page_items if tab == "series" else [],
                    "people": page_items if tab == "people" else [],
                    "counts": counts,
                    "page": {
                        "tab": tab,
                        "offset": safe_offset,
                        "limit": safe_limit,
                        "returned": len(page_items),
                        "has_more": safe_offset + len(page_items) < counts.get(tab, 0),
                    },
                }

            def _counts(local_series=None, local_series_ids=None):
                local_movie_ids = _local_movie_tmdb_ids(db)
                virtual_movie_query = _virtual_query(db, "movie", normalized_rating_filter, normalized_exact_rating, favorite_only)
                movie_count = _movie_query(db, normalized_rating_filter, normalized_exact_rating, favorite_only, search_term, search_like).count() + (
                    virtual_movie_query.filter(~VirtualMediaState.tmdb_id.in_(local_movie_ids)).count()
                    if local_movie_ids
                    else virtual_movie_query.count()
                )

                current_local_series = local_series
                current_local_series_ids = local_series_ids
                if current_local_series is None:
                    current_local_series = _local_series_rows(db, search_term, search_like, preferred_languages, terminal_series_statuses, normalized_rating_filter, normalized_exact_rating, favorite_only)
                current_local_series_ids = current_local_series_ids or {item["tmdb_id"] for item in current_local_series if item["tmdb_id"]}
                series_count = len(current_local_series) + (
                    _virtual_query(db, "tv", normalized_rating_filter, normalized_exact_rating, favorite_only).filter(~VirtualMediaState.tmdb_id.in_(current_local_series_ids)).count()
                    if current_local_series_ids
                    else _virtual_query(db, "tv", normalized_rating_filter, normalized_exact_rating, favorite_only).count()
                )

                people_count = _library_visible_people_query(db)
                people_count = _apply_people_role_filter(people_count, normalized_people_role)
                people_count = _apply_rating_filter(people_count, Person.user_rating, normalized_rating_filter)
                people_count = _apply_exact_rating_filter(people_count, Person.user_rating, normalized_exact_rating)
                people_count = _apply_favorite_filter(people_count, Person.is_favorite, favorite_only)

                return {
                    "movies": movie_count,
                    "series": series_count,
                    "people": people_count.count(),
                }

            if tab in {"movies", "series", "people", "actors", "directors"}:
                local_series = None
                local_series_ids = None
                if tab == "series":
                    local_series = _local_series_rows(db, search_term, search_like, preferred_languages, terminal_series_statuses, normalized_rating_filter, normalized_exact_rating, favorite_only)
                    local_series_ids = {item["tmdb_id"] for item in local_series if item["tmdb_id"]}
                counts = _counts(local_series=local_series, local_series_ids=local_series_ids)

                if tab in {"people", "actors", "directors"}:
                    query = _library_visible_people_query(db).options(
                        joinedload(Person.localizations),
                        joinedload(Person.media_links)
                    )
                    query = _apply_people_role_filter(query, normalized_people_role)
                    query = _apply_rating_filter(query, Person.user_rating, normalized_rating_filter)
                    query = _apply_exact_rating_filter(query, Person.user_rating, normalized_exact_rating)
                    query = _apply_favorite_filter(query, Person.is_favorite, favorite_only)
                    if search_term:
                        query = query.filter(Person.localizations.any(PersonLocalization.name.ilike(search_like)))
                    all_people = [_serialize_person(person, preferred_language) for person in query.order_by(Person.id.asc()).all()]
                    available_ratings = _collect_available_ratings(all_people)
                    all_people = _sort_catalog_items(all_people, sort_by if sort_by not in {"title_asc", "title_desc"} else sort_by.replace("title", "name"))
                    if search_term:
                        counts = {**counts, "people": len(all_people)}
                    page_items = all_people[safe_offset:safe_offset + safe_limit]
                    tab = "people"
                    response = _empty_paged_response(counts, page_items)
                    response["available_ratings"] = available_ratings
                    return response

                if tab == "movies":
                    physical_items = [_serialize_movie_item(item, preferred_languages) for item in _movie_query(db, normalized_rating_filter, normalized_exact_rating, favorite_only, search_term, search_like).order_by(MediaItem.id.asc()).all()]
                    local_movie_ids = _local_movie_tmdb_ids(db)
                    virtual_movies = _virtual_query(db, "movie", normalized_rating_filter, normalized_exact_rating, favorite_only)
                    if local_movie_ids:
                        virtual_movies = virtual_movies.filter(~VirtualMediaState.tmdb_id.in_(local_movie_ids))
                    virtual_movie_rows = virtual_movies.order_by(VirtualMediaState.updated_at.desc()).all()
                    virtual_movie_data = _preload_virtual_catalog_data(db, virtual_movie_rows, preferred_languages, terminal_series_statuses)
                    all_items = [
                        *physical_items,
                        *[_serialize_virtual_state(db, state, preferred_languages, terminal_series_statuses, virtual_movie_data) for state in virtual_movie_rows],
                    ]
                    all_items = _sort_catalog_items(all_items, sort_by)
                    if search_term:
                        filtered_items = [item for item in all_items if _matches_catalog_search(item, search_term)]
                        available_ratings = _collect_available_ratings(filtered_items)
                        counts = {**counts, "movies": len(filtered_items)}
                        page_items = filtered_items[safe_offset:safe_offset + safe_limit]
                        response = _empty_paged_response(counts, page_items)
                        response["available_ratings"] = available_ratings
                        return response
                    available_ratings = _collect_available_ratings(all_items)
                    response = _empty_paged_response(counts, all_items[safe_offset:safe_offset + safe_limit])
                    response["available_ratings"] = available_ratings
                    return response

                virtual_series = _virtual_query(db, "tv", normalized_rating_filter, normalized_exact_rating, favorite_only)
                if local_series_ids:
                    virtual_series = virtual_series.filter(~VirtualMediaState.tmdb_id.in_(local_series_ids))
                virtual_series_rows = virtual_series.order_by(VirtualMediaState.updated_at.desc()).all()
                virtual_series_data = _preload_virtual_catalog_data(db, virtual_series_rows, preferred_languages, terminal_series_statuses)
                all_items = [
                    *local_series,
                    *[_serialize_virtual_state(db, state, preferred_languages, terminal_series_statuses, virtual_series_data) for state in virtual_series_rows],
                ]
                all_items = _sort_catalog_items(all_items, sort_by)
                if search_term:
                    filtered_items = [item for item in all_items if _matches_catalog_search(item, search_term)]
                    available_ratings = _collect_available_ratings(filtered_items)
                    counts = {**counts, "series": len(filtered_items)}
                    page_items = filtered_items[safe_offset:safe_offset + safe_limit]
                    response = _empty_paged_response(counts, page_items)
                    response["available_ratings"] = available_ratings
                    return response
                available_ratings = _collect_available_ratings(all_items)
                response = _empty_paged_response(counts, all_items[safe_offset:safe_offset + safe_limit])
                response["available_ratings"] = available_ratings
                return response

            # 1. Fetch Physical MediaItems
            physical_items = fetch_physical_items(db, normalized_rating_filter, normalized_exact_rating, favorite_only)
        
            # 2. Fetch VirtualMediaStates
            virtual_items = fetch_virtual_items(db, normalized_rating_filter, normalized_exact_rating, favorite_only)
        
            # 3. Fetch People using people provider
            catalog = {
                "movies": [],
                "series": [],
                "people": [],
            }
            fetch_people(db, catalog, preferred_language, normalized_rating_filter, normalized_exact_rating, favorite_only, normalized_people_role)

            def _year_range(first_date, last_date):
                if not first_date or not last_date:
                    return None
                first_year = first_date.year
                last_year = last_date.year
                return f"{first_year}-{last_year}"

            def _get_match_data(item):
                tmdb_id, title, year, year_display, poster, loc = None, None, None, None, None, None
                if item.matches:
                    match = next((m for m in item.matches if m.is_active), item.matches[0])
                    if item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                        tmdb_id = match.series_tmdb_id or match.tmdb_id
                    else:
                        tmdb_id = match.tmdb_id or match.series_tmdb_id
                
                    loc = _pick_match_localization(match, preferred_languages)
                
                    if loc:
                        if item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                            title = loc.series_title or loc.title
                            p_path = loc.series_poster_path or loc.poster_path
                        else:
                            title = loc.title or loc.series_title
                            p_path = loc.poster_path or loc.series_poster_path
                        if p_path:
                            poster = _public_image_path(p_path, "posters")
                
                    # Get year
                    date = match.release_date or match.first_air_date
                    if date:
                        year = date.year
                    if item.item_type in [ItemType.SERIES, ItemType.EPISODE] and str(match.release_status or "").lower() in terminal_series_statuses:
                        year_display = _year_range(match.first_air_date, match.last_air_date)
                        if not year_display:
                            year_display = _year_range_from_cache(db, tmdb_id, terminal_series_statuses)
                    
                return tmdb_id, title, year, year_display, poster, loc

            seen_series_keys = set()
            seen_virtual_keys = set()
            for item in physical_items:
                tmdb_id, match_title, match_year, year_display, poster, loc = _get_match_data(item)
                if item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                    series_key = tmdb_id or match_title or item.internal_title or item.fn_title or item.folder_name
                    if series_key in seen_series_keys:
                        continue
                    seen_series_keys.add(series_key)

                    state = db.query(VirtualMediaState).filter(
                        VirtualMediaState.tmdb_id == tmdb_id,
                        VirtualMediaState.media_type == "tv",
                    ).first() if tmdb_id else None
                    if state:
                        user_rating = state.user_rating or 0
                        is_favorite = state.is_favorite
                    else:
                        user_rating = (item.user_rating or 0) if item.item_type == ItemType.SERIES else 0
                        is_favorite = item.is_favorite if item.item_type == ItemType.SERIES else False
                    if not _matches_catalog_filters(user_rating, is_favorite, normalized_rating_filter, normalized_exact_rating, False):
                        continue
                    seen_virtual_keys.add(("tv", tmdb_id))
                    catalog["series"].append({
                        "id": item.id,
                        "tmdb_id": tmdb_id,
                        "title": match_title or item.internal_title or item.fn_title or item.folder_name,
                        "original_title": loc.original_title if loc else None,
                        "original_series_title": loc.original_series_title if loc else None,
                        "year": match_year or item.it_year or item.fd_year or item.fn_year,
                        "year_display": year_display,
                        "user_rating": user_rating,
                        "is_favorite": is_favorite,
                        "poster_path": poster,
                        "type": "physical",
                        "media_type": "tv"
                    })
                    continue

                data = {
                    "id": item.id,
                    "tmdb_id": tmdb_id,
                    "title": match_title or item.internal_title or item.fn_title or item.folder_name,
                    "original_title": loc.original_title if loc else None,
                    "original_series_title": loc.original_series_title if loc else None,
                    "year": match_year or item.it_year or item.fd_year or item.fn_year,
                    "year_display": year_display,
                    "user_rating": item.user_rating or 0,
                    "is_favorite": item.is_favorite,
                    "poster_path": poster,
                    "type": "physical",
                    "media_type": "movie" if item.item_type == ItemType.MOVIE else "tv"
                }
                if item.item_type == ItemType.MOVIE:
                    seen_virtual_keys.add(("movie", tmdb_id))
                    catalog["movies"].append(data)
                
            # For virtual items, look up TMDB cache for title/poster metadata
            preloaded_virtual_catalog = _preload_virtual_catalog_data(db, virtual_items, preferred_languages, terminal_series_statuses)
            for v in virtual_items:
                if (v.media_type, v.tmdb_id) in seen_virtual_keys:
                    continue
                preloaded = preloaded_virtual_catalog.get((v.media_type, v.tmdb_id), {})
                title = preloaded.get("title")
                year = preloaded.get("year")
                year_display = preloaded.get("year_display")
                poster = preloaded.get("poster_path")
                original_title = preloaded.get("original_title")
                original_series_title = preloaded.get("original_series_title")

                item_data = {
                    "id": None,
                    "tmdb_id": v.tmdb_id,
                    "title": title,
                    "original_title": original_title,
                    "original_series_title": original_series_title,
                    "year": year,
                    "year_display": year_display,
                    "user_rating": v.user_rating or 0,
                    "is_favorite": v.is_favorite,
                    "poster_path": poster,
                    "type": "virtual",
                    "media_type": v.media_type
                }
            
                if v.media_type == "movie":
                    catalog["movies"].append(item_data)
                else:
                    catalog["series"].append(item_data)

            counts = {key: len(items) for key, items in catalog.items()}
            if tab in catalog:
                safe_offset = max(0, offset)
                safe_limit = max(1, min(limit, 100))
                page_items = catalog[tab][safe_offset:safe_offset + safe_limit]
                return {
                    "movies": page_items if tab == "movies" else [],
                    "series": page_items if tab == "series" else [],
                    "people": page_items if tab == "people" else [],
                    "counts": counts,
                    "page": {
                        "tab": tab,
                        "offset": safe_offset,
                        "limit": safe_limit,
                        "returned": len(page_items),
                        "has_more": safe_offset + len(page_items) < counts.get(tab, 0),
                    },
                }

            return {**catalog, "counts": counts}
        except Exception as e:
            logger.error(f"Error fetching catalog: {e}")
            return JSONResponse(status_code=500, content={"error": str(e)})
        finally:
            db.close()
