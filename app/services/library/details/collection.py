import os
from sqlalchemy.orm import joinedload
from app.services.library.details.base import BaseDetailProvider
from fastapi.responses import JSONResponse
import logging
from app.utils.library_utils import (
    _parse_omdb_float,
    _parse_omdb_int,
    _download_media_assets_sync,
    _preferred_metadata_language,
    _match_language_code,
    _pick_backdrop_path,
    _public_image_path,
)
from app.db.models import *

logger = logging.getLogger(__name__)

class CollectionDetailProvider(BaseDetailProvider):
    def get_collection_detail(self, collection_tmdb_id: str):
        db = self.db
        try:
            from app.api.tmdb_client import TMDBClient

            try:
                collection_tmdb_id_int = int(collection_tmdb_id)
            except ValueError:
                return JSONResponse(status_code=400, content={"error": "Invalid collection TMDB ID"})

            ui_lang = _preferred_metadata_language(db)
            tmdb_client = TMDBClient(db)
            collection = db.query(MediaCollection).options(
                joinedload(MediaCollection.localizations)
            ).filter(MediaCollection.tmdb_id == collection_tmdb_id_int).first()

            items = db.query(MediaItem).options(
                joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
                joinedload(MediaItem.matches).joinedload(MediaMatch.collection_entity).joinedload(MediaCollection.localizations),
                joinedload(MediaItem.tags),
            ).join(MediaItem.matches).filter(
                MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED]),
                MediaItem.item_type == ItemType.MOVIE,
                MediaMatch.is_active == True,
                MediaMatch.collection_tmdb_id == collection_tmdb_id_int,
                MediaMatch.is_adult == False,
            ).all()

            tmdb_details = {}
            try:
                tmdb_details = tmdb_client._call_api(  # noqa: SLF001
                    f"/collection/{collection_tmdb_id_int}",
                    {
                        "api_key": getattr(tmdb_client, "_api_key", ""),
                        "language": ui_lang,
                    },
                ) or {}
            except Exception:
                tmdb_details = {}

            if not collection and not items and not tmdb_details:
                return JSONResponse(status_code=404, content={"error": "Collection not found"})

            if not collection and items:
                active_match = next((match for match in items[0].matches if match.is_active), None)
                collection = active_match.collection_entity if active_match else None

            collection_loc = self.formatter.pick_collection_localization(collection, ui_lang) if collection else None
            if collection_loc:
                missing_poster = None
                missing_backdrop = None
                effective_collection_poster = (
                    getattr(collection_loc, "manual_poster_path", None)
                    or collection_loc.poster_path
                )
                effective_collection_local_poster = (
                    getattr(collection_loc, "manual_local_poster_path", None)
                    if getattr(collection_loc, "manual_poster_path", None)
                    else collection_loc.local_poster_path
                )
                effective_collection_backdrop = (
                    getattr(collection, "manual_backdrop_path", None)
                    or collection.backdrop_path
                ) if collection else None
                effective_collection_local_backdrop = (
                    getattr(collection, "manual_local_backdrop_path", None)
                    if collection and getattr(collection, "manual_backdrop_path", None)
                    else (collection.local_backdrop_path if collection else None)
                )
                if effective_collection_poster and not _public_image_path(effective_collection_local_poster, "posters"):
                    local_p = os.path.join("data", "media", "images", "posters", effective_collection_poster.lstrip("/"))
                    if not os.path.exists(local_p):
                        missing_poster = effective_collection_poster
                if collection and effective_collection_backdrop and not _public_image_path(effective_collection_local_backdrop, "backdrops"):
                    local_b = os.path.join("data", "media", "images", "backdrops", effective_collection_backdrop.lstrip("/"))
                    if not os.path.exists(local_b):
                        missing_backdrop = effective_collection_backdrop

                if missing_poster or missing_backdrop:
                    _download_media_assets_sync(
                        poster_path=missing_poster,
                        backdrop_path=missing_backdrop,
                    )
                    updated = False
                    if missing_poster:
                        local_p_rel = f"data/media/images/posters/{missing_poster.lstrip('/')}"
                        if os.path.exists(local_p_rel):
                            if getattr(collection_loc, "manual_poster_path", None):
                                collection_loc.manual_local_poster_path = local_p_rel
                            else:
                                collection_loc.local_poster_path = local_p_rel
                            updated = True
                    if collection and missing_backdrop:
                        local_b_rel = f"data/media/images/backdrops/{missing_backdrop.lstrip('/')}"
                        if os.path.exists(local_b_rel):
                            if getattr(collection, "manual_backdrop_path", None):
                                collection.manual_local_backdrop_path = local_b_rel
                            else:
                                collection.local_backdrop_path = local_b_rel
                            updated = True
                    if updated:
                        db.commit()

            preferred_collection_backdrop = _pick_backdrop_path(tmdb_details, ui_lang) if tmdb_details else None

            movies = []
            owned_tmdb_ids = set()
            for item in items:
                active_match = next((match for match in item.matches if match.is_active), None)
                if not active_match:
                    continue
                owned_tmdb_ids.add(active_match.tmdb_id)
                from app.services.language_service import LanguageService
                loc = LanguageService.pick_localization(active_match.localizations, [ui_lang] if ui_lang else [])

                year = active_match.release_date.year if active_match.release_date else (item.fn_year or item.fd_year)
                movies.append({
                    "id": item.id,
                    "tmdb_id": active_match.tmdb_id,
                    "library_item_id": item.id,
                    "title": loc.title if loc and loc.title else (item.fn_title or item.fd_title or item.filename),
                    "year": year,
                    "poster_path": (_public_image_path(loc.local_poster_path, "posters") or loc.poster_path) if loc else None,
                    "backdrop_path": (_public_image_path(active_match.local_backdrop_path, "backdrops") or active_match.backdrop_path) if active_match else None,
                    "has_local_poster": bool(_public_image_path(loc.local_poster_path, "posters")) if loc else False,
                    "rating": active_match.rating_tmdb or 0,
                    "rating_tmdb": active_match.rating_tmdb or 0,
                    "rating_imdb": active_match.rating_imdb,
                    "type": item.item_type.value,
                    "path": item.current_path,
                    "is_favorite": bool(item.is_favorite),
                    "user_rating": item.user_rating,
                    "in_library": True,
                })

            for part in tmdb_details.get("parts", []) or []:
                part_tmdb_id = part.get("id")
                if not part_tmdb_id or part_tmdb_id in owned_tmdb_ids:
                    continue
                release_date = part.get("release_date")
                year = None
                if release_date:
                    try:
                        year = int(str(release_date).split("-")[0])
                    except (TypeError, ValueError):
                        year = None
                poster_path = part.get("poster_path")
                local_poster = _public_image_path(poster_path, "posters")
                movies.append({
                    "id": part_tmdb_id,
                    "tmdb_id": part_tmdb_id,
                    "library_item_id": None,
                    "title": part.get("title") or part.get("original_title") or f"Movie {part_tmdb_id}",
                    "year": year,
                    "poster_path": local_poster or poster_path,
                    "backdrop_path": part.get("backdrop_path"),
                    "has_local_poster": bool(local_poster),
                    "rating": part.get("vote_average") or 0,
                    "rating_tmdb": part.get("vote_average") or 0,
                    "rating_imdb": None,
                    "type": "movie",
                    "path": None,
                    "is_favorite": False,
                    "user_rating": None,
                    "in_library": False,
                })

            movies.sort(
                key=lambda movie: (
                    0 if movie.get("in_library") else 1,
                    ((movie.get("year") or 0) * -1),
                    str(movie.get("title") or "").lower(),
                )
            )

            fallback_name = None
            if not collection_loc and items:
                first_match = next((match for match in items[0].matches if match.is_active), None)
                fallback_name = first_match.collection if first_match else None

            result = {
                "tmdb_id": collection_tmdb_id_int,
                "title": (collection_loc.name if collection_loc and collection_loc.name else tmdb_details.get("name") or fallback_name or f"Collection {collection_tmdb_id_int}"),
                "overview": (collection_loc.overview if collection_loc else None) or tmdb_details.get("overview"),
                "poster_path": (
                    _public_image_path(getattr(collection_loc, "manual_local_poster_path", None), "posters")
                    or _public_image_path(getattr(collection_loc, "manual_poster_path", None), "posters")
                    or getattr(collection_loc, "manual_poster_path", None)
                    or _public_image_path(collection_loc.local_poster_path, "posters")
                    or collection_loc.poster_path
                ) if collection_loc else tmdb_details.get("poster_path"),
                "backdrop_path": (
                    _public_image_path(getattr(collection, "manual_local_backdrop_path", None), "backdrops")
                    or _public_image_path(getattr(collection, "manual_backdrop_path", None), "backdrops")
                    or getattr(collection, "manual_backdrop_path", None)
                    or _public_image_path(collection.local_backdrop_path, "backdrops")
                    or collection.backdrop_path
                ) if collection else (preferred_collection_backdrop or tmdb_details.get("backdrop_path")),
                "has_local_poster": bool(_public_image_path(getattr(collection_loc, "manual_local_poster_path", None) or collection_loc.local_poster_path, "posters")) if collection_loc else False,
                "has_local_backdrop": bool(_public_image_path(getattr(collection, "manual_local_backdrop_path", None) or collection.local_backdrop_path, "backdrops")) if collection else False,
                "owned_count": len([movie for movie in movies if movie.get("in_library")]),
                "total_count": len(movies),
                "movies": movies,
            }
            return JSONResponse(content=result, media_type="application/json; charset=utf-8")
        except Exception as e:
            import traceback
            logger.error(f"Error getting collection detail: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)
