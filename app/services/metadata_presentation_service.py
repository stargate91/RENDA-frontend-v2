import logging
import traceback
from sqlalchemy.orm import Session, joinedload
from fastapi.responses import JSONResponse
from app.db.models import MediaItem, TMDBCache, MediaMatch
from app.utils.library_utils import _public_image_path, _tmdb_image_url

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

def _resolve_logo_path(path: str | None, local_path: str | None) -> str | None:
    return _resolve_image_path(path, local_path, "logos", "original")

class MetadataPresentationService:
    """
    Handles the formatting and presentation of full metadata for the UI (e.g. Inspector Panel).
    """
    @staticmethod
    def get_full_metadata(db: Session, item_id: int):
        try:
            item = db.query(MediaItem).options(
                joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
            ).filter(MediaItem.id == item_id).first()
            
            if not item:
                return JSONResponse(status_code=404, content={"error": "Item not found"})
                
            tech = {
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
            
            guessit = {
                "nfo_imdb_id": item.nfo_imdb_id,
                "internal_title": item.internal_title,
                "fn_title": item.fn_title,
                "fn_year": item.fn_year,
                "fn_season": item.fn_season,
                "fn_episode": item.fn_episode,
                "fn_item_type": item.fn_item_type,
                "fn_part": item.fn_part,
                "fd_title": item.fd_title,
                "fd_year": item.fd_year,
                "fd_season": item.fd_season,
                "fd_episode": item.fd_episode,
                "it_title": item.it_title,
                "it_year": item.it_year,
                "it_season": item.it_season,
                "it_episode": item.it_episode,
            }

            overrides = {
                "override_title": item.override_title,
                "override_year": item.override_year,
                "override_season": item.override_season,
                "override_episode": item.override_episode,
                "override_tmdb_id": item.override_tmdb_id,
                "override_imdb_id": item.override_imdb_id,
                "override_type": item.override_type
            }

            matches_data = []
            for match in item.matches:
                localizations = []
                for loc in match.localizations:
                    localizations.append({
                        "language": loc.target_language,
                        "title": loc.title,
                        "overview": loc.overview,
                        "poster_path": _resolve_poster_path(loc.poster_path, loc.local_poster_path),
                        "logo_path": _resolve_logo_path(loc.logo_path, loc.local_logo_path),
                        "series_title": loc.series_title,
                        "season_title": loc.season_title,
                        "episode_title": loc.episode_title
                    })

                api_responses = {}
                try:
                    cache_entries = db.query(TMDBCache).filter(
                        TMDBCache.tmdb_id == str(match.tmdb_id)
                    ).all()
                    for entry in cache_entries:
                        lang = entry.language
                        api_responses[lang] = entry.data
                except Exception as e:
                    logger.warning(f"Failed to load cache entries: {e}")

                matches_data.append({
                    "id": match.id,
                    "tmdb_id": match.tmdb_id,
                    "imdb_id": match.imdb_id,
                    "item_type": match.item_type.value if match.item_type else None,
                    "season_number": match.season_number,
                    "episode_number": match.episode_number,
                    "confidence_score": match.confidence_score,
                    "is_active": match.is_active,
                    "rating_tmdb": match.rating_tmdb,
                    "vote_count_tmdb": match.vote_count_tmdb,
                    "rating_imdb": match.rating_imdb,
                    "vote_count_imdb": match.vote_count_imdb,
                    "rating_rotten": match.rating_rotten,
                    "rating_meta": match.rating_meta,
                    "director": match.director,
                    "cast": match.cast,
                    "collection": match.collection,
                    "backdrop_path": _resolve_backdrop_path(match.backdrop_path, match.local_backdrop_path),
                    "still_path": _resolve_image_path(match.still_path, match.local_still_path, "stills", "w400"),
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
                    "image_status": match.image_status.value if match.image_status else None,
                    "backdrop_status": match.backdrop_status.value if match.backdrop_status else None,
                    "localizations": localizations,
                    "api_responses": api_responses
                })
                
            result = {
                "id": item.id,
                "filename": item.filename,
                "folder": item.folder_name,
                "technical": tech,
                "guessit": guessit,
                "overrides": overrides,
                "matches": matches_data
            }
            
            return JSONResponse(content=result, media_type="application/json; charset=utf-8")
        except Exception as e:
            logger.error(f"Error getting full metadata: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)
