import logging
import threading
import time
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import or_
from app.db.base import Session as DBSession
from app.db.models import ItemType, UserSetting
from app.db.models.media import CustomList, CustomListItem, MediaItem, VirtualMediaState
from app.db.models.metadata import MediaMatch, MetadataLocalization, OMDBCache, TMDBCache
from app.utils.library_utils import _is_virtual_media_tracked, _pick_tmdb_cache, _preferred_metadata_languages, _public_image_path
from app.scanner.image_worker import ImageWorker
from app.scanner.scanner_manager import scan_status, scan_status_lock, update_scan_status
from app.scanner.status import is_scan_stop_requested
from app.utils.logger import logger as app_logger
from app.utils.lists_utils import _parse_bulk_import_rows, _pick_bulk_search_match
from app.api.tmdb_client import TMDBClient
from app.api.omdb_client import OMDBClient

logger = logging.getLogger(__name__)

bulk_import_reports: dict[int, dict[str, Any]] = {}
bulk_import_reports_lock = threading.Lock()


def _normalize_media_type(media_type: Optional[str]) -> str:
    value = str(media_type or "movie").strip().lower()
    if value in {"tv", "series", "show"}:
        return "tv"
    return "movie"


def _parse_float(value: Any) -> Optional[float]:
    try:
        if value in (None, "", "N/A"):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_int(value: Any) -> Optional[int]:
    try:
        if value in (None, "", "N/A"):
            return None
        return int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _has_cached_omdb_payload(raw_data: Optional[dict[str, Any]]) -> bool:
    if not isinstance(raw_data, dict):
        return False
    return any([
        raw_data.get("imdb_rating") not in (None, "", "N/A"),
        raw_data.get("imdb_votes") not in (None, "", "N/A"),
        raw_data.get("metascore") not in (None, "", "N/A"),
        raw_data.get("rotten_tomatoes") not in (None, "", "N/A"),
    ])


def _build_imported_omdb_payload(raw_item: dict[str, Any]) -> Optional[dict[str, Any]]:
    imdb_id = (raw_item.get("imdb_id") or "").strip()
    if not imdb_id:
        return None

    imdb_rating = _parse_float(raw_item.get("rating_imdb"))
    imdb_votes = _parse_int(raw_item.get("vote_count_imdb"))
    metascore = _parse_int(raw_item.get("rating_meta"))
    rotten = raw_item.get("rating_rotten")

    payload = {
        "imdb_rating": f"{imdb_rating:.1f}" if imdb_rating is not None else None,
        "imdb_votes": f"{imdb_votes:,}" if imdb_votes is not None else None,
        "metascore": str(metascore) if metascore is not None else None,
        "rotten_tomatoes": str(rotten).strip() if rotten not in (None, "") else None,
    }

    return payload if _has_cached_omdb_payload(payload) else None


def _upsert_imported_omdb_cache(db, imdb_id: str, raw_data: dict[str, Any]) -> None:
    if not imdb_id or not _has_cached_omdb_payload(raw_data):
        return

    existing_cache = db.query(OMDBCache).filter(OMDBCache.imdb_id == imdb_id).first()
    if existing_cache:
        existing_cache.raw_data = raw_data
        existing_cache.updated_at = datetime.utcnow()
        db.flush()
        return

    db.add(OMDBCache(imdb_id=imdb_id, raw_data=raw_data))
    db.flush()

def _resolve_local_media_item_id(db, tmdb_id: int | None, media_type: str | None):
    if not tmdb_id:
        return None
    normalized_media_type = _normalize_media_type(media_type)

    query = db.query(MediaItem.id, MediaItem.item_type).join(
        MediaMatch, MediaMatch.media_item_id == MediaItem.id
    ).filter(MediaMatch.is_active == True)

    if normalized_media_type == "tv":
        query = query.filter(or_(MediaMatch.series_tmdb_id == tmdb_id, MediaMatch.tmdb_id == tmdb_id))
    else:
        query = query.filter(MediaMatch.tmdb_id == tmdb_id)

    candidates = query.all()
    if not candidates:
        return None

    priority = {
        "tv": {"series": 0, "season": 1, "episode": 2, "movie": 3},
        "movie": {"movie": 0, "series": 1, "season": 2, "episode": 3},
    }
    rank_map = priority.get(normalized_media_type, priority["movie"])

    def _rank(row):
        item_type = row.item_type.value if getattr(row, "item_type", None) else ""
        return (rank_map.get(item_type, 99), row.id)

    return sorted(candidates, key=_rank)[0].id

def _serialize_list_item(db, item: CustomListItem) -> dict[str, Any]:
    normalized_media_type = _normalize_media_type(item.media_type)
    preferred_languages = _preferred_metadata_languages(db)
    resolved_media_item_id = item.media_item_id or _resolve_local_media_item_id(db, item.tmdb_id, normalized_media_type)
    current_title = item.title
    current_poster_path = item.poster_path
    original_title = None
    original_series_title = None
    release_date = None
    year = None
    rating_tmdb = None
    rating_imdb = None
    vote_count_imdb = None
    rating_rotten = None
    rating_meta = None
    imdb_id = None
    genres = []
    is_watched = False

    if resolved_media_item_id:
        media_item = db.query(MediaItem).filter(MediaItem.id == resolved_media_item_id).first()
        match = db.query(MediaMatch).filter(
            MediaMatch.media_item_id == resolved_media_item_id,
            MediaMatch.is_active == True,
        ).first()
        if media_item:
            is_watched = bool(media_item.is_watched)
        if match:
            imdb_id = match.imdb_id
            loc = None
            localizations = list(match.localizations or [])
            for preferred in preferred_languages:
                loc = next((entry for entry in localizations if entry.target_language == preferred), None)
                if loc:
                    break
            if not loc:
                for preferred in preferred_languages:
                    loc = next(
                        (
                            entry for entry in localizations
                            if entry.target_language and preferred
                            and entry.target_language.split("-", 1)[0].lower() == preferred.split("-", 1)[0].lower()
                        ),
                        None,
                    )
                    if loc:
                        break
            if not loc and localizations:
                loc = next((entry for entry in localizations if entry.is_primary), localizations[0])
            if loc:
                current_title = (
                    loc.series_title if normalized_media_type == "tv" and loc.series_title
                    else loc.title or current_title
                )
                current_poster_path = _public_image_path(
                    loc.local_series_poster_path if normalized_media_type == "tv" and loc.local_series_poster_path else (
                        loc.local_poster_path or loc.series_poster_path or loc.poster_path
                    ),
                    "posters",
                ) or (
                    loc.series_poster_path if normalized_media_type == "tv" and loc.series_poster_path else (
                        loc.poster_path or current_poster_path
                    )
                )
                original_title = loc.original_title
                original_series_title = loc.original_series_title
                genres = list(loc.genres or [])
            release_dt = match.first_air_date if normalized_media_type == "tv" else match.release_date
            if not release_dt:
                release_dt = match.first_air_date or match.release_date
            if release_dt:
                release_date = str(release_dt.date())
                year = release_dt.year
            rating_tmdb = match.rating_tmdb
            rating_imdb = match.rating_imdb
            vote_count_imdb = match.vote_count_imdb
            rating_rotten = match.rating_rotten
            rating_meta = match.rating_meta
    elif item.tmdb_id:
        virtual_state = db.query(VirtualMediaState).filter(
            VirtualMediaState.tmdb_id == item.tmdb_id,
            VirtualMediaState.media_type == normalized_media_type,
        ).first()
        if virtual_state:
            is_watched = bool(virtual_state.is_watched)
        cache = _pick_tmdb_cache(db, item.tmdb_id, "tv" if normalized_media_type == "tv" else "movie", preferred_languages)
        if cache and isinstance(cache.raw_data, dict):
            current_title = (
                cache.raw_data.get("name") or cache.raw_data.get("title") or current_title
            ) if normalized_media_type == "tv" else (
                cache.raw_data.get("title") or cache.raw_data.get("name") or current_title
            )
            current_poster_path = cache.raw_data.get("poster_path") or current_poster_path
            original_title = cache.raw_data.get("original_title")
            original_series_title = cache.raw_data.get("original_name")
            release_date = cache.raw_data.get("first_air_date") if normalized_media_type == "tv" else cache.raw_data.get("release_date")
            if release_date and len(str(release_date)) >= 4:
                try:
                    year = int(str(release_date)[:4])
                except (TypeError, ValueError):
                    year = None
            rating_tmdb = cache.raw_data.get("vote_average")
            raw_genres = cache.raw_data.get("genres") or []
            genres = [
                genre.get("name") if isinstance(genre, dict) else genre
                for genre in raw_genres
                if (isinstance(genre, dict) and genre.get("name")) or isinstance(genre, str)
            ]
            imdb_id = cache.raw_data.get("external_ids", {}).get("imdb_id") or cache.raw_data.get("imdb_id")
            if imdb_id:
                omdb = db.query(OMDBCache).filter(OMDBCache.imdb_id == imdb_id).first()
                if omdb and isinstance(omdb.raw_data, dict):
                    try:
                        raw_rating = omdb.raw_data.get("imdb_rating")
                        rating_imdb = float(raw_rating) if raw_rating and raw_rating != "N/A" else None
                    except (TypeError, ValueError):
                        rating_imdb = None
                    try:
                        raw_votes = omdb.raw_data.get("imdb_votes")
                        vote_count_imdb = int(str(raw_votes).replace(",", "")) if raw_votes and raw_votes != "N/A" else None
                    except (TypeError, ValueError):
                        vote_count_imdb = None
                    rating_rotten = omdb.raw_data.get("rotten_tomatoes") or None
                    try:
                        raw_meta = omdb.raw_data.get("metascore")
                        rating_meta = int(raw_meta) if raw_meta and raw_meta != "N/A" else None
                    except (TypeError, ValueError):
                        rating_meta = None

    return {
        "id": item.id,
        "list_id": item.list_id,
        "tmdb_id": item.tmdb_id,
        "media_item_id": resolved_media_item_id,
        "in_library": bool(resolved_media_item_id),
        "media_type": normalized_media_type,
        "title": current_title,
        "original_title": original_title,
        "original_series_title": original_series_title,
        "poster_path": current_poster_path,
        "added_at": item.added_at.isoformat() if item.added_at else None,
        "year": year,
        "release_date": release_date,
        "imdb_id": imdb_id,
        "rating_tmdb": rating_tmdb,
        "rating_imdb": rating_imdb,
        "vote_count_imdb": vote_count_imdb,
        "rating_rotten": rating_rotten,
        "rating_meta": rating_meta,
        "genres": genres,
        "is_watched": is_watched,
    }

def _cache_virtual_poster(poster_path: Optional[str]):
    if not poster_path:
        return
    try:
        worker = ImageWorker(None, "./data")
        worker.download_image(poster_path, "posters", size="w500")
    except Exception as exc:
        logger.warning(f"Failed to cache virtual poster {poster_path}: {exc}")

def _preferred_metadata_language(db) -> str:
    fallback = db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()
    if fallback and fallback.value and fallback.value != "none":
        return fallback.value
    ui = db.query(UserSetting).filter(UserSetting.key == "ui_language").first()
    if ui and ui.value and ui.value != "none":
        return ui.value
    primary = db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
    if primary and primary.value and primary.value != "none":
        return primary.value
    return "en-US"

def _hydrate_virtual_metadata(
    db,
    tmdb_id: Optional[int],
    media_type: str,
    language: Optional[str],
) -> dict[str, Any]:
    if not tmdb_id:
        return {}
    try:
        resolved_language = (language or "").strip() or _preferred_metadata_language(db)
        tmdb = TMDBClient(db)
        details = tmdb.get_details(tmdb_id, media_type, language=resolved_language) or {}
        if not details:
            return {}

        imdb_id = details.get("external_ids", {}).get("imdb_id")
        existing_omdb = None
        if imdb_id:
            existing_omdb = db.query(OMDBCache).filter(OMDBCache.imdb_id == imdb_id).first()
        if imdb_id and not _has_cached_omdb_payload(existing_omdb.raw_data if existing_omdb else None):
            OMDBClient(db).get_ratings(imdb_id, queue_on_limit=True)

        _cache_virtual_poster(details.get("poster_path"))
        return details
    except Exception as exc:
        logger.warning(f"Failed to hydrate virtual metadata for {media_type} {tmdb_id}: {exc}")
        return {}

def _add_or_get_list_item(
    db,
    list_id: int,
    tmdb_id: Optional[int],
    media_item_id: Optional[int],
    media_type: str,
    title: str,
    poster_path: Optional[str],
    language: Optional[str] = None,
    persist_immediately: bool = True,
) -> tuple[CustomListItem, bool]:
    media_type = _normalize_media_type(media_type)
    details = {}
    if tmdb_id and not media_item_id:
        media_item_id = _resolve_local_media_item_id(db, tmdb_id, media_type)
        
        state = db.query(VirtualMediaState).filter(
            VirtualMediaState.tmdb_id == tmdb_id,
            VirtualMediaState.media_type == media_type,
        ).first()
        
        is_new_state = not state
        should_hydrate_metadata = bool((language or "").strip()) or is_new_state or not title or not poster_path
        
        if should_hydrate_metadata:
            details = _hydrate_virtual_metadata(db, tmdb_id, media_type, language)
            
        if not state:
            db.add(VirtualMediaState(tmdb_id=tmdb_id, media_type=media_type, custom_tags=[], is_tracked=True))
            if persist_immediately:
                db.commit()
            else:
                db.flush()
        else:
            state.is_tracked = True
            if persist_immediately:
                db.commit()
            else:
                db.flush()

        title = title or details.get("title") or details.get("name") or title
        poster_path = details.get("poster_path") or poster_path
        _cache_virtual_poster(poster_path)

    if media_item_id and not title:
        media_item = db.query(MediaItem).filter(MediaItem.id == media_item_id).first()
        if media_item:
            title = media_item.internal_title or media_item.filename
            match = db.query(MediaMatch).filter(MediaMatch.media_item_id == media_item_id, MediaMatch.is_active == True).first()
            if match:
                if not tmdb_id:
                    tmdb_id = match.tmdb_id
                loc = db.query(MetadataLocalization).filter(MetadataLocalization.match_id == match.id).first()
                if loc and loc.poster_path:
                    poster_path = loc.poster_path

    if not title:
        raise ValueError("Title is required")

    query = db.query(CustomListItem).filter(CustomListItem.list_id == list_id)
    if tmdb_id:
        query = query.filter(
            CustomListItem.tmdb_id == tmdb_id,
            CustomListItem.media_type == media_type,
        )
    elif media_item_id:
        query = query.filter(CustomListItem.media_item_id == media_item_id)
    else:
        raise ValueError("Either tmdb_id or media_item_id must be provided")

    existing = query.first()
    if existing:
        app_logger.error(
            f"[LISTS_DEBUG] duplicate-hit list_id={list_id} tmdb_id={tmdb_id} media_item_id={media_item_id} "
            f"existing_item_id={existing.id} existing_title={existing.title!r}"
        )
        if media_item_id and not existing.media_item_id:
            existing.media_item_id = media_item_id
            if persist_immediately:
                db.commit()
            else:
                db.flush()
        if not existing.title and title:
            existing.title = title
            if persist_immediately:
                db.commit()
            else:
                db.flush()
        if poster_path and existing.poster_path != poster_path:
            existing.poster_path = poster_path
            if persist_immediately:
                db.commit()
            else:
                db.flush()
        return existing, False

    new_item = CustomListItem(
        list_id=list_id,
        tmdb_id=tmdb_id,
        media_item_id=media_item_id,
        media_type=media_type,
        title=title,
        poster_path=poster_path
    )
    db.add(new_item)
    if persist_immediately:
        db.commit()
        db.refresh(new_item)
    else:
        db.flush()
    app_logger.error(
        f"[LISTS_DEBUG] created-item list_id={list_id} tmdb_id={tmdb_id} media_item_id={media_item_id} "
        f"new_item_id={new_item.id} title={new_item.title!r}"
    )
    return new_item, True

def _enrich_bulk_media_candidates(db, results: list[dict[str, Any]], media_type: str) -> list[dict[str, Any]]:
    limited = list(results[:10])
    tmdb_ids = []
    for result in limited:
        try:
            tmdb_ids.append(int(result.get("id")))
        except (TypeError, ValueError):
            continue

    local_movie_map: dict[int, int] = {}
    local_series_set: set[int] = set()

    if tmdb_ids:
        if media_type == "movie":
            local_movie_rows = (
                db.query(MediaMatch.tmdb_id, MediaItem.id)
                .join(MediaItem, MediaItem.id == MediaMatch.media_item_id)
                .filter(
                    MediaMatch.is_active.is_(True),
                    MediaMatch.item_type == ItemType.MOVIE,
                    MediaMatch.tmdb_id.in_(tmdb_ids),
                )
                .all()
            )
            local_movie_map = {
                int(tmdb_id): int(media_item_id)
                for tmdb_id, media_item_id in local_movie_rows
                if tmdb_id and media_item_id
            }
        elif media_type == "tv":
            local_series_rows = (
                db.query(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id)
                .filter(
                    MediaMatch.is_active.is_(True),
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
    for result in limited:
        enriched = dict(result)
        try:
            result_tmdb_id = int(enriched.get("id"))
        except (TypeError, ValueError):
            enriched_results.append(enriched)
            continue

        if media_type == "movie":
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


def _store_bulk_import_report(list_id: int, payload: dict[str, Any]):
    with bulk_import_reports_lock:
        bulk_import_reports[list_id] = payload

def _get_bulk_import_report(list_id: int) -> Optional[dict[str, Any]]:
    with bulk_import_reports_lock:
        report = bulk_import_reports.get(list_id)
        return dict(report) if report else None

def _run_bulk_import_job(list_id: int, raw_text: str, language: str):
    db = DBSession()
    try:
        valid_rows, ignored_rows = _parse_bulk_import_rows(raw_text)
        total_rows = len(valid_rows)

        adult_setting = db.query(UserSetting).filter(UserSetting.key == "include_adult").first()
        include_adult = False
        if adult_setting:
            val = adult_setting.value
            include_adult = val.lower() == "true" if isinstance(val, str) else bool(val)

        tmdb = TMDBClient(db)
        added_items = []
        already_in_list = []
        no_match = []
        multiple_matches = []

        for index, row in enumerate(valid_rows, start=1):
            if is_scan_stop_requested():
                _store_bulk_import_report(list_id, {
                    "status": "stopped",
                    "list_id": list_id,
                    "added_items": added_items,
                    "report": {
                        "total_lines": len((raw_text or "").splitlines()),
                        "parsed_lines": total_rows,
                        "added_count": len(added_items),
                        "already_in_list_count": len(already_in_list),
                        "ignored_count": len(ignored_rows),
                        "no_match_count": len(no_match),
                        "multiple_match_count": len(multiple_matches),
                        "ignored": ignored_rows,
                        "already_in_list": already_in_list,
                        "no_match": no_match,
                        "multiple_matches": multiple_matches,
                        "finished_at": time.time(),
                    },
                })
                break
            update_scan_status({
                "phase": "importing",
                "current": index - 1,
                "total": total_rows,
                "message": f"{index - 1}/{total_rows}",
                "current_item": row["raw"],
                "list_id": list_id,
            })

            match = _pick_bulk_search_match(
                tmdb,
                row["title"],
                row["year"],
                row["media_type"],
                include_adult,
            )

            if match["status"] == "no_match":
                no_match.append(row)
            elif match["status"] == "multiple":
                multiple_matches.append({
                    **row,
                    "media_type": match["media_type"],
                    "candidate_count": len(match["results"]),
                    "candidates": _enrich_bulk_media_candidates(db, match["results"], match["media_type"]),
                })
            else:
                result = match["result"]
                media_type = match["media_type"]
                item, created = _add_or_get_list_item(
                    db,
                    list_id,
                    result.get("id"),
                    None,
                    media_type,
                    (result.get("title") or result.get("name") or row["title"]).strip(),
                    result.get("poster_path"),
                    language,
                    False,
                )
                serialized = _serialize_list_item(db, item)
                if created:
                    added_items.append(serialized)
                else:
                    already_in_list.append({
                        "line_number": row["line_number"],
                        "raw": row["raw"],
                        "item": serialized,
                    })

            update_scan_status({
                "current": index,
                "message": f"{index}/{total_rows}",
                "current_item": row["raw"],
                "list_id": list_id,
            })

        db.commit()

        if not is_scan_stop_requested():
            report = {
                "total_lines": len((raw_text or "").splitlines()),
                "parsed_lines": len(valid_rows),
                "added_count": len(added_items),
                "already_in_list_count": len(already_in_list),
                "ignored_count": len(ignored_rows),
                "no_match_count": len(no_match),
                "multiple_match_count": len(multiple_matches),
                "ignored": ignored_rows,
                "already_in_list": already_in_list,
                "no_match": no_match,
                "multiple_matches": multiple_matches,
                "finished_at": time.time(),
            }
            _store_bulk_import_report(list_id, {
                "status": "completed",
                "list_id": list_id,
                "added_items": added_items,
                "report": report,
            })
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk importing list items: {e}")
        _store_bulk_import_report(list_id, {
            "status": "failed",
            "list_id": list_id,
            "error": str(e),
            "finished_at": time.time(),
        })
    finally:
        update_scan_status({
            "active": False,
            "phase": "idle",
            "current": 0,
            "total": 0,
            "message": "",
            "current_item": "",
            "list_id": None,
            "can_stop": False,
            "stop_requested": False,
        })
        db.close()

def _run_list_import_job(list_id: int, raw_items: list, language: Optional[str] = None):
    db = DBSession()
    try:
        total_rows = len(raw_items)
        added_items = []
        already_in_list = []
        for index, raw_item in enumerate(raw_items, start=1):
            if is_scan_stop_requested():
                _store_bulk_import_report(list_id, {
                    "status": "stopped",
                    "list_id": list_id,
                    "added_items": added_items,
                    "report": {
                        "total_lines": total_rows,
                        "parsed_lines": total_rows,
                        "added_count": len(added_items),
                        "already_in_list_count": len(already_in_list),
                        "no_match_count": 0,
                        "multiple_match_count": 0,
                        "ignored_count": 0,
                        "already_in_list": already_in_list,
                        "no_match": [],
                        "multiple_matches": [],
                        "ignored": [],
                        "import_source": "file",
                        "finished_at": time.time(),
                    },
                })
                break
            title = (raw_item.get("title") or "").strip()
            
            update_scan_status({
                "phase": "importing",
                "current": index - 1,
                "total": total_rows,
                "message": f"{index - 1}/{total_rows}",
                "current_item": title,
                "list_id": list_id,
            })
            
            tmdb_id = raw_item.get("tmdb_id")
            media_type = (raw_item.get("media_type") or "movie").strip() or "movie"
            poster_path = raw_item.get("poster_path")
            imported_imdb_id = (raw_item.get("imdb_id") or "").strip()
            imported_omdb_payload = _build_imported_omdb_payload(raw_item)

            if not tmdb_id and not title:
                continue

            if imported_imdb_id and imported_omdb_payload:
                _upsert_imported_omdb_cache(db, imported_imdb_id, imported_omdb_payload)

            item, created = _add_or_get_list_item(
                db,
                list_id,
                tmdb_id,
                None,
                media_type,
                title,
                poster_path,
                language,
                False,
            )
            serialized = _serialize_list_item(db, item)
            if created:
                added_items.append(serialized)
            else:
                already_in_list.append({
                    "line_number": index,
                    "raw": title,
                    "item": serialized,
                })

            update_scan_status({
                "current": index,
                "message": f"{index}/{total_rows}",
                "current_item": title,
                "list_id": list_id,
            })
            
        db.commit()
        
        if not is_scan_stop_requested():
            report = {
                "total_lines": total_rows,
                "parsed_lines": total_rows,
                "added_count": len(added_items),
                "already_in_list_count": len(already_in_list),
                "no_match_count": 0,
                "multiple_match_count": 0,
                "ignored_count": 0,
                "already_in_list": already_in_list,
                "no_match": [],
                "multiple_matches": [],
                "ignored": [],
                "import_source": "file",
                "finished_at": time.time(),
            }
            _store_bulk_import_report(list_id, {
                "status": "completed",
                "list_id": list_id,
                "added_items": added_items,
                "report": report,
            })
    except Exception as e:
        db.rollback()
        logger.error(f"Error background importing list: {e}")
        _store_bulk_import_report(list_id, {
            "status": "failed",
            "list_id": list_id,
            "error": str(e),
            "finished_at": time.time(),
        })
    finally:
        update_scan_status({
            "active": False,
            "phase": "idle",
            "current": 0,
            "total": 0,
            "message": "",
            "current_item": "",
            "list_id": None,
            "can_stop": False,
            "stop_requested": False,
        })
        db.close()
