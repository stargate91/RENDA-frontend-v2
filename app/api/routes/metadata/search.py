from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
import unicodedata
from app.db.base import Session as DBSession, get_db
from app.api.tmdb_client import TMDBClient
from app.db.models import ItemType, MediaItem, MediaMatch, ItemStatus, UserSetting
from app.utils.metadata_utils import _normalize_title
from app.utils.library_utils import _is_virtual_media_tracked

router = APIRouter()


def _fold_ascii(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def _build_query_candidates(query: str) -> list[str]:
    candidates = []
    seen = set()

    for raw in [query or "", _normalize_title(query), _fold_ascii(query or ""), _normalize_title(_fold_ascii(query or ""))]:
        candidate = " ".join((raw or "").split()).strip()
        key = candidate.casefold()
        if candidate and key not in seen:
            seen.add(key)
            candidates.append(candidate)

    return candidates


def _hydrate_result_details(result: dict, item_type: str, language: str) -> tuple[int | None, dict]:
    result_id = result.get("id")
    if not result_id:
        return None, result

    try:
        tmdb_id = int(result_id)
    except (TypeError, ValueError):
        return None, result

    worker_db = DBSession()
    try:
        details = TMDBClient(worker_db).get_details(tmdb_id, item_type, language=language)
    finally:
        DBSession.remove()

    if not details:
        return tmdb_id, result

    merged_result = dict(result)
    if item_type == "movie":
        merged_result["title"] = details.get("title") or merged_result.get("title")
        merged_result["release_date"] = details.get("release_date") or merged_result.get("release_date")
    else:
        merged_result["name"] = details.get("name") or merged_result.get("name")
        merged_result["first_air_date"] = details.get("first_air_date") or merged_result.get("first_air_date")
        merged_result["seasons"] = details.get("seasons") or []
    merged_result["overview"] = details.get("overview") or merged_result.get("overview")
    merged_result["poster_path"] = details.get("poster_path") or merged_result.get("poster_path")
    merged_result["backdrop_path"] = details.get("backdrop_path") or merged_result.get("backdrop_path")
    return tmdb_id, merged_result


def _merge_search_results(
    tmdb: TMDBClient,
    query_candidates: list[str],
    item_type: str,
    year: int | None,
    display_language: str,
    include_adult: bool,
    page: int,
) -> list[dict]:
    merged = []
    seen_ids = set()

    for query_value in query_candidates:
        batch = tmdb.search(query_value, item_type=item_type, year=year, language=None, include_adult=include_adult, page=page)
        for result in batch:
            result_id = result.get("id")
            if not result_id or result_id in seen_ids:
                continue
            seen_ids.add(result_id)
            merged.append({
                **result,
                "_matched_query": query_value,
            })
        if merged:
            break

    if not merged:
        return []

    max_workers = min(6, max(1, len(merged)))
    hydrated_by_id = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(_hydrate_result_details, result, item_type, display_language)
            for result in merged
        ]
        for future in as_completed(futures):
            result_id, hydrated_result = future.result()
            if result_id is not None:
                hydrated_by_id[result_id] = hydrated_result

    return [
        hydrated_by_id.get(result.get("id"), result)
        for result in merged
    ]

@router.get("/search")
def search_metadata(
    query: str,
    year: int = None,
    item_type: str = None,
    season: int = None,
    episode: int = None,
    language: str = "en-US",
    page: int = 1,
    db: Session = Depends(get_db),
):
    """Search for metadata across TMDB."""
    tmdb = TMDBClient(db)
    include_adult_setting = db.query(UserSetting).filter(UserSetting.key == "include_adult").first()
    include_adult = False
    if include_adult_setting:
        value = include_adult_setting.value
        include_adult = value.lower() == "true" if isinstance(value, str) else bool(value)
    page = max(1, int(page or 1))
    
    query_candidates = _build_query_candidates(query)

    if item_type == "movie":
        results = _merge_search_results(tmdb, query_candidates, item_type="movie", year=year, display_language=language, include_adult=include_adult, page=page)
    elif item_type in ["tv", "series"]:
        results = _merge_search_results(tmdb, query_candidates, item_type="tv", year=year, display_language=language, include_adult=include_adult, page=page)
        if results and (season is not None or episode is not None):
            filtered = []
            for r in results:
                seasons = r.get("seasons") or []
                match_found = False
                for s in seasons:
                    s_num = s.get("season_number")
                    if season is not None and s_num != season:
                        continue
                    if episode is not None:
                        ep_count = s.get("episode_count") or 0
                        if ep_count < episode:
                            continue
                    match_found = True
                    break
                if match_found:
                    filtered.append(r)
            results = filtered
    else:
        results = []

    if not results:
        return results

    tmdb_ids = []
    for result in results:
        try:
            tmdb_ids.append(int(result.get("id")))
        except (TypeError, ValueError):
            continue

    local_movie_map = {}
    local_series_set = set()

    if tmdb_ids:
        if item_type == "movie":
            local_movie_rows = (
                db.query(MediaMatch.tmdb_id, MediaItem.id)
                .join(MediaItem, MediaItem.id == MediaMatch.media_item_id)
                .filter(
                    MediaMatch.is_active.is_(True),
                    MediaMatch.item_type == ItemType.MOVIE,
                    MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                    MediaMatch.tmdb_id.in_(tmdb_ids),
                )
                .all()
            )
            local_movie_map = {int(tmdb_id): int(media_item_id) for tmdb_id, media_item_id in local_movie_rows if tmdb_id and media_item_id}
        elif item_type in ["tv", "series"]:
            local_series_rows = (
                db.query(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id)
                .join(MediaItem, MediaItem.id == MediaMatch.media_item_id)
                .filter(
                    MediaMatch.is_active.is_(True),
                    MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                    or_(
                        MediaMatch.series_tmdb_id.in_(tmdb_ids),
                        MediaMatch.tmdb_id.in_(tmdb_ids),
                    ),
                )
                .all()
            )
            for series_tmdb_id, tmdb_id in local_series_rows:
                if series_tmdb_id:
                    local_series_set.add(int(series_tmdb_id))
                elif tmdb_id:
                    local_series_set.add(int(tmdb_id))

    enriched_results = []
    for result in results:
        enriched = dict(result)
        try:
            result_tmdb_id = int(enriched.get("id"))
        except (TypeError, ValueError):
            enriched_results.append(enriched)
            continue

        if item_type == "movie":
            media_item_id = local_movie_map.get(result_tmdb_id)
            in_library = media_item_id is not None
            enriched["in_library"] = in_library
            enriched["media_item_id"] = media_item_id
            enriched["is_tracked"] = False if in_library else _is_virtual_media_tracked(db, result_tmdb_id, "movie")
        else:
            in_library = result_tmdb_id in local_series_set
            enriched["in_library"] = in_library
            enriched["library_series_tmdb_id"] = result_tmdb_id if in_library else None
            enriched["is_tracked"] = False if in_library else _is_virtual_media_tracked(db, result_tmdb_id, "tv")

        enriched_results.append(enriched)

    return enriched_results

@router.get("/tv/{tmdb_id}/seasons")
def get_tv_seasons(tmdb_id: int, language: str = "en-US", db: Session = Depends(get_db)):
    """Get season and episode details for a TV show."""
    tmdb = TMDBClient(db)
    details = tmdb.get_details(tmdb_id, "tv", language=language)
    
    if not details or "seasons" not in details:
        raise HTTPException(status_code=404, detail="TV show not found or has no seasons")
        
    from concurrent.futures import ThreadPoolExecutor
    from app.db.base import Session as DBSession
    
    def fetch_season(s):
        season_num = s.get("season_number")
        worker_db = DBSession()
        try:
            worker_tmdb = TMDBClient(worker_db)
            season_details = worker_tmdb.get_season_details(tmdb_id, season_num, language=language)
        finally:
            DBSession.remove()
        
        episodes = []
        if season_details and "episodes" in season_details:
            for ep in season_details["episodes"]:
                episodes.append({
                    "episode_number": ep.get("episode_number"),
                    "name": ep.get("name"),
                    "overview": ep.get("overview"),
                    "air_date": ep.get("air_date")
                })
                
        return {
            "season_number": season_num,
            "name": s.get("name"),
            "episode_count": s.get("episode_count"),
            "poster_path": s.get("poster_path"),
            "air_date": s.get("air_date"),
            "episodes": episodes
        }

    with ThreadPoolExecutor(max_workers=min(len(details["seasons"]), 8)) as executor:
        seasons = list(executor.map(fetch_season, details["seasons"]))
        
    return {"seasons": seasons}


@router.get("/tv/{tmdb_id}/season/{season_number}/episodes")
def get_tv_season_episodes(tmdb_id: int, season_number: int, language: str = "en-US", db: Session = Depends(get_db)):
    """Fetches episodes for a TV season."""
    tmdb = TMDBClient(db)
    season_details = tmdb.get_season_details(tmdb_id, season_number, language=language)

    if not season_details or "episodes" not in season_details:
        raise HTTPException(status_code=404, detail="Season not found or has no episodes")

    episodes = []
    for ep in season_details["episodes"]:
        episodes.append({
            "id": ep.get("id"),
            "episode_number": ep.get("episode_number"),
            "name": ep.get("name"),
            "overview": ep.get("overview"),
            "air_date": ep.get("air_date"),
            "still_path": ep.get("still_path"),
        })

    return {"episodes": episodes}
