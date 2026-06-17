from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from app.db.base import get_db
from app.db.models import MediaItem, TMDBCache, MediaMatch
from app.utils.library_utils import _pick_backdrop_path, _public_image_path, _tmdb_image_url
from app.utils.library_utils.image_constants import BACKDROP_SIZE, LOGO_SIZE, POSTER_SIZE, STILL_SIZE

import logging
import traceback
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

def _resolve_image_path(path: str | None, local_path: str | None, subfolder: str, size: str) -> str | None:
    if not path:
        return None
    public = _public_image_path(local_path, subfolder) or _public_image_path(path, subfolder)
    if public:
        return public
    return _tmdb_image_url(path, size=size)

def _resolve_poster_path(path: str | None, local_path: str | None) -> str | None:
    return _resolve_image_path(path, local_path, "posters", POSTER_SIZE)

def _resolve_backdrop_path(path: str | None, local_path: str | None) -> str | None:
    return _resolve_image_path(path, local_path, "backdrops", BACKDROP_SIZE)

def _resolve_still_path(path: str | None, local_path: str | None) -> str | None:
    return _resolve_image_path(path, local_path, "stills", STILL_SIZE)

def _resolve_logo_path(path: str | None, local_path: str | None) -> str | None:
    return _resolve_image_path(path, local_path, "logos", LOGO_SIZE)

router = APIRouter()

@router.get("/item/{item_id}/full-metadata")
def get_full_item_metadata(item_id: str, media_type: str | None = Query(None), db: Session = Depends(get_db)):
    """Get all metadata details for a specific item"""
    try:
        target_item_id = None
        if isinstance(item_id, str) and item_id.startswith("tmdb_"):
            try:
                tmdb_id = int(item_id.split("_")[1])
            except (ValueError, IndexError):
                raise HTTPException(status_code=400, detail="Invalid TMDB ID format")

            from app.api.tmdb_client import TMDBClient
            from app.utils.library_utils import _preferred_metadata_language

            ui_lang = _preferred_metadata_language(db)
            normalized_media_type = "tv" if str(media_type or "").lower() in {"tv", "series"} else "movie"
            tmdb_client = TMDBClient(db)
            tmdb_data = tmdb_client.get_details(tmdb_id, "series" if normalized_media_type == "tv" else "movie", language=ui_lang)
            if not tmdb_data:
                raise HTTPException(status_code=404, detail="Virtual item not found")

            tmdb_caches = db.query(TMDBCache).filter(TMDBCache.tmdb_id == tmdb_id).all()
            cache_prefix = f"/{'tv' if normalized_media_type == 'tv' else 'movie'}/{tmdb_id}"
            preferred_cache = next(
                (
                    cache for cache in tmdb_caches
                    if isinstance(cache.raw_data, dict)
                    and str(cache.cache_key or "").startswith(cache_prefix)
                    and (
                        not ui_lang
                        or str(cache.locale or "") == str(ui_lang)
                        or f"language={ui_lang}" in str(cache.cache_key or "")
                    )
                ),
                None,
            )
            if preferred_cache is None:
                preferred_cache = next(
                (
                    cache for cache in tmdb_caches
                    if isinstance(cache.raw_data, dict) and str(cache.cache_key or "").startswith(cache_prefix)
                ),
                None,
            )
            preferred_raw = preferred_cache.raw_data if preferred_cache and isinstance(preferred_cache.raw_data, dict) else {}
            from app.db.models import VirtualMediaState
            virtual_state = db.query(VirtualMediaState).filter(
                VirtualMediaState.tmdb_id == tmdb_id,
                VirtualMediaState.media_type == normalized_media_type,
            ).first()
            effective_poster_path = (
                virtual_state.manual_poster_path if virtual_state and virtual_state.manual_poster_path else (
                    preferred_raw.get("poster_path") or tmdb_data.get("poster_path")
                )
            )
            effective_backdrop_path = (
                virtual_state.manual_backdrop_path if virtual_state and virtual_state.manual_backdrop_path else (
                preferred_raw.get("manual_backdrop_path")
                or _pick_backdrop_path(preferred_raw, ui_lang)
                or preferred_raw.get("backdrop_path")
                or _pick_backdrop_path(tmdb_data, ui_lang)
                or tmdb_data.get("backdrop_path")
                )
            )
            api_responses = {}
            series_api_responses = {}
            for cache in tmdb_caches:
                if not isinstance(cache.raw_data, dict) or not str(cache.cache_key or "").startswith(cache_prefix):
                    continue
                if normalized_media_type == "tv":
                    series_api_responses[cache.locale] = cache.raw_data
                else:
                    api_responses[cache.locale] = cache.raw_data
            if normalized_media_type == "tv":
                if not series_api_responses:
                    series_api_responses[ui_lang or "en-US"] = tmdb_data
            elif not api_responses:
                api_responses[ui_lang or "en-US"] = tmdb_data

            is_tv = normalized_media_type == "tv"
            virtual_match = {
                "id": f"virtual_{'series' if is_tv else 'movie'}_{tmdb_id}",
                "tmdb_id": tmdb_id,
                "type": "series" if is_tv else "movie",
                "is_active": True,
                "localizations": [],
                "api_responses": api_responses,
                "series_api_responses": series_api_responses,
                "confidence": 1.0,
                "backdrop_path": _resolve_backdrop_path(effective_backdrop_path, None),
                "local_backdrop_path": _resolve_backdrop_path(effective_backdrop_path, None),
                "still_path": None,
                "local_still_path": None,
                "director": None,
                "cast": None,
                "collection": None,
                "networks": [],
                "companies": [],
                "series_type": None,
                "number_of_seasons": None,
                "number_of_episodes": None,
                "fetched_languages": None,
                "release_date": None if is_tv else tmdb_data.get("release_date"),
                "first_air_date": tmdb_data.get("first_air_date") if is_tv else None,
                "last_air_date": tmdb_data.get("last_air_date") if is_tv else None,
                "episode_air_date": None,
                "season_air_date": None,
                "runtime": (tmdb_data.get("episode_run_time") or [None])[0] if is_tv else tmdb_data.get("runtime"),
                "popularity": tmdb_data.get("popularity"),
                "release_status": tmdb_data.get("status"),
                "rating_tmdb": tmdb_data.get("vote_average"),
                "vote_count_tmdb": tmdb_data.get("vote_count"),
                "imdb_id": (tmdb_data.get("external_ids") or {}).get("imdb_id"),
                "rating_imdb": None,
                "vote_count_imdb": None,
                "rating_meta": None,
                "rating_rotten": None,
                "budget": tmdb_data.get("budget"),
                "revenue": tmdb_data.get("revenue"),
                "series_tmdb_id": tmdb_id if is_tv else None,
                "season_tmdb_id": None,
                "season_number": None,
                "episode_number": None,
                "episode_count": None,
                "image_status": None,
                "backdrop_status": None,
            }

            return JSONResponse(content={
                "id": item_id,
                "filename": tmdb_data.get("title") or tmdb_data.get("name") or tmdb_data.get("original_title") or tmdb_data.get("original_name") or f"tmdb_{tmdb_id}",
                "folder": None,
                "technical": {},
                "guessit": {},
                "poster_path": _resolve_poster_path(effective_poster_path, None),
                "backdrop_path": _resolve_backdrop_path(effective_backdrop_path, None),
                "overrides": {
                    "target_language": ui_lang,
                    "source": None,
                    "edition": None,
                    "audio_type": None,
                    "user_rating": None,
                },
                "matches": [virtual_match],
            }, media_type="application/json; charset=utf-8")

        if isinstance(item_id, str) and item_id.startswith("series_"):
            try:
                series_tmdb_id = int(item_id.split("_")[1])
            except (ValueError, IndexError):
                raise HTTPException(status_code=400, detail="Invalid series ID format")
            
            # Find any media match for this series to get the associated media item
            match_row = db.query(MediaMatch).filter(
                (MediaMatch.series_tmdb_id == series_tmdb_id) | (MediaMatch.tmdb_id == series_tmdb_id),
                MediaMatch.is_active == True
            ).first()
            
            if not match_row:
                return get_full_item_metadata(f"tmdb_{series_tmdb_id}", media_type or "tv", db)
            target_item_id = match_row.media_item_id
        else:
            try:
                target_item_id = int(item_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid item ID format")

        item = db.query(MediaItem).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
        ).filter(MediaItem.id == target_item_id).first()
        
        if not item:
            numeric_item_id = None
            try:
                numeric_item_id = int(item_id)
            except (TypeError, ValueError):
                numeric_item_id = None

            normalized_media_type = str(media_type or "").lower()
            if normalized_media_type in {"tv", "series"} and numeric_item_id is not None:
                match_row = db.query(MediaMatch).filter(
                    (MediaMatch.series_tmdb_id == numeric_item_id) | (MediaMatch.tmdb_id == numeric_item_id),
                    MediaMatch.is_active == True
                ).first()
                if match_row and match_row.media_item_id:
                    item = db.query(MediaItem).options(
                        joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
                    ).filter(MediaItem.id == match_row.media_item_id).first()
                if not item:
                    return get_full_item_metadata(f"tmdb_{numeric_item_id}", "tv", db)

            raise HTTPException(status_code=404, detail="Item not found")

        tech_data = {
            "duration": item.duration,
            "size_mb": round(item.size / (1024 * 1024), 2) if item.size else 0,
            "resolution": item.resolution,
            "video_codec": item.video_codec,
            "video_bitrate": item.video_bitrate,
            "audio_codec": item.audio_codec,
            "audio_channels": item.audio_channels,
            "audio_bitrate": item.audio_bitrate,
            "bit_depth": item.bit_depth,
            "hdr_type": item.hdr_type,
            "framerate": item.framerate,
            "audio_streams": item.audio_streams or []
        }

        guessit_data = {}
        for attr in dir(item):
            if attr.startswith('fn_') or attr.startswith('fd_') or attr.startswith('it_') or attr.startswith('nfo_') or attr.startswith('internal_'):
                guessit_data[attr] = getattr(item, attr)

        matches_data = []
        for match in item.matches:
            api_responses = {}
            series_api_responses = {}
            # Retrieve caches for both match.tmdb_id and match.series_tmdb_id
            cache_ids = [match.tmdb_id]
            if match.series_tmdb_id:
                cache_ids.append(match.series_tmdb_id)
            
            tmdb_caches = db.query(TMDBCache).filter(TMDBCache.tmdb_id.in_(cache_ids)).all()
            for cache in tmdb_caches:
                if match.series_tmdb_id and cache.tmdb_id == match.series_tmdb_id:
                    series_api_responses[cache.locale] = cache.raw_data
                if cache.tmdb_id == match.tmdb_id:
                    api_responses[cache.locale] = cache.raw_data
                elif not match.series_tmdb_id:
                    api_responses[cache.locale] = cache.raw_data

            localizations = []
            for loc in match.localizations:
                effective_loc_poster_path = (
                    getattr(loc, "manual_series_poster_path", None)
                    if match.item_type and match.item_type.value in {"series", "episode"}
                    else None
                ) or getattr(loc, "manual_poster_path", None) or (
                    loc.series_poster_path if match.item_type and match.item_type.value in {"series", "episode"} else loc.poster_path
                ) or loc.poster_path
                effective_loc_local_poster_path = (
                    getattr(loc, "manual_local_series_poster_path", None)
                    if match.item_type and match.item_type.value in {"series", "episode"}
                    else None
                ) or getattr(loc, "manual_local_poster_path", None) or (
                    loc.local_series_poster_path if match.item_type and match.item_type.value in {"series", "episode"} else loc.local_poster_path
                ) or loc.local_poster_path
                localizations.append({
                    "language": loc.locale,
                    "title": loc.title,
                    "original_title": loc.original_title,
                    "series_title": loc.series_title,
                    "original_series_title": loc.original_series_title,
                    "season_title": loc.season_title,
                    "episode_title": loc.episode_title,
                    "tagline": loc.tagline,
                    "overview": loc.overview,
                    "genres": loc.genres,
                    "origin_country": loc.origin_country,
                    "original_language": loc.original_language,
                    "spoken_languages": loc.spoken_languages,
                    "poster_path": _resolve_poster_path(effective_loc_poster_path, effective_loc_local_poster_path),
                    "local_poster_path": _resolve_poster_path(effective_loc_poster_path, effective_loc_local_poster_path),
                    "logo_path": _resolve_logo_path(
                        getattr(loc, "manual_logo_path", None) or loc.logo_path,
                        getattr(loc, "manual_local_logo_path", None) or loc.local_logo_path,
                    ),
                    "local_logo_path": _resolve_logo_path(
                        getattr(loc, "manual_logo_path", None) or loc.logo_path,
                        getattr(loc, "manual_local_logo_path", None) or loc.local_logo_path,
                    ),
                    "is_primary": loc.is_primary
                })
 
            match_info = {
                "id": match.id,
                "tmdb_id": match.tmdb_id,
                "type": match.item_type.value if match.item_type else "unknown",
                "is_active": match.is_active,
                "localizations": localizations,
                "api_responses": api_responses,
                "series_api_responses": series_api_responses,
                "confidence": match.confidence_score,
                "backdrop_path": _resolve_backdrop_path(
                    getattr(match, "manual_backdrop_path", None) or match.backdrop_path,
                    getattr(match, "manual_local_backdrop_path", None) or match.local_backdrop_path,
                ),
                "local_backdrop_path": _resolve_backdrop_path(
                    getattr(match, "manual_backdrop_path", None) or match.backdrop_path,
                    getattr(match, "manual_local_backdrop_path", None) or match.local_backdrop_path,
                ),
                "still_path": _resolve_still_path(match.still_path, match.local_still_path),
                "local_still_path": _resolve_still_path(match.still_path, match.local_still_path),
                "director": match.director,
                "cast": match.cast,
                "collection": match.collection,
                "networks": [
                    {
                        "name": net.get("name") if isinstance(net, dict) else str(net),
                        "logo_path": _resolve_logo_path(net.get("logo_path"), net.get("local_logo_path")) if isinstance(net, dict) else None
                    } for net in (match.networks or [])
                ],
                "companies": [
                    {
                        "name": comp.get("name") if isinstance(comp, dict) else str(comp),
                        "logo_path": _resolve_logo_path(comp.get("logo_path"), comp.get("local_logo_path")) if isinstance(comp, dict) else None
                    } for comp in (match.companies or [])
                ],
                "series_type": match.series_type,
                "number_of_seasons": match.number_of_seasons,
                "number_of_episodes": match.number_of_episodes,
                "fetched_languages": match.fetched_languages,
                "release_date": match.release_date.isoformat() if match.release_date else None,
                "first_air_date": match.first_air_date.isoformat() if match.first_air_date else None,
                "last_air_date": match.last_air_date.isoformat() if match.last_air_date else None,
                "episode_air_date": match.episode_air_date.isoformat() if match.episode_air_date else None,
                "season_air_date": match.season_air_date.isoformat() if match.season_air_date else None,
                "runtime": match.runtime,
                "popularity": match.popularity,
                "release_status": match.release_status,
                "rating_tmdb": match.rating_tmdb,
                "vote_count_tmdb": match.vote_count_tmdb,
                "imdb_id": match.imdb_id,
                "rating_imdb": match.rating_imdb,
                "vote_count_imdb": match.vote_count_imdb,
                "rating_meta": match.rating_meta,
                "rating_rotten": match.rating_rotten,
                "budget": match.budget,
                "revenue": match.revenue,
                "series_tmdb_id": match.series_tmdb_id,
                "season_tmdb_id": match.season_tmdb_id,
                "season_number": match.season_number,
                "episode_number": match.episode_number,
                "episode_count": match.episode_count,
                "image_status": match.image_status.value if match.image_status else None,
                "backdrop_status": match.backdrop_status.value if match.backdrop_status else None,
            }
            matches_data.append(match_info)

        result = {
            "id": item.id,
            "filename": item.filename,
            "folder": item.folder_name,
            "technical": tech_data,
            "guessit": guessit_data,
            "overrides": {
                "target_language": item.locale,
                "source": item.source.value if item.source else None,
                "edition": item.edition.value if item.edition else None,
                "audio_type": item.audio_type.value if item.audio_type else None,
                "user_rating": item.user_rating
            },
            "matches": matches_data
        }
        
        return JSONResponse(content=result, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting full metadata: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(content={"error": str(e)}, status_code=500)
