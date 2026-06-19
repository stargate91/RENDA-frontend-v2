from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import joinedload
from typing import Optional
from datetime import datetime, timedelta
import logging
import math
import threading

from app.db.base import Session, CacheSession
from app.db.models import (
    Person,
    MediaPersonLink,
    MediaMatch,
    MediaItem,
    ItemStatus,
    ItemType,
    ImageStatus,
    TMDBCache,
)

from app.utils.people_utils import (
    _get_or_create_person_db,
    _pick_person_localization,
    _preferred_metadata_language,
    _public_image_path,
    _resolve_person_profile_path,
    _pick_match_localization,
    _download_person_detail_assets,
)

from app.utils.library_utils import (
    _pick_backdrop_path,
    _pick_tmdb_cache,
    _get_omdb_ratings_from_imdb,
    _parse_omdb_float,
)
from app.utils.library_utils.image_constants import PERSON_SIZE
from app.api.tmdb_client import TMDBClient

logger = logging.getLogger(__name__)
router = APIRouter()
PERSON_INITIAL_CREDITS_PAGE_SIZE = 12
_PERSON_CREDIT_WARMUP_LOCK = threading.Lock()
_PERSON_CREDIT_WARMUP_CACHE: dict[tuple[int, str, int, int], float] = {}
_PERSON_CREDIT_WARMUP_TTL_SECONDS = 300.0
_PERSON_CREDIT_BACKDROPS_CACHE_TTL = timedelta(days=30)


def _person_credit_backdrops_cache_key(person_id: int, tmdb_id: int, media_type: str, language: str) -> str:
    return f"/people-credit-backdrops/{person_id}/{media_type}/{tmdb_id}?language={language or 'en-US'}"


def _get_cached_person_credit_backdrops(person_id: int, tmdb_id: int, media_type: str, language: str) -> Optional[dict]:
    cache_key = _person_credit_backdrops_cache_key(person_id, tmdb_id, media_type, language)
    cache_db = CacheSession()
    try:
        cache_item = cache_db.query(TMDBCache).filter(TMDBCache.cache_key == cache_key).first()
        if not cache_item or not isinstance(cache_item.raw_data, dict):
            return None
        if datetime.utcnow() - cache_item.updated_at >= _PERSON_CREDIT_BACKDROPS_CACHE_TTL:
            return None
        return cache_item.raw_data
    except Exception as exc:
        logger.warning(f"Failed to read person credit backdrop cache {cache_key}: {exc}")
        return None
    finally:
        cache_db.close()
        CacheSession.remove()


def _set_cached_person_credit_backdrops(person_id: int, tmdb_id: int, media_type: str, language: str, payload: dict) -> None:
    cache_key = _person_credit_backdrops_cache_key(person_id, tmdb_id, media_type, language)
    cache_db = CacheSession()
    try:
        cache_item = cache_db.query(TMDBCache).filter(TMDBCache.cache_key == cache_key).first()
        if not cache_item:
            cache_item = TMDBCache(cache_key=cache_key)
            cache_db.add(cache_item)
        cache_item.tmdb_id = tmdb_id
        cache_item.item_type = ItemType.SERIES if media_type == 'tv' else ItemType.MOVIE
        cache_item.locale = language or 'en-US'
        cache_item.raw_data = payload
        cache_item.updated_at = datetime.utcnow()
        cache_db.commit()
    except Exception as exc:
        cache_db.rollback()
        logger.warning(f"Failed to write person credit backdrop cache {cache_key}: {exc}")
    finally:
        cache_db.close()
        CacheSession.remove()

TALK_LIKE_GENRE_IDS = {10763, 10764, 10767}
SELF_ROLE_KEYWORDS = {
    "self",
    "himself",
    "herself",
    "themselves",
    "guest",
    "host",
    "presenter",
    "interviewer",
}
VOICE_ROLE_KEYWORDS = {
    "voice",
    "vo",
    "dub",
    "dubbed",
    "narrator",
    "announcer",
}
DIRECTING_JOBS = {"director", "creator"}
WRITING_JOBS = {"writer", "screenplay", "story", "teleplay"}


def _normalize_words(value: Optional[str]) -> set[str]:
    if not value:
        return set()
    return {
        word.strip(".,:;!?()[]{}\"'").lower()
        for word in str(value).replace("/", " ").replace("-", " ").split()
        if word.strip()
    }


def _is_self_or_guest_credit(credit: dict) -> bool:
    role_words = _normalize_words(credit.get("job"))
    if role_words.intersection(SELF_ROLE_KEYWORDS):
        return True

    if any(word in {"self", "guest"} for word in _normalize_words(credit.get("character"))):
        return True

    genre_ids = set(credit.get("genre_ids") or [])
    if genre_ids.intersection(TALK_LIKE_GENRE_IDS) and not credit.get("character"):
        return True

    return False


def _department_matches_credit(credit: dict, department: Optional[str]) -> bool:
    normalized_department = str(department or "").strip().lower()
    if not normalized_department:
        return False

    job_words = _normalize_words(credit.get("job"))
    media_type = credit.get("media_type")

    if normalized_department == "acting":
        return media_type in {"movie", "tv"} and bool(credit.get("character"))
    if normalized_department in {"directing", "creator"}:
        return bool(job_words.intersection(DIRECTING_JOBS))
    if normalized_department == "writing":
        return bool(job_words.intersection(WRITING_JOBS))

    return False


def _is_voice_credit(credit: dict) -> bool:
    character_words = _normalize_words(credit.get("character"))
    job_words = _normalize_words(credit.get("job"))
    if character_words.intersection(VOICE_ROLE_KEYWORDS):
        return True
    return bool(job_words.intersection(VOICE_ROLE_KEYWORDS))


def _known_for_score(credit: dict, department: Optional[str], adult_only: bool = False) -> float:
    score = 0.0

    vote_average = float(credit.get("rating") or 0.0)
    vote_count = float(credit.get("vote_count") or 0.0)
    popularity = float(credit.get("popularity") or 0.0)
    vote_count_weight = 5.0 if adult_only else 10.0

    score += vote_average * 6.0
    score += math.log1p(max(vote_count, 0.0)) * vote_count_weight
    score += min(popularity, 1000.0) * 0.3

    order = credit.get("order")
    if isinstance(order, int):
        if order <= 2:
            score += 35.0
        elif order <= 5:
            score += 24.0
        elif order <= 10:
            score += 12.0
        if adult_only:
            score += max(0, 18 - (order * 2.5))

    if credit.get("is_lead"):
        score += 18.0

    if bool(credit.get("character")) and credit.get("order") == 0:
        score += 17.0

    if _department_matches_credit(credit, department):
        score += 22.0

    if credit.get("poster_path"):
        score += 4.0

    if _is_self_or_guest_credit(credit):
        score -= 45.0

    return score


def _select_known_for(credits: list[dict], department: Optional[str], limit: int = 8, adult_only: bool = False) -> list[dict]:
    if not credits:
        return []

    normalized_department = str(department or "").strip().lower()

    ranked = sorted(
        credits,
        key=lambda credit: (_known_for_score(credit, department, adult_only=adult_only), credit.get("year") or 0),
        reverse=True,
    )

    selected: list[dict] = []
    selected_ids: set[tuple[int, str]] = set()
    self_like_count = 0

    def add_from_pool(pool: list[dict], max_self_like: Optional[int] = None):
        nonlocal self_like_count
        for credit in pool:
            if len(selected) >= limit:
                break
            credit_key = (int(credit.get("id") or 0), str(credit.get("type") or ""))
            if credit_key in selected_ids:
                continue

            is_self_like = _is_self_or_guest_credit(credit)
            if max_self_like is not None and is_self_like and self_like_count >= max_self_like:
                continue

            selected.append(credit)
            selected_ids.add(credit_key)
            if is_self_like:
                self_like_count += 1

    primary_pool = [
        credit for credit in ranked
        if _department_matches_credit(credit, department)
        and not _is_self_or_guest_credit(credit)
        and not (normalized_department == "acting" and _is_voice_credit(credit))
    ]
    secondary_pool = [
        credit for credit in ranked
        if _department_matches_credit(credit, department)
    ]
    tertiary_pool = [
        credit for credit in ranked
        if not _is_self_or_guest_credit(credit)
    ]

    add_from_pool(primary_pool, max_self_like=0)
    add_from_pool(secondary_pool, max_self_like=1)
    add_from_pool(tertiary_pool, max_self_like=1)
    add_from_pool(ranked, max_self_like=1)

    return selected[:limit]

def _backdrop_resolution_from_raw(raw_data: Optional[dict], backdrop_path: Optional[str]) -> int:
    if not raw_data or not backdrop_path:
        return 0

    backdrops = ((raw_data.get("images") or {}).get("backdrops") or [])
    for backdrop in backdrops:
        if backdrop.get("file_path") != backdrop_path:
            continue
        width = int(backdrop.get("width") or 0)
        height = int(backdrop.get("height") or 0)
        return width * height

    if raw_data.get("backdrop_path") == backdrop_path:
        width = int(raw_data.get("backdrop_width") or 0)
        height = int(raw_data.get("backdrop_height") or 0)
        return width * height

    return 0


def _resolve_person_known_for_backdrop(
    db,
    tmdb_client,
    credits: list[dict],
    preferred_languages: list[str],
    department: Optional[str] = None,
    adult_only: bool = False,
    respect_credit_order: bool = False,
) -> Optional[str]:
    candidates: list[tuple[int, str]] = []
    seen_media: set[tuple[str, int]] = set()
    max_scan = 5 if adult_only else 3

    ranked_credits = list(credits or []) if respect_credit_order else sorted(
        credits or [],
        key=lambda credit: (
            _known_for_score(credit, department, adult_only=adult_only),
            int(str((credit.get("release_date") if credit.get("media_type") == "movie" else credit.get("first_air_date")) or "0")[:4] or 0),
        ),
        reverse=True,
    )

    for credit in ranked_credits:
        media_type = credit.get("media_type")
        credit_id = credit.get("id")
        if media_type not in {"movie", "tv"} or not credit_id:
            continue
        try:
            parsed_credit_id = int(credit_id)
        except (TypeError, ValueError):
            continue

        media_key = (media_type, parsed_credit_id)
        if media_key in seen_media:
            continue
        seen_media.add(media_key)
        if len(seen_media) > max_scan:
            break

        cache_media_type = "movie" if media_type == "movie" else "tv"
        cached = _pick_tmdb_cache(db, parsed_credit_id, cache_media_type, preferred_languages)
        raw_data = cached.raw_data if cached and isinstance(cached.raw_data, dict) else None

        if raw_data is None:
            raw_data = tmdb_client.get_details(parsed_credit_id, "movie" if media_type == "movie" else "series", language=preferred_languages[0])

        if adult_only and not bool((raw_data or {}).get("adult")):
            continue

        backdrop_path = _pick_backdrop_path(raw_data, preferred_languages[0]) if raw_data else None
        if backdrop_path:
            candidates.append((_backdrop_resolution_from_raw(raw_data, backdrop_path), backdrop_path))
            continue

        fallback_backdrop = credit.get("backdrop_path")
        if fallback_backdrop:
            candidates.append((0, fallback_backdrop))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def _normalize_credit_title(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = str(value).lower()
    return "".join(ch if ch.isalnum() else " " for ch in normalized).strip()


def _credit_identity_candidates(credit: dict) -> list[str]:
    values = [
        credit.get("tmdb_id"),
        credit.get("series_tmdb_id"),
        credit.get("library_series_tmdb_id"),
        credit.get("library_item_id"),
        credit.get("id"),
    ]
    return [str(value) for value in values if value not in (None, "")]


def _credit_matches_known_for(credit: dict, known_for_entry: dict) -> bool:
    if str(credit.get("media_type") or credit.get("type") or "") != str(known_for_entry.get("media_type") or known_for_entry.get("type") or ""):
        return False

    credit_ids = _credit_identity_candidates(credit)
    known_for_ids = _credit_identity_candidates(known_for_entry)
    if any(credit_id in known_for_ids for credit_id in credit_ids):
        return True

    credit_title = _normalize_credit_title(credit.get("title") or credit.get("name"))
    known_for_title = _normalize_credit_title(known_for_entry.get("title") or known_for_entry.get("name"))
    if not credit_title or not known_for_title or credit_title != known_for_title:
        return False

    credit_year = str(credit.get("year") or "")
    known_for_year = str(known_for_entry.get("year") or "")
    return not credit_year or not known_for_year or credit_year == known_for_year


def _prioritize_person_credits(items: list[dict], known_for_items: list[dict]) -> list[dict]:
    if not items:
        return []

    known_for_rank: dict[str, int] = {}
    for index, entry in enumerate(known_for_items or []):
        ids = _credit_identity_candidates(entry)
        fallback_key = f"{entry.get('media_type') or entry.get('type')}:{_normalize_credit_title(entry.get('title') or entry.get('name'))}:{entry.get('year') or ''}"
        known_for_rank[ids[0] if ids else fallback_key] = index

    prioritized = []
    for entry in items:
        matched = next((known for known in (known_for_items or []) if _credit_matches_known_for(entry, known)), None)
        ids = _credit_identity_candidates(matched) if matched else []
        fallback_key = f"{entry.get('media_type') or entry.get('type')}:{_normalize_credit_title(entry.get('title') or entry.get('name'))}:{entry.get('year') or ''}"
        rank_key = ids[0] if ids else fallback_key
        prioritized.append({
            **entry,
            "is_known_for": bool(matched),
            "known_for_rank": known_for_rank.get(rank_key, 10**9),
        })

    prioritized.sort(
        key=lambda entry: (
            0 if entry.get("is_known_for") else 1,
            entry.get("known_for_rank", 10**9),
            0 if entry.get("in_library") else 1,
            -(int(entry.get("year") or 0)),
            str(entry.get("title") or ""),
        )
    )
    return prioritized


def _exclude_known_for_credits(items: list[dict], known_for_items: list[dict]) -> list[dict]:
    if not items or not known_for_items:
        return items or []
    return [
        entry for entry in items
        if not any(_credit_matches_known_for(entry, known_for_entry) for known_for_entry in known_for_items)
    ]


def _apply_local_poster_paths(items: list[dict]) -> list[dict]:
    for item in items:
        original_poster = item.get("poster_path")
        local_poster = _public_image_path(original_poster, "posters")
        item["poster_path"] = local_poster if local_poster else original_poster
        item["has_local_poster"] = bool(local_poster)
    return items


def _paginate_items(items: list[dict], page: int, page_size: int) -> dict:
    safe_page_size = max(1, min(60, int(page_size or 1)))
    total_items = len(items)
    total_pages = max(1, math.ceil(total_items / safe_page_size)) if total_items else 1
    safe_page = max(1, min(int(page or 1), total_pages))
    start_index = (safe_page - 1) * safe_page_size
    return {
        "items": items[start_index:start_index + safe_page_size],
        "page": safe_page,
        "page_size": safe_page_size,
        "total_items": total_items,
        "total_pages": total_pages,
    }


def _build_person_asset_preload_batches(movies: list[dict], series: list[dict], known_for: list[dict], first_page_size: int = 8) -> tuple[list[dict], list[dict]]:
    prioritized_movies = _prioritize_person_credits(movies or [], known_for or [])
    prioritized_series = _prioritize_person_credits(series or [], known_for or [])
    first_movies_page = _paginate_items(prioritized_movies, 1, first_page_size)["items"]
    first_series_page = _paginate_items(prioritized_series, 1, first_page_size)["items"]
    preload_movies = list(known_for or []) + first_movies_page
    preload_series = first_series_page
    return preload_movies, preload_series


def _schedule_person_credit_poster_warmup(person_id: int, media_type: str, page: int, page_size: int, items: list[dict]) -> None:
    if not items:
        return

    warmup_key = (int(person_id), str(media_type), int(page), int(page_size))

    with _PERSON_CREDIT_WARMUP_LOCK:
        import time

        current_time = time.time()
        expired_keys = [
            key for key, timestamp in _PERSON_CREDIT_WARMUP_CACHE.items()
            if current_time - timestamp >= _PERSON_CREDIT_WARMUP_TTL_SECONDS
        ]
        for expired_key in expired_keys:
            _PERSON_CREDIT_WARMUP_CACHE.pop(expired_key, None)

        if warmup_key in _PERSON_CREDIT_WARMUP_CACHE:
            return
        _PERSON_CREDIT_WARMUP_CACHE[warmup_key] = current_time

    def _warmup():
        try:
            if media_type == "series":
                _download_person_detail_assets(None, None, [], items, None)
            else:
                _download_person_detail_assets(None, None, items, [], None)
        except Exception as exc:
            logger.error(f"Failed to warm person credit posters for {person_id} {media_type} page {page}: {exc}")

    threading.Thread(target=_warmup, daemon=True).start()


def _load_person_credit_payload(db, person_id: int, person: Person, ui_lang: str, target_lang: str, lead_cast_order_threshold: int = 3) -> dict:
    links = db.query(MediaPersonLink).join(MediaPersonLink.media_match).join(MediaMatch.media_item).filter(
        MediaPersonLink.person_id == person_id,
        MediaMatch.is_active == True,
        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
    ).options(
        joinedload(MediaPersonLink.media_match).joinedload(MediaMatch.media_item),
        joinedload(MediaPersonLink.media_match).joinedload(MediaMatch.localizations)
    ).all()

    movies = []
    series_map = {}
    person_backdrop = None

    for link in links:
        item = link.media_match.media_item
        match = link.media_match
        item_loc = _pick_match_localization(match.localizations, ui_lang)

        title = item_loc.title if item_loc else item.fn_title or item.filename
        poster_path = item_loc.poster_path if item_loc else None

        if item.item_type == ItemType.MOVIE:
            movies.append({
                "id": item.id,
                "title": title,
                "type": item.item_type.value,
                "media_type": "movie",
                "tmdb_id": match.tmdb_id,
                "year": match.release_date.year if match.release_date else None,
                "poster_path": poster_path,
                "backdrop_path": match.backdrop_path,
                "rating": match.rating_tmdb or 0.0,
                "rating_tmdb": match.rating_tmdb or 0.0,
                "rating_imdb": match.rating_imdb,
                "job": link.job,
                "character": link.character_name,
                "is_lead": False,
                "in_library": True,
                "library_item_id": item.id,
            })
        else:
            series_title = (item_loc.series_title if item_loc else None) or title
            sid = match.series_tmdb_id or match.tmdb_id or series_title
            if sid not in series_map:
                series_map[sid] = {
                    "id": f"series_{sid}",
                    "series_tmdb_id": match.series_tmdb_id or match.tmdb_id,
                    "tmdb_id": match.series_tmdb_id or match.tmdb_id,
                    "title": series_title,
                    "type": "series",
                    "media_type": "tv",
                    "year": match.first_air_date.year if match.first_air_date else (match.release_date.year if match.release_date else None),
                    "poster_path": item_loc.series_poster_path if item_loc and item_loc.series_poster_path else poster_path,
                    "backdrop_path": match.backdrop_path,
                    "rating": match.rating_tmdb or 0.0,
                    "rating_tmdb": match.rating_tmdb or 0.0,
                    "rating_imdb": match.rating_imdb,
                    "job": link.job,
                    "character": link.character_name,
                    "is_lead": False,
                    "episode_count": 0,
                    "in_library": True,
                    "library_series_tmdb_id": match.series_tmdb_id or match.tmdb_id,
                }
            series_map[sid]["episode_count"] += 1

    all_movies = movies
    all_series = list(series_map.values())
    known_for = []
    tmdb_data = {}

    try:
        from app.api.tmdb_client import TMDBClient
        tmdb_client = TMDBClient(db)
        tmdb_data = tmdb_client.get_person_details(person_id, language=target_lang)
        credits_data = tmdb_data.get("combined_credits", {})
        cast_list = credits_data.get("cast", [])
        crew_list = credits_data.get("crew", [])
        if cast_list or crew_list:
            preferred_languages = [target_lang, "en"]

            def _get_virtual_credit_imdb_rating(tmdb_id: int, media_type: str):
                cache = _pick_tmdb_cache(db, tmdb_id, media_type, preferred_languages)
                if not cache or not isinstance(cache.raw_data, dict):
                    return None
                imdb_id = cache.raw_data.get("external_ids", {}).get("imdb_id") or cache.raw_data.get("imdb_id")
                if not imdb_id:
                    return None
                omdb_raw = _get_omdb_ratings_from_imdb(db, imdb_id)
                return _parse_omdb_float(omdb_raw.get("imdb_rating"))

            def _get_credit_backdrop_path(tmdb_id: int, media_type: str, credit: dict) -> Optional[str]:
                direct_backdrop = credit.get("backdrop_path")
                if direct_backdrop:
                    return direct_backdrop

                cache = _pick_tmdb_cache(db, tmdb_id, media_type, preferred_languages)
                raw_data = cache.raw_data if cache and isinstance(cache.raw_data, dict) else None
                if not raw_data:
                    return None

                return (
                    _pick_backdrop_path(raw_data, preferred_languages[0])
                    or raw_data.get("backdrop_path")
                )

            local_movies = db.query(MediaMatch.tmdb_id, MediaItem.id, MediaMatch.rating_imdb).join(MediaMatch.media_item).filter(
                MediaMatch.is_active == True,
                MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                MediaItem.item_type == ItemType.MOVIE
            ).all()
            local_movies_map = {}
            for movie in local_movies:
                if not movie.tmdb_id:
                    continue
                existing = local_movies_map.get(movie.tmdb_id)
                if not existing or (movie.rating_imdb or 0) > (existing.get("rating_imdb") or 0):
                    local_movies_map[movie.tmdb_id] = {
                        "library_item_id": movie.id,
                        "rating_imdb": movie.rating_imdb,
                    }

            local_series = db.query(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id, MediaMatch.rating_imdb).join(MediaMatch.media_item).filter(
                MediaMatch.is_active == True,
                MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE])
            ).all()
            local_series_map = {}
            for series in local_series:
                if series.series_tmdb_id:
                    existing = local_series_map.get(series.series_tmdb_id)
                    if not existing or (series.rating_imdb or 0) > (existing.get("rating_imdb") or 0):
                        local_series_map[series.series_tmdb_id] = {"rating_imdb": series.rating_imdb}
                if series.tmdb_id:
                    existing = local_series_map.get(series.tmdb_id)
                    if not existing or (series.rating_imdb or 0) > (existing.get("rating_imdb") or 0):
                        local_series_map[series.tmdb_id] = {"rating_imdb": series.rating_imdb}

            combined_credits = {}
            for credit in cast_list + crew_list:
                cid = credit.get("id")
                media_type = credit.get("media_type")
                if not cid or media_type not in {"movie", "tv"}:
                    continue

                key = (cid, media_type)
                if "character" in credit and credit["character"]:
                    role = f"as {credit['character']}"
                elif "job" in credit and credit["job"]:
                    role = credit["job"]
                else:
                    role = "Actor" if media_type == "movie" else "Cast"

                is_lead = (
                    media_type in ("movie", "tv")
                    and bool(credit.get("character"))
                    and isinstance(credit.get("order"), int)
                    and credit["order"] <= lead_cast_order_threshold
                )

                if key not in combined_credits:
                    date_str = credit.get("release_date") if media_type == "movie" else credit.get("first_air_date")
                    year = None
                    if date_str:
                        try:
                            year = int(str(date_str).split("-")[0])
                        except Exception:
                            year = None

                    title = credit.get("title") if media_type == "movie" else credit.get("name")
                    in_library = False
                    library_item_id = None
                    library_series_tmdb_id = None

                    if media_type == "movie" and cid in local_movies_map:
                        in_library = True
                        library_item_id = local_movies_map[cid]["library_item_id"]
                    elif media_type == "tv" and cid in local_series_map:
                        in_library = True
                        library_series_tmdb_id = cid

                    virtual_imdb_rating = _get_virtual_credit_imdb_rating(cid, media_type)
                    resolved_backdrop_path = _get_credit_backdrop_path(cid, media_type, credit)
                    combined_credits[key] = {
                        "id": cid,
                        "tmdb_id": cid,
                        "title": title or "Unknown",
                        "type": "movie" if media_type == "movie" else "series",
                        "media_type": media_type,
                        "year": year,
                        "poster_path": credit.get("poster_path"),
                        "backdrop_path": resolved_backdrop_path,
                        "rating": credit.get("vote_average") or 0.0,
                        "rating_tmdb": credit.get("vote_average") or 0.0,
                        "vote_count": credit.get("vote_count") or 0,
                        "popularity": credit.get("popularity") or 0.0,
                        "genre_ids": credit.get("genre_ids") or [],
                        "rating_imdb": (
                            local_movies_map.get(cid, {}).get("rating_imdb")
                            if media_type == "movie"
                            else local_series_map.get(cid, {}).get("rating_imdb")
                        ) or virtual_imdb_rating,
                        "roles": [role],
                        "is_lead": is_lead,
                        "order": credit.get("order") if isinstance(credit.get("order"), int) else None,
                        "character": credit.get("character"),
                        "in_library": in_library,
                        "library_item_id": library_item_id,
                        "library_series_tmdb_id": library_series_tmdb_id,
                        "series_tmdb_id": cid if media_type == "tv" else None,
                    }
                else:
                    if role and role not in combined_credits[key]["roles"]:
                        combined_credits[key]["roles"].append(role)
                    if is_lead:
                        combined_credits[key]["is_lead"] = True

            parsed_movies = []
            parsed_series = []
            ordered_credits = []
            for credit in combined_credits.values():
                serialized_credit = {
                    **credit,
                    "job": ", ".join(credit["roles"]),
                }
                del serialized_credit["roles"]
                ordered_credits.append(serialized_credit)
                if serialized_credit["type"] == "movie":
                    parsed_movies.append(serialized_credit)
                else:
                    parsed_series.append(serialized_credit)

            known_for = _select_known_for(
                ordered_credits,
                person.known_for_department,
                limit=8,
                adult_only=bool(getattr(person, "is_adult", False)),
            )
            person_backdrop = _resolve_person_known_for_backdrop(
                db,
                tmdb_client,
                known_for,
                preferred_languages,
                department=person.known_for_department,
                adult_only=bool(getattr(person, "is_adult", False)),
                respect_credit_order=True,
            )
            all_movies = parsed_movies
            all_series = parsed_series
    except Exception as ex:
        logger.error(f"Failed to load or parse TMDB credits for person {person_id}: {ex}")

    if getattr(person, "manual_backdrop_path", None):
        person_backdrop = person.manual_backdrop_path
    elif not person_backdrop:
        for link in links:
            if link.media_match and (getattr(link.media_match, "manual_backdrop_path", None) or link.media_match.backdrop_path):
                person_backdrop = getattr(link.media_match, "manual_backdrop_path", None) or link.media_match.backdrop_path
                break

    all_movies.sort(key=lambda entry: entry.get("year") or 0, reverse=True)
    all_series.sort(key=lambda entry: entry.get("year") or 0, reverse=True)

    return {
        "tmdb_data": tmdb_data,
        "person_backdrop": person_backdrop,
        "known_for": known_for,
        "movies": all_movies,
        "series": all_series,
    }


@router.get("/people/{person_id:int}")
def get_person_detail(person_id: int):
    """Returns comprehensive detail data for a single person, including their biography and associated library items."""
    db = Session()
    try:
        lead_cast_order_threshold = 3
        
        person = db.query(Person).options(
            joinedload(Person.localizations)
        ).filter(Person.id == person_id).first()
        
        if not person:
            person = _get_or_create_person_db(db, person_id)
            if person:
                # Re-query with localizations loaded
                person = db.query(Person).options(
                    joinedload(Person.localizations)
                ).filter(Person.id == person_id).first()
                
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})
            
        ui_lang = _preferred_metadata_language(db)

        # Ensure we have rich metadata for the person (language support)
        target_lang = ui_lang or "en"
        fetched_langs = (person.fetched_languages or "").split(",")
        if target_lang.split("-")[0] not in fetched_langs or not person.images:
            try:
                from app.services.person_service import PersonService
                person_service = PersonService(db)
                enriched_person = person_service.enrich_person_metadata(person_id, [target_lang, "en"])
                if enriched_person:
                    person = enriched_person
            except Exception as e:
                logger.error(f"Failed to dynamically enrich person {person_id}: {e}")

        loc = _pick_person_localization(person, ui_lang)
                
        credit_payload = _load_person_credit_payload(
            db,
            person_id=person_id,
            person=person,
            ui_lang=ui_lang,
            target_lang=target_lang,
            lead_cast_order_threshold=lead_cast_order_threshold,
        )
        tmdb_data = credit_payload["tmdb_data"]
        person_backdrop = credit_payload["person_backdrop"]
        known_for = _apply_local_poster_paths(credit_payload["known_for"])
        all_movies = credit_payload["movies"]
        all_series = credit_payload["series"]
        prioritized_movies = _prioritize_person_credits(all_movies, credit_payload["known_for"])
        prioritized_series = _prioritize_person_credits(all_series, credit_payload["known_for"])
        initial_movies_page = _paginate_items(prioritized_movies, 1, PERSON_INITIAL_CREDITS_PAGE_SIZE)
        initial_series_page = _paginate_items(prioritized_series, 1, PERSON_INITIAL_CREDITS_PAGE_SIZE)
        initial_movies_page["items"] = _apply_local_poster_paths(initial_movies_page["items"])
        initial_series_page["items"] = _apply_local_poster_paths(initial_series_page["items"])
        preload_movies, preload_series = _build_person_asset_preload_batches(
            all_movies,
            all_series,
            credit_payload["known_for"],
            first_page_size=PERSON_INITIAL_CREDITS_PAGE_SIZE,
        )

        profile_path = person.manual_profile_path or person.profile_path
        person_images = list(person.images or [])
        threading.Thread(
            target=_download_person_detail_assets,
            args=(profile_path, person_images, preload_movies, preload_series, person_backdrop),
            daemon=True
        ).start()

        effective_profile_path = person.manual_profile_path or person.profile_path
        has_local_profile = bool(
            _public_image_path(
                person.manual_local_profile_path
                or person.local_profile_path
                or person.manual_profile_path
                or person.profile_path,
                "persons",
            )
        )
        if effective_profile_path and not _resolve_person_profile_path(person):
            person.image_status = ImageStatus.FAILED
        elif effective_profile_path and has_local_profile:
            person.image_status = ImageStatus.COMPLETED

        local_images = []
        seen_images = set()
        for image_path in person.images or []:
            if not image_path:
                continue
            if image_path.startswith("http://") or image_path.startswith("https://"):
                resolved = image_path
            else:
                local_image = _public_image_path(image_path, "persons")
                if local_image:
                    resolved = local_image
                else:
                    resolved = f"https://image.tmdb.org/t/p/{PERSON_SIZE}{image_path}"
            
            if resolved not in seen_images:
                seen_images.add(resolved)
                local_images.append(resolved)

        db.commit()
        
        result = {
            "id": person.id,
            "name": loc.name if loc else "Unknown",
            "alternate_names": [
                alias for alias in (tmdb_data.get("also_known_as") or (person.external_ids or {}).get("aliases") or [])
                if isinstance(alias, str) and alias.strip() and alias.strip() != (loc.name if loc else "Unknown")
            ],
            "biography": loc.biography if loc else None,
            "birthday": person.birthday,
            "deathday": person.deathday,
            "place_of_birth": person.place_of_birth,
            "gender": person.gender,
            "popularity": person.popularity or 0.0,
            "known_for_department": person.known_for_department,
            "is_adult": bool(getattr(person, "is_adult", False)),
            "profile_path": _resolve_person_profile_path(person),
            "has_local_profile": bool(_public_image_path(person.manual_local_profile_path or person.manual_profile_path or person.local_profile_path or person.profile_path, "persons")),
            "backdrop_path": _public_image_path(person.manual_local_backdrop_path or person_backdrop, "backdrops") or person_backdrop,
            "has_local_backdrop": bool(_public_image_path(person.manual_local_backdrop_path or person_backdrop, "backdrops")),
            "is_active": person.is_active,
            "is_favorite": person.is_favorite,
            "user_rating": person.user_rating,
            "user_comment": person.user_comment,
            "custom_tags": person.custom_tags or [],
            "homepage": tmdb_data.get("homepage") or None,
            "external_ids": {
                **(person.external_ids or {}),
                **(tmdb_data.get("external_ids") or {}),
                **({"tmdb_id": tmdb_data["id"]} if tmdb_data and tmdb_data.get("id") else {})
            },
            "images": local_images,
            "known_for": known_for,
            "total_movie_credits": len(all_movies),
            "total_series_credits": len(all_series),
            "initial_movie_credits_page": initial_movies_page,
            "initial_series_credits_page": initial_series_page,
        }
        
        return JSONResponse(content=result, media_type="application/json; charset=utf-8")
    except Exception as e:
        import traceback
        logger.error(f"Error getting person detail: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()


@router.get("/people/{person_id:int}/movies")
def get_person_movies(
    person_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=8, ge=1, le=60),
    exclude_known_for: bool = Query(default=False),
):
    db = Session()
    try:
        person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            person = _get_or_create_person_db(db, person_id)
            if person:
                person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        ui_lang = _preferred_metadata_language(db)
        target_lang = ui_lang or "en"
        credit_payload = _load_person_credit_payload(db, person_id, person, ui_lang, target_lang)
        base_items = credit_payload["movies"]
        if exclude_known_for:
            base_items = _exclude_known_for_credits(base_items, credit_payload["known_for"])
            prioritized = sorted(
                base_items,
                key=lambda entry: (_known_for_score(entry, person.known_for_department, adult_only=bool(getattr(person, "is_adult", False))), entry.get("year") or 0),
                reverse=True,
            )
        else:
            prioritized = _prioritize_person_credits(base_items, credit_payload["known_for"])
        paged = _paginate_items(prioritized, page, page_size)
        _schedule_person_credit_poster_warmup(person_id, "movies", paged["page"], paged["page_size"], paged["items"])
        paged["items"] = _apply_local_poster_paths(paged["items"])
        return JSONResponse(content=paged, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting person movies for {person_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()


@router.get("/people/{person_id:int}/series")
def get_person_series(
    person_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=8, ge=1, le=60),
    exclude_known_for: bool = Query(default=False),
):
    db = Session()
    try:
        person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            person = _get_or_create_person_db(db, person_id)
            if person:
                person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        ui_lang = _preferred_metadata_language(db)
        target_lang = ui_lang or "en"
        credit_payload = _load_person_credit_payload(db, person_id, person, ui_lang, target_lang)
        base_items = credit_payload["series"]
        if exclude_known_for:
            base_items = _exclude_known_for_credits(base_items, credit_payload["known_for"])
            prioritized = sorted(
                base_items,
                key=lambda entry: (_known_for_score(entry, person.known_for_department, adult_only=bool(getattr(person, "is_adult", False))), entry.get("year") or 0),
                reverse=True,
            )
        else:
            prioritized = _prioritize_person_credits(base_items, credit_payload["known_for"])
        paged = _paginate_items(prioritized, page, page_size)
        _schedule_person_credit_poster_warmup(person_id, "series", paged["page"], paged["page_size"], paged["items"])
        paged["items"] = _apply_local_poster_paths(paged["items"])
        return JSONResponse(content=paged, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting person series for {person_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()


@router.get("/people/{person_id:int}/credit-backdrops")
def get_person_credit_backdrops(
    person_id: int,
    tmdb_id: int = Query(..., ge=1),
    media_type: str = Query(...),
):
    db = Session()
    try:
        person = db.query(Person).filter(Person.id == person_id).first()
        if not person:
            person = _get_or_create_person_db(db, person_id)
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        normalized_type = "tv" if str(media_type or "").lower() in {"tv", "series"} else "movie"
        ui_lang = _preferred_metadata_language(db) or "en-US"

        cached_payload = _get_cached_person_credit_backdrops(person_id, tmdb_id, normalized_type, ui_lang)
        if cached_payload:
            return JSONResponse(content=cached_payload, media_type="application/json; charset=utf-8")

        tmdb_client = TMDBClient(db)
        raw_data = tmdb_client.get_details(tmdb_id, normalized_type, language=ui_lang, include_images=True)
        backdrops = ((raw_data or {}).get("images") or {}).get("backdrops") or []
        has_valid_backdrops = any((not bd.get("iso_639_1") or bd.get("iso_639_1") == "") and int(bd.get("width") or 0) >= 1280 for bd in backdrops)

        payload = {
            "tmdb_id": tmdb_id,
            "media_type": normalized_type,
            "title": raw_data.get("title") or raw_data.get("name") or raw_data.get("original_title") or raw_data.get("original_name"),
            "backdrops": backdrops,
            "has_valid_backdrops": has_valid_backdrops,
        }
        _set_cached_person_credit_backdrops(person_id, tmdb_id, normalized_type, ui_lang, payload)

        return JSONResponse(content=payload, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting credit backdrops for person {person_id}, tmdb {tmdb_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()
