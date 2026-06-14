from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from app.db.base import get_db
from app.db.models import MediaItem, TMDBCache, MediaMatch
from app.utils.library_utils import _public_image_path, _tmdb_image_url

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
    return _resolve_image_path(path, local_path, "posters", "w500")

def _resolve_backdrop_path(path: str | None, local_path: str | None) -> str | None:
    return _resolve_image_path(path, local_path, "backdrops", "w1280")

def _resolve_still_path(path: str | None, local_path: str | None) -> str | None:
    return _resolve_image_path(path, local_path, "stills", "w400")

def _resolve_logo_path(path: str | None, local_path: str | None) -> str | None:
    return _resolve_image_path(path, local_path, "logos", "original")

router = APIRouter()

@router.get("/item/{item_id}/full-metadata")
def get_full_item_metadata(item_id: int, db: Session = Depends(get_db)):
    """Get all metadata details for a specific item"""
    try:
        item = db.query(MediaItem).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
        ).filter(MediaItem.id == item_id).first()
        
        if not item:
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
            tmdb_caches = db.query(TMDBCache).filter(TMDBCache.tmdb_id == match.tmdb_id).all()
            for cache in tmdb_caches:
                api_responses[cache.target_language] = cache.raw_data

            localizations = []
            for loc in match.localizations:
                localizations.append({
                    "language": loc.target_language,
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
                    "poster_path": _resolve_poster_path(loc.poster_path, loc.local_poster_path),
                    "local_poster_path": _resolve_poster_path(loc.poster_path, loc.local_poster_path),
                    "logo_path": _resolve_logo_path(loc.logo_path, loc.local_logo_path),
                    "local_logo_path": _resolve_logo_path(loc.logo_path, loc.local_logo_path),
                    "backdrop_path": _resolve_backdrop_path(loc.backdrop_path, loc.local_backdrop_path),
                    "local_backdrop_path": _resolve_backdrop_path(loc.backdrop_path, loc.local_backdrop_path),
                    "still_path": _resolve_still_path(loc.still_path, loc.local_still_path),
                    "local_still_path": _resolve_still_path(loc.still_path, loc.local_still_path),
                    "is_primary": loc.is_primary
                })

            match_info = {
                "id": match.id,
                "tmdb_id": match.tmdb_id,
                "type": match.item_type.value if match.item_type else "unknown",
                "is_active": match.is_active,
                "localizations": localizations,
                "api_responses": api_responses,
                "confidence": match.confidence_score,
                "director": match.director,
                "cast": match.cast,
                "collection": match.collection,
                "networks": [
                    {
                        "name": net.get("name"),
                        "logo_path": _resolve_logo_path(net.get("logo_path"), net.get("local_logo_path"))
                    } for net in (match.networks or [])
                ],
                "companies": [
                    {
                        "name": comp.get("name"),
                        "logo_path": _resolve_logo_path(comp.get("logo_path"), comp.get("local_logo_path"))
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
                "target_language": item.target_language,
                "source": item.source.value if item.source else None,
                "edition": item.edition.value if item.edition else None,
                "audio_type": item.audio_type.value if item.audio_type else None
            },
            "matches": matches_data
        }
        
        return JSONResponse(content=result, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting full metadata: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(content={"error": str(e)}, status_code=500)
