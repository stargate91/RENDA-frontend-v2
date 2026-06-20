import logging
import math
import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import joinedload

from app.db.base import Session, CacheSession
from app.db.models import (
    Person,
    MediaPersonLink,
    MediaMatch,
    MediaItem,
    ItemStatus,
    ItemType,
    TMDBCache,
)

from app.utils.people_utils import (
    _public_image_path,
    _download_person_detail_assets,
)

from app.utils.library_utils import (
    _pick_backdrop_path,
    _pick_tmdb_cache,
    _get_omdb_ratings_from_imdb,
    _parse_omdb_float,
)

logger = logging.getLogger(__name__)

PERSON_INITIAL_CREDITS_PAGE_SIZE = 12
_PERSON_CREDIT_WARMUP_LOCK = threading.Lock()
_PERSON_CREDIT_WARMUP_CACHE: Dict[Tuple[int, str, int, int], float] = {}
_PERSON_CREDIT_WARMUP_TTL_SECONDS = 300.0
_PERSON_CREDIT_BACKDROPS_CACHE_TTL = timedelta(days=30)

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


def _person_credit_backdrops_cache_key(person_id: int, tmdb_id: int, media_type: str, language: str) -> str:
    return f"/people-credit-backdrops/{person_id}/{media_type}/{tmdb_id}?language={language or 'en-US'}"


def get_cached_person_credit_backdrops(person_id: int, tmdb_id: int, media_type: str, language: str) -> Optional[dict]:
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


def set_cached_person_credit_backdrops(person_id: int, tmdb_id: int, media_type: str, language: str, payload: dict) -> None:
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


def known_for_score(credit: dict, department: Optional[str], adult_only: bool = False, person_name: Optional[str] = None) -> float:
    score = 0.0

    vote_average = float(credit.get("rating") or 0.0)
    vote_count = float(credit.get("vote_count") or 0.0)
    popularity = float(credit.get("popularity") or 0.0)

    if adult_only and vote_count < 10:
        vote_average = (vote_average * vote_count + 5.0 * (10 - vote_count)) / 10.0

    vote_count_weight = 10.0

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
            if order == 0:
                score += 35.0
            elif order == 1:
                score += 20.0
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

    if person_name:
        p_name = person_name.lower().strip()
        first_name = p_name.split()[0] if p_name else ""
        title_lower = (credit.get("title") or credit.get("name") or "").lower()
        if p_name in title_lower:
            score += 25.0
        elif first_name and len(first_name) > 2 and f"being {first_name}" in title_lower:
            score += 25.0
        elif first_name and len(first_name) > 2 and first_name in title_lower:
            score += 15.0

    return score


def select_known_for(credits: list[dict], department: Optional[str], limit: int = 8, adult_only: bool = False, person_name: Optional[str] = None) -> list[dict]:
    if not credits:
        return []

    normalized_department = str(department or "").strip().lower()

    ranked = sorted(
        credits,
        key=lambda credit: (known_for_score(credit, department, adult_only=adult_only, person_name=person_name), credit.get("year") or 0),
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


def resolve_person_known_for_backdrop(
    db,
    tmdb_client,
    credits: list[dict],
    preferred_languages: list[str],
    department: Optional[str] = None,
    adult_only: bool = False,
    respect_credit_order: bool = False,
    local_pick_cache: Optional[Any] = None,
) -> Optional[str]:
    candidates: list[tuple[int, str]] = []
    seen_media: set[tuple[str, int]] = set()
    max_scan = 5 if adult_only else 3

    ranked_credits = list(credits or []) if respect_credit_order else sorted(
        credits or [],
        key=lambda credit: (
            known_for_score(credit, department, adult_only=adult_only),
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
        if local_pick_cache is not None:
            cached = local_pick_cache(parsed_credit_id, cache_media_type)
        else:
            cached = _pick_tmdb_cache(db, parsed_credit_id, cache_media_type, preferred_languages)
        raw_data = cached.raw_data if cached and isinstance(cached.raw_data, dict) else None

        if raw_data is None and not adult_only:
            try:
                raw_data = tmdb_client.get_details(parsed_credit_id, "movie" if media_type == "movie" else "series", language=preferred_languages[0])
            except Exception:
                raw_data = None

        if adult_only and (not raw_data or not bool(raw_data.get("adult"))):
            continue

        backdrop_path = _pick_backdrop_path(raw_data, preferred_languages[0], allow_low_res=not adult_only) if raw_data else None
        if backdrop_path:
            candidates.append((_backdrop_resolution_from_raw(raw_data, backdrop_path), backdrop_path))
            continue

        fallback_backdrop = credit.get("backdrop_path")
        if fallback_backdrop and not adult_only:
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


def prioritize_person_credits(items: list[dict], known_for_items: list[dict]) -> list[dict]:
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


def exclude_known_for_credits(items: list[dict], known_for_items: list[dict]) -> list[dict]:
    if not items or not known_for_items:
        return items or []
    return [
        entry for entry in items
        if not any(_credit_matches_known_for(entry, known_for_entry) for known_for_entry in known_for_items)
    ]


def apply_local_poster_paths(items: list[dict]) -> list[dict]:
    for item in items:
        original_poster = item.get("poster_path")
        local_poster = _public_image_path(original_poster, "posters")
        item["poster_path"] = local_poster if local_poster else original_poster
        item["has_local_poster"] = bool(local_poster)
    return items


def paginate_items(items: list[dict], page: int, page_size: int) -> dict:
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


def build_person_asset_preload_batches(movies: list[dict], series: list[dict], known_for: list[dict], first_page_size: int = 8) -> tuple[list[dict], list[dict]]:
    prioritized_movies = prioritize_person_credits(movies or [], known_for or [])
    prioritized_series = prioritize_person_credits(series or [], known_for or [])
    first_movies_page = paginate_items(prioritized_movies, 1, first_page_size)["items"]
    first_series_page = paginate_items(prioritized_series, 1, first_page_size)["items"]
    preload_movies = list(known_for or []) + first_movies_page
    preload_series = first_series_page
    return preload_movies, preload_series


def schedule_person_credit_poster_warmup(person_id: int, media_type: str, page: int, page_size: int, items: list[dict]) -> None:
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



def load_person_credit_payload(
    db,
    person_id: int,
    person: Person,
    ui_lang: str,
    target_lang: str,
    lead_cast_order_threshold: int = 3,
    scenes_page: Optional[int] = None,
    scenes_page_size: Optional[int] = None,
    scenes_source: Optional[str] = None,
    movies_page: Optional[int] = None,
    movies_page_size: Optional[int] = None,
    series_page: Optional[int] = None,
    series_page_size: Optional[int] = None,
) -> dict:
    ext_ids = person.external_ids or {}
    has_adult_db_id = any(ext_ids.get(f"{src}_id") for src in ["stashdb", "fansdb", "theporndb"])

    links_query = db.query(MediaPersonLink).join(MediaPersonLink.media_match).join(MediaMatch.media_item).filter(
        MediaPersonLink.person_id == person_id,
        MediaMatch.is_active == True,
        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
    )
    if has_adult_db_id:
        links_query = links_query.filter(MediaItem.item_type != ItemType.SCENE)

    links = links_query.options(
        joinedload(MediaPersonLink.media_match).joinedload(MediaMatch.media_item),
        joinedload(MediaPersonLink.media_match).joinedload(MediaMatch.localizations),
        joinedload(MediaPersonLink.media_match).joinedload(MediaMatch.studio),
    ).all()

    movies = []
    series_map = {}
    scenes = []
    person_backdrop = None

    for link in links:
        item = link.media_match.media_item
        match = link.media_match
        item_loc = _pick_match_localization(match.localizations, ui_lang)

        title = item_loc.title if item_loc else item.fn_title or item.filename
        poster_path = item_loc.poster_path if item_loc else None

        if item.item_type == ItemType.SCENE:
            duration_sec = item.duration
            duration_str = None
            if duration_sec:
                try:
                    duration_min = int(float(duration_sec) / 60)
                    if duration_min > 0:
                        duration_str = f"{duration_min} min"
                except:
                    pass
            studio_name = match.studio.name if match.studio else (match.companies[0].get("name") if match.companies else None)
            scenes.append({
                "id": item.id,
                "title": title,
                "type": "scene",
                "media_type": "scene",
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
                "resolution": item.resolution,
                "duration": duration_str,
                "studio": studio_name,
            })
        elif item.item_type == ItemType.MOVIE:
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
        ext_ids = person.external_ids or {}
        tmdb_id_to_fetch = ext_ids.get("tmdb_id")
        if not tmdb_id_to_fetch:
            for u in ext_ids.get("urls") or []:
                url = u.get("url") if isinstance(u, dict) else u
                if isinstance(url, str) and "themoviedb.org/person/" in url:
                    import re
                    match_tmdb = re.search(r"themoviedb\.org/person/(\d+)", url)
                    if match_tmdb:
                        tmdb_id_to_fetch = int(match_tmdb.group(1))
                        break

        has_adult_db_id = any(ext_ids.get(f"{src}_id") for src in ["stashdb", "fansdb", "theporndb"])
        
        if not tmdb_id_to_fetch and not has_adult_db_id and person_id < 100000000:
            tmdb_id_to_fetch = person_id

        total_scenes_count = 0
        # Adult database scene fetching
        if has_adult_db_id:
            stashdb_id = ext_ids.get("stashdb_id")
            fansdb_id = ext_ids.get("fansdb_id")
            adult_source = None
            performer_uuid = None
            
            if scenes_source == "stashdb" and stashdb_id:
                adult_source = "stashdb"
                performer_uuid = stashdb_id
            elif scenes_source == "fansdb" and fansdb_id:
                adult_source = "fansdb"
                performer_uuid = fansdb_id
            else:
                if stashdb_id:
                    adult_source = "stashdb"
                    performer_uuid = stashdb_id
                elif fansdb_id:
                    adult_source = "fansdb"
                    performer_uuid = fansdb_id
                
            if adult_source and performer_uuid:
                from app.api.graphql_clients import AdultGraphQLClient
                client = AdultGraphQLClient(db, adult_source)
                try:
                    req_page = scenes_page or 1
                    req_size = scenes_page_size or 12
                    fetched_scenes, total_count = client.get_performer_scenes(performer_uuid, page=req_page, per_page=req_size)
                    logger.info(f"Loaded performer scenes: page={req_page}, per_page={req_size}, fetched={len(fetched_scenes)}, total={total_count}")
                    total_scenes_count = total_count
                    
                    import hashlib
                    def get_stable_integer_id(src: str, u_str: str) -> int:
                        h = hashlib.sha256(f"{src}:{u_str}".encode()).hexdigest()
                        return int(h[:7], 16)
                        
                    stable_id_to_uuid = {}
                    for s in fetched_scenes:
                        s_id = s.get("id")
                        if s_id:
                            stable_id = get_stable_integer_id(adult_source, s_id)
                            stable_id_to_uuid[stable_id] = s_id
                            
                    local_matches = db.query(MediaMatch).join(MediaItem).filter(
                        MediaMatch.is_active == True,
                        MediaMatch.tmdb_id.in_(list(stable_id_to_uuid.keys())),
                        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
                    ).options(joinedload(MediaMatch.media_item)).all()
                    
                    local_match_map = {m.tmdb_id: m for m in local_matches}
                    
                    scenes.clear()
                    for s in fetched_scenes:
                        s_id = s.get("id")
                        if not s_id:
                            continue
                        stable_id = get_stable_integer_id(adult_source, s_id)
                        local_match = local_match_map.get(stable_id)
                        
                        in_library = local_match is not None
                        library_item_id = local_match.media_item_id if local_match else None
                        
                        resolution = local_match.media_item.resolution if (local_match and local_match.media_item) else None
                        
                        duration_sec = None
                        if local_match and local_match.media_item and local_match.media_item.duration:
                            duration_sec = local_match.media_item.duration
                        else:
                            duration_sec = s.get("duration")
                            
                        duration_str = None
                        if duration_sec:
                            try:
                                duration_min = int(float(duration_sec) / 60)
                                if duration_min > 0:
                                    duration_str = f"{duration_min} min"
                            except Exception:
                                pass
                                
                        date_str = s.get("date")
                        year = None
                        if date_str:
                            try:
                                year = int(str(date_str).split("-")[0])
                            except Exception:
                                pass
                                
                        studio_name = s.get("studio", {}).get("name") if s.get("studio") else None
                        
                        images_list = s.get("images") or []
                        poster_url = images_list[0].get("url") if images_list else None
                        
                        scenes.append({
                            "id": library_item_id or f"stash_{s.get('id')}",
                            "title": s.get("title") or "Unknown Scene",
                            "type": "scene",
                            "media_type": "scene",
                            "tmdb_id": stable_id,
                            "stash_id": s.get("id"),
                            "year": year,
                            "poster_path": poster_url,
                            "backdrop_path": None,
                            "rating": 0.0,
                            "rating_tmdb": 0.0,
                            "rating_imdb": None,
                            "job": "Actor",
                            "character": None,
                            "is_lead": False,
                            "in_library": in_library,
                            "library_item_id": library_item_id,
                            "resolution": resolution,
                            "duration": duration_str,
                            "studio": studio_name,
                        })
                except Exception as ex:
                    logger.error(f"Error fetching remote scenes: {ex}")
        else:
            total_scenes_count = len(scenes)
            req_page = scenes_page or 1
            req_size = scenes_page_size or 12
            start_idx = (req_page - 1) * req_size
            scenes = scenes[start_idx : start_idx + req_size]

        if tmdb_id_to_fetch:
            tmdb_data = tmdb_client.get_person_details(int(tmdb_id_to_fetch), language=target_lang)
        else:
            tmdb_data = {}
        credits_data = tmdb_data.get("combined_credits", {})
        cast_list = credits_data.get("cast", [])
        crew_list = credits_data.get("crew", [])
        if cast_list or crew_list:
            preferred_languages = [target_lang, "en"]

            is_person_adult = bool(getattr(person, "is_adult", False))

            local_movies = db.query(MediaMatch.tmdb_id, MediaItem.id, MediaMatch.rating_imdb).join(MediaMatch.media_item).filter(
                MediaMatch.is_active == True,
                MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                MediaItem.item_type.in_([ItemType.MOVIE, ItemType.SCENE])
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

                    combined_credits[key] = {
                        "id": cid,
                        "tmdb_id": cid,
                        "title": title or "Unknown",
                        "type": "movie" if media_type == "movie" else "series",
                        "media_type": media_type,
                        "year": year,
                        "poster_path": credit.get("poster_path"),
                        "backdrop_path": None,
                        "rating": credit.get("vote_average") or 0.0,
                        "rating_tmdb": credit.get("vote_average") or 0.0,
                        "vote_count": credit.get("vote_count") or 0,
                        "popularity": credit.get("popularity") or 0.0,
                        "genre_ids": credit.get("genre_ids") or [],
                        "rating_imdb": (
                            local_movies_map.get(cid, {}).get("rating_imdb")
                            if media_type == "movie"
                            else local_series_map.get(cid, {}).get("rating_imdb")
                        ),
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

            # Merge back any local items not matched by TMDb
            matched_local_movie_ids = {c["library_item_id"] for c in parsed_movies if c.get("library_item_id")}
            for m in movies:
                if m["id"] not in matched_local_movie_ids:
                    parsed_movies.append(m)
                    ordered_credits.append(m)

            matched_local_series_ids = {c["library_series_tmdb_id"] for c in parsed_series if c.get("library_series_tmdb_id")}
            for s in list(series_map.values()):
                if s["series_tmdb_id"] not in matched_local_series_ids:
                    parsed_series.append(s)
                    ordered_credits.append(s)

            person_name = None
            if person:
                if getattr(person, "localizations", None):
                    lang_code = ui_lang.split("-")[0] if ui_lang else "en"
                    for l in person.localizations:
                        if l.locale == lang_code:
                            person_name = l.name
                            break
                    if not person_name:
                        person_name = person.localizations[0].name if person.localizations else None

            known_for = select_known_for(
                ordered_credits,
                person.known_for_department,
                limit=8,
                adult_only=bool(getattr(person, "is_adult", False)),
                person_name=person_name,
            )

            # Determine visible subset to query TMDBCache/OMDBCache
            prioritized_movies = prioritize_person_credits(parsed_movies, known_for)
            prioritized_series = prioritize_person_credits(parsed_series, known_for)
            
            paged_movies = paginate_items(prioritized_movies, movies_page or 1, movies_page_size or PERSON_INITIAL_CREDITS_PAGE_SIZE)["items"]
            paged_series = paginate_items(prioritized_series, series_page or 1, series_page_size or PERSON_INITIAL_CREDITS_PAGE_SIZE)["items"]
            
            visible_items = list(known_for) + paged_movies + paged_series
            visible_tmdb_ids = {item["tmdb_id"] for item in visible_items if item.get("tmdb_id")}
            
            caches_by_id = {}
            if visible_tmdb_ids:
                all_caches = db.query(TMDBCache).filter(TMDBCache.tmdb_id.in_(list(visible_tmdb_ids))).all()
                for cache in all_caches:
                    if cache.tmdb_id not in caches_by_id:
                        caches_by_id[cache.tmdb_id] = []
                    caches_by_id[cache.tmdb_id].append(cache)

            from urllib.parse import urlsplit, parse_qs
            from app.utils.library_utils.lang import _match_language_code
            from app.db.models import OMDBCache

            def local_pick_tmdb_cache(tmdb_id: Optional[int], media_type: str) -> Optional[TMDBCache]:
                if not tmdb_id:
                    return None
                endpoint_prefix = f"/{media_type}/{tmdb_id}"
                caches = caches_by_id.get(tmdb_id) or []
                filtered_caches = []
                for cache in caches:
                    cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
                    if not cache_key.startswith(endpoint_prefix):
                        continue
                    suffix = cache_key[len(endpoint_prefix):]
                    if suffix == "" or suffix.startswith("?"):
                        filtered_caches.append(cache)
                if not filtered_caches:
                    return None
                if len(filtered_caches) == 1:
                    return filtered_caches[0]

                def _cache_language(cache: TMDBCache) -> str:
                    cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
                    try:
                        parsed = urlsplit(cache_key)
                        parsed_language = str((parse_qs(parsed.query).get("language") or [""])[0] or "")
                        if parsed_language:
                            return parsed_language
                    except Exception:
                        pass
                    return str(cache.locale or "")

                def rank_for(cache: TMDBCache) -> tuple[int, float]:
                    cache_lang = _cache_language(cache)
                    for idx, preferred in enumerate(preferred_languages):
                        if _match_language_code(cache_lang, preferred):
                            return idx, -cache.updated_at.timestamp()
                    if _match_language_code(cache_lang, "en"):
                        return len(preferred_languages), -cache.updated_at.timestamp()
                    return len(preferred_languages) + 1, -cache.updated_at.timestamp()

                return sorted(filtered_caches, key=rank_for)[0]

            imdb_ids = set()
            for tmdb_id, caches in caches_by_id.items():
                for cache in caches:
                    if isinstance(cache.raw_data, dict):
                        iid = cache.raw_data.get("external_ids", {}).get("imdb_id") or cache.raw_data.get("imdb_id")
                        if iid:
                            imdb_ids.add(iid)
            omdb_map = {}
            if imdb_ids:
                omdb_caches = db.query(OMDBCache).filter(OMDBCache.imdb_id.in_(list(imdb_ids))).all()
                for o in omdb_caches:
                    if o.imdb_id and isinstance(o.raw_data, dict):
                        omdb_map[o.imdb_id] = o.raw_data

            def _get_virtual_credit_imdb_rating(tmdb_id: int, media_type: str):
                cache = local_pick_tmdb_cache(tmdb_id, media_type)
                if not cache or not isinstance(cache.raw_data, dict):
                    return None
                imdb_id = cache.raw_data.get("external_ids", {}).get("imdb_id") or cache.raw_data.get("imdb_id")
                if not imdb_id:
                    return None
                omdb_raw = omdb_map.get(imdb_id) or {}
                return _parse_omdb_float(omdb_raw.get("imdb_rating"))

            def _get_credit_backdrop_path(tmdb_id: int, media_type: str, direct_backdrop: Optional[str]) -> Optional[str]:
                if direct_backdrop and not is_person_adult:
                    return direct_backdrop

                cache = local_pick_tmdb_cache(tmdb_id, media_type)
                raw_data = cache.raw_data if cache and isinstance(cache.raw_data, dict) else None
                if not raw_data:
                    return None

                return (
                    _pick_backdrop_path(raw_data, preferred_languages[0], allow_low_res=not is_person_adult)
                    or (None if is_person_adult else raw_data.get("backdrop_path"))
                )

            # Now resolve ratings and backdrops only for the visible items
            for item in visible_items:
                tid = item.get("tmdb_id")
                mtype = item.get("media_type")
                if not tid or mtype not in {"movie", "tv"}:
                    continue
                # Pick actual direct credit's backdrop_path if stored or fallback
                # Find the credit object in TMDb data if available to get the original backdrop_path
                orig_backdrop = None
                for c in cast_list + crew_list:
                    if c.get("id") == tid and c.get("media_type") == mtype:
                        orig_backdrop = c.get("backdrop_path")
                        break
                
                resolved_bd = _get_credit_backdrop_path(tid, mtype, orig_backdrop)
                item["backdrop_path"] = resolved_bd
                
                # Fetch virtual imdb rating if needed
                if item.get("rating_imdb") is None:
                    item["rating_imdb"] = _get_virtual_credit_imdb_rating(tid, mtype)

            person_backdrop = resolve_person_known_for_backdrop(
                db,
                tmdb_client,
                known_for,
                preferred_languages,
                department=person.known_for_department,
                adult_only=bool(getattr(person, "is_adult", False)),
                respect_credit_order=True,
                local_pick_cache=local_pick_tmdb_cache,
            )
            all_movies = parsed_movies
            all_series = parsed_series
    except Exception as ex:
        logger.error(f"Failed to load or parse TMDB credits for person {person_id}: {ex}")

    is_person_adult = bool(getattr(person, "is_adult", False))
    if getattr(person, "manual_backdrop_path", None):
        person_backdrop = person.manual_backdrop_path
    elif not person_backdrop and not is_person_adult:
        for link in links:
            if link.media_match and (getattr(link.media_match, "manual_backdrop_path", None) or link.media_match.backdrop_path):
                person_backdrop = getattr(link.media_match, "manual_backdrop_path", None) or link.media_match.backdrop_path
                break

    all_movies.sort(key=lambda entry: entry.get("year") or 0, reverse=True)
    all_series.sort(key=lambda entry: entry.get("year") or 0, reverse=True)
    scenes.sort(key=lambda entry: entry.get("year") or 0, reverse=True)

    return {
        "tmdb_data": tmdb_data,
        "person_backdrop": person_backdrop,
        "known_for": known_for,
        "movies": all_movies,
        "series": all_series,
        "scenes": scenes,
        "total_scene_credits": total_scenes_count,
    }


def _pick_match_localization(localizations: list, ui_lang: str):
    if not localizations:
        return None
    lang_code = ui_lang.split("-")[0] if ui_lang else "en"
    for loc in localizations:
        if loc.locale == lang_code:
            return loc
    for loc in localizations:
        if loc.locale == "en":
            return loc
    return localizations[0]
