from urllib.parse import parse_qs, urlsplit
from pathlib import Path
from typing import Optional

from app.db.models import (
    VirtualMediaState,
    VirtualEpisodeState,
    CustomListItem,
    OMDBCache,
    ItemType,
    TMDBCache,
)

from app.utils.library_utils.lang import _match_language_code
from app.utils.library_utils.images import _public_image_path, _is_remote_image_path
from app.services.language_service import LanguageService

def _pick_tmdb_cache(db, tmdb_id: Optional[int], media_type: str, preferred_languages: list[str]):
    if not tmdb_id:
        return None
    endpoint_prefix = f"/{media_type}/{tmdb_id}"
    caches = []
    for cache in db.query(TMDBCache).filter(TMDBCache.tmdb_id == tmdb_id).all():
        cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
        if not cache_key.startswith(endpoint_prefix):
            continue
        suffix = cache_key[len(endpoint_prefix):]
        if suffix == "" or suffix.startswith("?"):
            caches.append(cache)
    if not caches:
        return None
    if len(caches) == 1:
        return caches[0]

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

    return sorted(caches, key=rank_for)[0]


def _pick_match_localization(match, preferred_languages: list[str]):
    if not match or not match.localizations:
        return None
    return LanguageService.pick_localization(match.localizations, preferred_languages)


def _resolve_virtual_catalog_metadata(
    db,
    tmdb_id: int,
    media_type: str,
    preferred_languages: list[str],
    terminal_series_statuses: Optional[set[str]] = None,
) -> tuple[str, Optional[int], Optional[str], Optional[str]]:
    terminal_series_statuses = terminal_series_statuses or {"ended", "canceled", "cancelled"}
    title, year, year_display, poster = "Unknown TMDB Item", None, None, None

    list_item = (
        db.query(CustomListItem)
        .filter(
            CustomListItem.tmdb_id == tmdb_id,
            CustomListItem.media_type == media_type,
        )
        .order_by(CustomListItem.id.desc())
        .first()
    )
    if list_item and (list_item.title or "").strip():
        title = list_item.title.strip()
    if list_item and list_item.poster_path:
        poster = _public_image_path(list_item.poster_path, "posters") or list_item.poster_path

    cached = _pick_tmdb_cache(db, tmdb_id, media_type, preferred_languages)
    if cached and isinstance(cached.raw_data, dict):
        cdata = cached.raw_data
        if not list_item or not (list_item.title or "").strip():
            title = cdata.get("title") or cdata.get("name") or title
        if not poster:
            poster = _public_image_path(cdata.get("poster_path"), "posters") or cdata.get("poster_path")
        release_date = cdata.get("release_date") or cdata.get("first_air_date")
        if release_date and len(release_date) >= 4:
            try:
                year = int(release_date[:4])
            except (TypeError, ValueError):
                year = None
        if media_type == "tv" and str(cdata.get("status") or "").lower() in terminal_series_statuses:
            first_air_date = cdata.get("first_air_date")
            last_air_date = cdata.get("last_air_date")
            if first_air_date and last_air_date and len(first_air_date) >= 4 and len(last_air_date) >= 4:
                first_year = first_air_date[:4]
                last_year = last_air_date[:4]
                year_display = first_year if first_year == last_year else f"{first_year}-{last_year}"

    return title, year, year_display, poster


def _get_virtual_media_state(db, tmdb_id: int, media_type: str):
    return db.query(VirtualMediaState).filter(
        VirtualMediaState.tmdb_id == tmdb_id,
        VirtualMediaState.media_type == media_type,
    ).first()


def _get_virtual_media_state_with_tracking(db, tmdb_id: int, media_type: str):
    state = _get_virtual_media_state(db, tmdb_id, media_type)
    if state is not None:
        return state, bool(getattr(state, "is_tracked", True))

    is_tracked = db.query(CustomListItem.id).filter(
        CustomListItem.tmdb_id == tmdb_id,
        CustomListItem.media_type == media_type,
    ).first() is not None
    return None, is_tracked


def _has_virtual_episode_states(db, series_tmdb_id: int, season_numbers: Optional[list[int]] = None) -> bool:
    if season_numbers is not None and len(season_numbers) == 0:
        return False
    query = db.query(VirtualEpisodeState.id).filter(
        VirtualEpisodeState.series_tmdb_id == series_tmdb_id,
    )
    if season_numbers:
        query = query.filter(VirtualEpisodeState.season_number.in_(list(season_numbers)))
    return query.first() is not None


def _get_virtual_episode_states_map(db, series_tmdb_id: int, season_numbers: Optional[list[int]] = None):
    if season_numbers is not None and len(season_numbers) == 0:
        return {}
    query = db.query(VirtualEpisodeState).filter(
        VirtualEpisodeState.series_tmdb_id == series_tmdb_id,
    )
    if season_numbers:
        query = query.filter(VirtualEpisodeState.season_number.in_(list(season_numbers)))
    return {
        (row.season_number, row.episode_number): row
        for row in query.all()
    }


def _get_virtual_episode_state(db, series_tmdb_id: int, season_number: int, episode_number: int):
    return db.query(VirtualEpisodeState).filter(
        VirtualEpisodeState.series_tmdb_id == series_tmdb_id,
        VirtualEpisodeState.season_number == season_number,
        VirtualEpisodeState.episode_number == episode_number,
    ).first()


def _is_virtual_media_tracked(db, tmdb_id: int, media_type: str) -> bool:
    _state, is_tracked = _get_virtual_media_state_with_tracking(db, tmdb_id, media_type)
    return is_tracked


def _get_omdb_ratings_from_imdb(db, imdb_id: Optional[str]) -> dict:
    if not imdb_id:
        return {}
    cache = db.query(OMDBCache).filter(OMDBCache.imdb_id == imdb_id).first()
    return cache.raw_data if cache and isinstance(cache.raw_data, dict) else {}


def _parse_omdb_float(value):
    if value in (None, "", "N/A"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_omdb_int(value):
    if value in (None, "", "N/A"):
        return None
    try:
        return int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _serialize_playback_logs(item) -> list[dict]:
    return [
        {
            "id": log.id,
            "watched_at": log.watched_at.isoformat(),
        }
        for log in sorted(getattr(item, "playback_logs", []) or [], key=lambda x: x.watched_at, reverse=True)
        if getattr(log, "watched_at", None)
    ]


def _series_folder_path(item) -> Optional[str]:
    if not item or not getattr(item, "current_path", None):
        return None
    current_path = item.current_path
    if getattr(item, "item_type", None) == ItemType.SERIES:
        return current_path
    parent = Path(current_path).parent
    parent_name = parent.name.lower()
    if parent_name.startswith("season ") or parent_name.startswith("specials"):
        return str(parent.parent)
    return str(parent)


def _best_series_level_match(items) -> Optional[dict]:
    candidates = []
    for item in items or []:
        for match in getattr(item, "matches", []) or []:
            if not getattr(match, "is_active", False):
                continue
            candidates.append(match)

    if not candidates:
        return None

    def _rank(match):
        item_type = getattr(match, "item_type", None)
        return {
            ItemType.SERIES: 0,
            ItemType.SEASON: 1,
            ItemType.EPISODE: 2,
            ItemType.MOVIE: 3,
        }.get(item_type, 99)

    ranked = sorted(candidates, key=_rank)
    best_rank = _rank(ranked[0])
    same_level = [m for m in ranked if _rank(m) == best_rank]
    preferred = next((m for m in same_level if any([
        m.rating_imdb is not None,
        m.vote_count_imdb is not None,
        m.rating_rotten,
        m.rating_meta is not None,
    ])), None)
    return preferred or same_level[0]


def _resolve_person_profile_path(person) -> Optional[str]:
    """Resolves the best profile path to return for a person, prioritizing custom and local images."""
    if not person:
        return None
    local_path = _public_image_path(person.local_profile_path, "persons")
    if local_path:
        return local_path
    profile_path = _public_image_path(person.profile_path, "persons")
    if profile_path:
        return profile_path
    return person.profile_path if _is_remote_image_path(person.profile_path) else None
