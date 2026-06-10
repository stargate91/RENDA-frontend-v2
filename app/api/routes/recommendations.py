from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, func
import logging
import os
import threading
import subprocess
import platform
from pathlib import Path
from datetime import datetime
from typing import Optional
from datetime import datetime, timedelta

from app.db.deletion import delete_extra_files_by_ids, delete_media_items_by_ids
from app.db.base import Session
from app.db.models import *
from app.services.file_system_service import FileSystemService

logger = logging.getLogger(__name__)
router = APIRouter()

MEDIA_IMAGE_ROOT = Path("data/media/images")


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


def _public_image_path(path: Optional[str], subfolder: str) -> Optional[str]:
    if not path or path.startswith("http://") or path.startswith("https://"):
        return None

    clean_path = path.replace("\\", "/")
    marker = f"media/images/{subfolder}/"
    filename = clean_path.split(marker, 1)[1] if marker in clean_path else clean_path.lstrip("/")
    local_file = MEDIA_IMAGE_ROOT / subfolder / filename
    if local_file.exists() and local_file.stat().st_size > 100:
        return f"/{filename}"
    return None


def _resolve_local_media_item_id(db, tmdb_id: int | None, media_type: str | None):
    if not tmdb_id:
        return None, None

    query = db.query(MediaItem.id, MediaItem.item_type, MediaMatch.series_tmdb_id).join(
        MediaMatch, MediaMatch.media_item_id == MediaItem.id
    ).filter(
        MediaMatch.is_active == True,
        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
    )

    if media_type == "tv":
        query = query.filter(or_(MediaMatch.series_tmdb_id == tmdb_id, MediaMatch.tmdb_id == tmdb_id))
    else:
        query = query.filter(MediaMatch.tmdb_id == tmdb_id)

    candidates = query.all()
    if not candidates:
        return None, None

    priority = {
        "tv": {"series": 0, "season": 1, "episode": 2, "movie": 3},
        "movie": {"movie": 0, "series": 1, "season": 2, "episode": 3},
    }
    rank_map = priority.get(media_type or "movie", priority["movie"])

    def _rank(row):
        item_type = row.item_type.value if getattr(row, "item_type", None) else ""
        return (rank_map.get(item_type, 99), row.id)

    chosen = sorted(candidates, key=_rank)[0]
    return chosen.id, (chosen.series_tmdb_id or tmdb_id if media_type == "tv" else None)


def _resolve_local_recommendation_bindings(db, items):
    movie_ids = set()
    tv_ids = set()
    for item in items or []:
        tmdb_id = item.get("id")
        if not tmdb_id:
            continue
        media_type = item.get("media_type") or ("movie" if item.get("title") else "tv")
        if media_type == "tv":
            tv_ids.add(tmdb_id)
        else:
            movie_ids.add(tmdb_id)

    if not movie_ids and not tv_ids:
        return {}

    filters = []
    if movie_ids:
        filters.append(MediaMatch.tmdb_id.in_(movie_ids))
    if tv_ids:
        filters.append(or_(MediaMatch.series_tmdb_id.in_(tv_ids), MediaMatch.tmdb_id.in_(tv_ids)))

    rows = db.query(
        MediaItem.id,
        MediaItem.item_type,
        MediaMatch.tmdb_id,
        MediaMatch.series_tmdb_id,
        MediaMatch.imdb_id,
        MediaMatch.rating_imdb,
        MediaMatch.rating_tmdb,
    ).join(
        MediaMatch, MediaMatch.media_item_id == MediaItem.id
    ).filter(
        MediaMatch.is_active == True,
        MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
        or_(*filters),
    ).all()

    priority = {
        "tv": {"series": 0, "season": 1, "episode": 2, "movie": 3},
        "movie": {"movie": 0, "series": 1, "season": 2, "episode": 3},
    }
    bindings = {}

    imdb_ids = {row.imdb_id for row in rows if getattr(row, "imdb_id", None)}
    omdb_map = {}
    if imdb_ids:
        omdb_rows = db.query(OMDBCache).filter(OMDBCache.imdb_id.in_(imdb_ids)).all()
        for omdb_row in omdb_rows:
            raw_data = omdb_row.raw_data if isinstance(omdb_row.raw_data, dict) else {}
            raw_rating = raw_data.get("imdb_rating")
            try:
                parsed_rating = float(raw_rating) if raw_rating and raw_rating != "N/A" else 0.0
            except (TypeError, ValueError):
                parsed_rating = 0.0
            omdb_map[omdb_row.imdb_id] = parsed_rating

    def _maybe_assign(key, media_type, row):
        current = bindings.get((media_type, key))
        rank_map = priority[media_type]
        item_type = row.item_type.value if getattr(row, "item_type", None) else ""
        imdb_rating = float(row.rating_imdb or omdb_map.get(row.imdb_id, 0) or 0)
        tmdb_rating = float(row.rating_tmdb or 0)
        candidate = (
            rank_map.get(item_type, 99),
            -imdb_rating,
            -tmdb_rating,
            row.id,
            (row.series_tmdb_id or key) if media_type == "tv" else None,
            imdb_rating if imdb_rating > 0 else None,
            row.rating_tmdb,
        )
        if current is None or candidate[:4] < current[:4]:
            bindings[(media_type, key)] = candidate

    for row in rows:
        if row.tmdb_id in movie_ids:
            _maybe_assign(row.tmdb_id, "movie", row)
        if row.series_tmdb_id in tv_ids:
            _maybe_assign(row.series_tmdb_id, "tv", row)
        elif row.tmdb_id in tv_ids:
            _maybe_assign(row.tmdb_id, "tv", row)

    return {
        key: {
            "media_item_id": value[3],
            "library_series_tmdb_id": value[4],
            "rating_imdb": value[5],
            "rating_tmdb": value[6],
        }
        for key, value in bindings.items()
    }


def _resolve_cached_recommendation_ratings(db, items):
    tmdb_ids = {item.get("id") for item in (items or []) if item.get("id")}
    if not tmdb_ids:
        return {}

    cache_rows = db.query(TMDBCache).filter(TMDBCache.tmdb_id.in_(tmdb_ids)).all()
    imdb_ids_by_tmdb = {}

    for cache_row in cache_rows:
        raw_data = cache_row.raw_data if isinstance(cache_row.raw_data, dict) else {}
        imdb_id = (
            raw_data.get("imdb_id")
            or raw_data.get("external_ids", {}).get("imdb_id")
        )
        if imdb_id and imdb_id not in {"", "N/A"} and cache_row.tmdb_id not in imdb_ids_by_tmdb:
            imdb_ids_by_tmdb[cache_row.tmdb_id] = imdb_id

    if not imdb_ids_by_tmdb:
        return {}

    omdb_rows = db.query(OMDBCache).filter(OMDBCache.imdb_id.in_(set(imdb_ids_by_tmdb.values()))).all()
    omdb_map = {}
    for omdb_row in omdb_rows:
        raw_data = omdb_row.raw_data if isinstance(omdb_row.raw_data, dict) else {}
        raw_rating = raw_data.get("imdb_rating")
        try:
            parsed_rating = float(raw_rating) if raw_rating and raw_rating != "N/A" else None
        except (TypeError, ValueError):
            parsed_rating = None
        if parsed_rating and parsed_rating > 0:
            omdb_map[omdb_row.imdb_id] = parsed_rating

    return {
        tmdb_id: omdb_map[imdb_id]
        for tmdb_id, imdb_id in imdb_ids_by_tmdb.items()
        if imdb_id in omdb_map
    }


def _with_local_recommendation_images(items, db):
    bindings = _resolve_local_recommendation_bindings(db, items)
    cached_imdb_ratings = _resolve_cached_recommendation_ratings(db, items)
    annotated = []
    for item in items or []:
        item_data = dict(item)
        tmdb_id = item.get("id")
        media_type = item.get("media_type") or ("movie" if item.get("title") else "tv")
        binding = bindings.get((media_type, tmdb_id), {})
        media_item_id = binding.get("media_item_id")
        library_series_tmdb_id = binding.get("library_series_tmdb_id")
        item_data["media_type"] = media_type
        item_data["local_poster_path"] = _public_image_path(item.get("poster_path"), "posters")
        item_data["local_backdrop_path"] = _public_image_path(item.get("backdrop_path"), "backdrops")
        item_data["media_item_id"] = media_item_id
        item_data["library_series_tmdb_id"] = library_series_tmdb_id
        item_data["in_library"] = media_item_id is not None
        item_data["rating_imdb"] = binding.get("rating_imdb") or cached_imdb_ratings.get(tmdb_id)
        item_data["rating_tmdb"] = binding.get("rating_tmdb") or item.get("vote_average")
        annotated.append(item_data)
    return annotated


def _get_top_genre(db, preferred_language: str):
    tmdb_ids = [
        row[0]
        for row in db.query(MediaMatch.tmdb_id).join(
            MediaItem, MediaMatch.media_item_id == MediaItem.id
        ).filter(
            MediaMatch.is_active == True,
            MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
            MediaMatch.tmdb_id != None,
        ).distinct().all()
    ]
    if not tmdb_ids:
        return None, None, None, None

    short_language = preferred_language.split("-", 1)[0].lower()
    caches_by_id = defaultdict(list)
    for cache in db.query(TMDBCache).filter(TMDBCache.tmdb_id.in_(tmdb_ids)).all():
        caches_by_id[cache.tmdb_id].append(cache)

    genre_counts_movie = defaultdict(int)
    genre_counts_tv = defaultdict(int)

    def _cache_rank(cache):
        target = (cache.target_language or "").lower()
        if target == preferred_language.lower():
            return (0, -cache.updated_at.timestamp())
        if target == short_language or target.startswith(f"{short_language}-"):
            return (1, -cache.updated_at.timestamp())
        return (2, -cache.updated_at.timestamp())

    def _find_localized_genre_label(genre_id: str) -> Optional[str]:
        if not genre_id:
            return None
        best_match = None
        best_rank = None

        for candidates in caches_by_id.values():
            for cache in candidates:
                if not isinstance(cache.raw_data, dict):
                    continue
                genres = cache.raw_data.get("genres")
                if not isinstance(genres, list):
                    continue

                target = (cache.target_language or "").lower()
                if target == preferred_language.lower():
                    rank = (0, -cache.updated_at.timestamp())
                elif target == short_language or target.startswith(f"{short_language}-"):
                    rank = (1, -cache.updated_at.timestamp())
                else:
                    continue

                for genre in genres:
                    if str(genre.get("id")) != genre_id:
                        continue
                    genre_name = genre.get("name")
                    if not genre_name:
                        continue
                    if best_rank is None or rank < best_rank:
                        best_rank = rank
                        best_match = genre_name

        return best_match

    for tmdb_id in tmdb_ids:
        candidates = caches_by_id.get(tmdb_id)
        if not candidates:
            continue
        chosen = sorted(candidates, key=_cache_rank)[0]
        genres = chosen.raw_data.get("genres") if isinstance(chosen.raw_data, dict) else None
        if not isinstance(genres, list):
            continue
        
        media_type = "movie" if chosen.cache_key and "/movie/" in chosen.cache_key else "tv"
            
        for genre in genres:
            genre_id = genre.get("id")
            if genre_id is None:
                continue
            genre_key = str(genre_id)
            if media_type == "movie":
                genre_counts_movie[genre_key] += 1
            else:
                genre_counts_tv[genre_key] += 1

    top_movie_genre_id = max(genre_counts_movie.items(), key=lambda item: item[1])[0] if genre_counts_movie else None
    top_tv_genre_id = max(genre_counts_tv.items(), key=lambda item: item[1])[0] if genre_counts_tv else None
    
    return (
        top_movie_genre_id, _find_localized_genre_label(top_movie_genre_id),
        top_tv_genre_id, _find_localized_genre_label(top_tv_genre_id)
    )


def _cache_recommendation_images(items):
    from concurrent.futures import ThreadPoolExecutor
    from app.services.asset_service import AssetService

    tasks = []
    for item in items or []:
        poster_path = item.get("poster_path")
        if poster_path and not _public_image_path(poster_path, "posters"):
            tasks.append(("posters", poster_path, "w500"))

        backdrop_path = item.get("backdrop_path")
        if backdrop_path and not _public_image_path(backdrop_path, "backdrops"):
            tasks.append(("backdrops", backdrop_path, "w1280"))

    if not tasks:
        return

    seen = set()
    unique_tasks = []
    for task in tasks:
        key = (task[0], task[1])
        if key in seen:
            continue
        seen.add(key)
        unique_tasks.append(task)

    asset_service = AssetService()

    def _download_task(args):
        subfolder, tmdb_path, size = args
        try:
            asset_service.download_image(tmdb_path, subfolder, size=size)
        except Exception as e:
            logger.error(f"Failed recommendation image cache download ({tmdb_path}): {e}")

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(_download_task, unique_tasks))


@router.get("/recommendations")
def get_recommendations(background_tasks: BackgroundTasks, language: Optional[str] = None, ui_language: Optional[str] = None):
    from app.api.tmdb_client import TMDBClient
    from app.db.models.metadata import TMDBCache
    from app.db.models.media import CustomList, CustomListItem
    
    db = Session()
    try:
        watchlist = db.query(CustomList).filter(CustomList.name == "Watchlist").first()
        watchlist_tmdb_ids = []
        if watchlist:
            watchlist_tmdb_ids = [
                item[0] for item in db.query(CustomListItem.tmdb_id).filter(
                    CustomListItem.list_id == watchlist.id,
                    CustomListItem.tmdb_id != None
                ).all()
            ]

        tmdb = TMDBClient(db)
        preferred_language = language or _preferred_metadata_language(db)
        preferred_ui_language = ui_language or preferred_language
        top_movie_genre_id, top_movie_genre, top_tv_genre_id, top_tv_genre = _get_top_genre(db, preferred_ui_language)

        trending_key = tmdb._generate_cache_key("/trending/all/day", {
            "api_key": tmdb._api_key,
            "language": preferred_language
        })
        
        def _build_discover(media_type, genre_id):
            if genre_id:
                endpoint = f"/discover/{media_type}"
                params = {
                    "api_key": tmdb._api_key,
                    "language": preferred_language,
                    "page": 1,
                    "sort_by": "popularity.desc",
                    "with_genres": str(genre_id)
                }
            else:
                endpoint = f"/trending/{media_type}/week"
                params = {
                    "api_key": tmdb._api_key,
                    "language": preferred_language
                }
            return endpoint, params, tmdb._generate_cache_key(endpoint, params)

        discover_movie_endpoint, discover_movie_params, discover_movie_key = _build_discover("movie", top_movie_genre_id)
        discover_tv_endpoint, discover_tv_params, discover_tv_key = _build_discover("tv", top_tv_genre_id)

        trending_cache = db.query(TMDBCache).filter(TMDBCache.cache_key == trending_key).first()
        discover_movie_cache = db.query(TMDBCache).filter(TMDBCache.cache_key == discover_movie_key).first()
        discover_tv_cache = db.query(TMDBCache).filter(TMDBCache.cache_key == discover_tv_key).first()

        now = datetime.utcnow()
        needs_update = False
        
        if not trending_cache or (now - trending_cache.updated_at > timedelta(hours=24)):
            needs_update = True
        if not discover_movie_cache or (now - discover_movie_cache.updated_at > timedelta(hours=24)):
            needs_update = True
        if not discover_tv_cache or (now - discover_tv_cache.updated_at > timedelta(hours=24)):
            needs_update = True

        if needs_update:
            def update_recommendations_cache():
                bg_db = Session()
                try:
                    bg_db.query(TMDBCache).filter(TMDBCache.cache_key.in_([trending_key, discover_movie_key, discover_tv_key])).delete()
                    bg_db.commit()
                    
                    bg_tmdb = TMDBClient(bg_db)
                    bg_trending = bg_tmdb.get_trending("all", "day", language=preferred_language)
                    bg_discover_movie = bg_tmdb.discover("movie", with_genres=str(top_movie_genre_id), language=preferred_language) if top_movie_genre_id else bg_tmdb.get_trending("movie", "week", language=preferred_language)
                    bg_discover_tv = bg_tmdb.discover("tv", with_genres=str(top_tv_genre_id), language=preferred_language) if top_tv_genre_id else bg_tmdb.get_trending("tv", "week", language=preferred_language)

                    _cache_recommendation_images([*bg_trending, *bg_discover_movie, *bg_discover_tv])
                except Exception as e:
                    logger.error(f"Error updating recommendations in background: {e}")
                finally:
                    bg_db.close()
            
            background_tasks.add_task(update_recommendations_cache)

        if trending_cache and discover_movie_cache and discover_tv_cache:
            trending_items = trending_cache.raw_data.get("results", []) if isinstance(trending_cache.raw_data, dict) else trending_cache.raw_data
            discover_movie_items = discover_movie_cache.raw_data.get("results", []) if isinstance(discover_movie_cache.raw_data, dict) else discover_movie_cache.raw_data
            discover_tv_items = discover_tv_cache.raw_data.get("results", []) if isinstance(discover_tv_cache.raw_data, dict) else discover_tv_cache.raw_data
            background_tasks.add_task(_cache_recommendation_images, [*(trending_items or []), *(discover_movie_items or []), *(discover_tv_items or [])])
            return {
                "trending": _with_local_recommendation_images(trending_items, db),
                "discover_movies": _with_local_recommendation_images(discover_movie_items, db),
                "discover_series": _with_local_recommendation_images(discover_tv_items, db),
                "top_movie_genre": top_movie_genre,
                "top_tv_genre": top_tv_genre,
                "watchlist_item_ids": watchlist_tmdb_ids
            }

        trending = tmdb.get_trending("all", "day", language=preferred_language)
        discover_movie = tmdb.discover("movie", with_genres=str(top_movie_genre_id), language=preferred_language) if top_movie_genre_id else tmdb.get_trending("movie", "week", language=preferred_language)
        discover_tv = tmdb.discover("tv", with_genres=str(top_tv_genre_id), language=preferred_language) if top_tv_genre_id else tmdb.get_trending("tv", "week", language=preferred_language)
        background_tasks.add_task(_cache_recommendation_images, [*trending, *discover_movie, *discover_tv])
        return {
            "trending": _with_local_recommendation_images(trending, db),
            "discover_movies": _with_local_recommendation_images(discover_movie, db),
            "discover_series": _with_local_recommendation_images(discover_tv, db),
            "top_movie_genre": top_movie_genre,
            "top_tv_genre": top_tv_genre,
            "watchlist_item_ids": watchlist_tmdb_ids
        }
    finally:
        db.close()

@router.get("/discovery")
def get_discovery_items():
    """Returns grouped discovery items for the UI."""
    from app.services.media_discovery_service import MediaDiscoveryService
    db = Session()
    try:
        groups = MediaDiscoveryService(db).get_discovery_groups()
        return groups.model_dump() if hasattr(groups, "model_dump") else groups.dict()
    finally:
        db.close()

@router.get("/discovery/count")
def get_discovery_item_count():
    db = Session()
    try:
        from app.services.media_service import MediaService
        return {"count": MediaService(db).get_discovery_item_count()}
    finally:
        db.close()

@router.post("/discovery/delete")
def delete_discovery_items(payload: dict):
    item_ids = payload.get("item_ids", [])
    extra_ids = payload.get("extra_ids", [])
    mode = str(payload.get("mode") or "db_only").strip().lower()
    db = Session()
    try:
        if mode not in {"ignore", "db_only", "trash"}:
            return JSONResponse(content={"error": "Unsupported delete mode"}, status_code=400)

        item_ids = [int(item_id) for item_id in item_ids or []]
        extra_ids = [int(extra_id) for extra_id in extra_ids or []]

        if mode == "ignore":
            if extra_ids:
                return JSONResponse(content={"error": "Extras cannot be marked as ignored"}, status_code=400)
            if item_ids:
                items = db.query(MediaItem).filter(MediaItem.id.in_(item_ids)).all()
                for item in items:
                    if item.status != ItemStatus.IGNORED:
                        item.ignored_previous_status = item.status
                    item.status = ItemStatus.IGNORED
                    item.ignored_at = datetime.utcnow()
            db.commit()
            return {"status": "success", "ignored_items": len(item_ids)}

        if mode == "trash":
            fs = FileSystemService()
            trash_paths = []

            if item_ids:
                media_items = db.query(MediaItem).options(joinedload(MediaItem.extras)).filter(MediaItem.id.in_(item_ids)).all()
                for item in media_items:
                    if item.current_path:
                        trash_paths.append(Path(item.current_path))
                    elif item.original_path:
                        trash_paths.append(Path(item.original_path))
                    for extra in item.extras or []:
                        if extra.current_path:
                            trash_paths.append(Path(extra.current_path))
                        elif extra.original_path:
                            trash_paths.append(Path(extra.original_path))

            if extra_ids:
                extras = db.query(ExtraFile).filter(ExtraFile.id.in_(extra_ids)).all()
                for extra in extras:
                    if extra.current_path:
                        trash_paths.append(Path(extra.current_path))
                    elif extra.original_path:
                        trash_paths.append(Path(extra.original_path))

            fs.send_to_trash(trash_paths)

        if item_ids:
            delete_media_items_by_ids(db, item_ids)
        if extra_ids:
            delete_extra_files_by_ids(db, extra_ids)
        db.commit()
        return {"status": "success", "deleted_items": len(item_ids), "deleted_extras": len(extra_ids), "mode": mode}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting items: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()

@router.post("/watchlist")
def add_to_watchlist(payload: dict):
    from app.db.models.media import CustomList
    from app.services.lists_service import _add_or_get_list_item
    
    tmdb_id = payload.get("tmdb_id")
    item_type = str(payload.get("type", "movie")).strip().lower()
    if item_type in {"series", "show"}:
        item_type = "tv"
    elif item_type != "tv":
        item_type = "movie"
    if not tmdb_id:
        return JSONResponse(status_code=400, content={"error": "tmdb_id is required"})

    db = Session()
    try:
        # 1. Ensure Watchlist exists
        watchlist = db.query(CustomList).filter(CustomList.name == "Watchlist").first()
        if not watchlist:
            watchlist = CustomList(
                name="Watchlist",
                description="Your default system watchlist.",
                color="#0088ff", # Neon Blue
                icon="Bookmark"
            )
            db.add(watchlist)
            db.commit()

        new_item, created = _add_or_get_list_item(
            db=db,
            list_id=watchlist.id,
            tmdb_id=int(tmdb_id),
            media_item_id=None,
            media_type=item_type,
            title="",
            poster_path=None,
            language=_preferred_metadata_language(db),
            persist_immediately=False,
        )
        db.commit()
        db.refresh(new_item)

        if not created:
            return {"status": "success", "message": "Already in watchlist", "id": new_item.id}
        return {"status": "success", "id": new_item.id}
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Error adding to custom watchlist: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.delete("/watchlist/{tmdb_id}")
def remove_from_watchlist(tmdb_id: int):
    from app.db.models.media import CustomList, CustomListItem
    
    db = Session()
    try:
        watchlist = db.query(CustomList).filter(CustomList.name == "Watchlist").first()
        if not watchlist:
            return JSONResponse(status_code=404, content={"error": "Watchlist not found"})

        item = db.query(CustomListItem).filter(
            CustomListItem.list_id == watchlist.id,
            CustomListItem.tmdb_id == tmdb_id
        ).first()
        
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found in Watchlist"})

        db.delete(item)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing from custom watchlist: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
