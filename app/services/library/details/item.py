import os
from app.services.library.details.base import BaseDetailProvider
from fastapi.responses import JSONResponse
import logging
from sqlalchemy.orm import joinedload
from app.utils.library_utils import (
    _download_media_assets_sync,
    _preferred_metadata_language,
    _parse_omdb_float,
    _parse_omdb_int,
    _ensure_person_cached,
    _get_virtual_media_state,
    _is_virtual_media_tracked,
    _match_language_code,
    _pick_backdrop_path,
    _pick_logo_path,
    _pick_trailer_key,
    _pick_tmdb_cache,
    _preferred_metadata_languages,
    _public_image_path,
    _tmdb_image_url,
    _tmdb_size_for_subfolder,
    _resolve_person_profile_path,
    _serialize_playback_logs,
    _split_genres,
)
from app.db.models import *

logger = logging.getLogger(__name__)

class ItemDetailProvider(BaseDetailProvider):
    def get_library_item_detail(self, item_id: str):
        """Returns comprehensive detail data for a single library item (movie detail page)."""
        db = self.db
        try:
            from app.db.models import MediaItem, MediaMatch, UserSetting, Person, MediaPersonLink, PersonLocalization, TMDBCache

            # Check if item_id is virtual (starts with tmdb_)
            if isinstance(item_id, str) and item_id.startswith("tmdb_"):
                try:
                    tmdb_id = int(item_id.split("_")[1])
                except (ValueError, IndexError):
                    return JSONResponse(status_code=400, content={"error": "Invalid TMDB ID format"})
                
                from app.api.tmdb_client import TMDBClient
                from app.api.omdb_client import OMDBClient
                tmdb_client = TMDBClient(db)
                omdb_client = OMDBClient(db)
            
                ui_lang = _preferred_metadata_language(db)
            
                tmdb_data = tmdb_client.get_details(tmdb_id, "movie", language=ui_lang)
                if not tmdb_data:
                    return JSONResponse(status_code=404, content={"error": "Movie not found on TMDB"})
                
                credits = tmdb_data.get("credits", {})
            
                # Gather assets to download synchronously
                poster_path = tmdb_data.get("poster_path")
                backdrop_path = _pick_backdrop_path(tmdb_data, ui_lang)
                logo_path = _pick_logo_path(tmdb_data, ui_lang)
            
                cast_profiles = []
                raw_directors = [c for c in credits.get("crew", []) if c.get("job") in ("Director", "Creator")][:2]
                for crew in raw_directors:
                    if crew.get("profile_path"):
                        cast_profiles.append(crew.get("profile_path"))

                raw_writers = [c for c in credits.get("crew", []) if c.get("job") in ("Writer", "Screenplay", "Story", "Teleplay")][:2]
                for crew in raw_writers:
                    if crew.get("profile_path"):
                        cast_profiles.append(crew.get("profile_path"))
                    
                director_ids = {d["id"] for d in raw_directors}
                writer_ids = {w["id"] for w in raw_writers}
                exclude_ids = director_ids | writer_ids
                raw_cast = [a for a in credits.get("cast", []) if a.get("id") not in exclude_ids][:10]
                for actor in raw_cast:
                    if actor.get("profile_path"):
                        cast_profiles.append(actor.get("profile_path"))
                    
                # Synchronously download posters, backdrops, and cast profile images in parallel!
                _download_media_assets_sync(
                    poster_path=poster_path,
                    backdrop_path=backdrop_path,
                    logo_path=logo_path,
                    cast_profiles=cast_profiles
                )

                cast = []
                directors = []
                writers = []
                for crew in raw_directors:
                    profile_path = _ensure_person_cached(
                        db,
                        crew.get("id"),
                        crew.get("name"),
                        crew.get("profile_path"),
                        crew.get("popularity", 0),
                        ui_lang
                    )
                    directors.append({
                        "id": crew.get("id"),
                        "name": crew.get("name"),
                        "job": crew.get("job"),
                        "profile_path": profile_path,
                        "popularity": crew.get("popularity", 0),
                        "gender": crew.get("gender")
                    })

                for crew in raw_writers:
                    profile_path = _ensure_person_cached(
                        db,
                        crew.get("id"),
                        crew.get("name"),
                        crew.get("profile_path"),
                        crew.get("popularity", 0),
                        ui_lang
                    )
                    writers.append({
                        "id": crew.get("id"),
                        "name": crew.get("name"),
                        "job": crew.get("job"),
                        "profile_path": profile_path,
                        "popularity": crew.get("popularity", 0),
                        "gender": crew.get("gender")
                    })
             
                director_ids = {d["id"] for d in directors}
                writer_ids = {w["id"] for w in writers}
                exclude_ids = director_ids | writer_ids
                raw_cast = [a for a in credits.get("cast", []) if a.get("id") not in exclude_ids][:10]
                for actor in raw_cast:
                    profile_path = _ensure_person_cached(
                        db,
                        actor.get("id"),
                        actor.get("name"),
                        actor.get("profile_path"),
                        actor.get("popularity", 0),
                        ui_lang
                    )
                    cast.append({
                        "id": actor.get("id"),
                        "name": actor.get("name"),
                        "character": actor.get("character"),
                        "job": "Actor",
                        "profile_path": profile_path,
                        "popularity": actor.get("popularity", 0),
                        "gender": actor.get("gender")
                    })

                trailer_key = _pick_trailer_key(tmdb_data, ui_lang, tmdb_data.get("original_language"))

                release_date = tmdb_data.get("release_date")
                year = None
                if release_date:
                    try:
                        year = int(release_date.split("-")[0])
                    except:
                        pass
                virtual_state = _get_virtual_media_state(db, tmdb_id, "movie")
                is_tracked = _is_virtual_media_tracked(db, tmdb_id, "movie")
                imdb_id = tmdb_data.get("external_ids", {}).get("imdb_id")
                omdb_data = omdb_client.get_ratings(imdb_id, queue_on_limit=True) if imdb_id else {}

                result = {
                    "id": f"tmdb_{tmdb_id}",
                    "title": tmdb_data.get("title") or tmdb_data.get("original_title") or "Unknown",
                    "logo_path": self.formatter.resolve_logo_response_path(logo_path=logo_path),
                    "original_title": tmdb_data.get("original_title"),
                    "tagline": tmdb_data.get("tagline"),
                    "overview": tmdb_data.get("overview"),
                    "genres": _split_genres([g["name"] for g in tmdb_data.get("genres", [])]),
                    "year": year,
                    "release_date": release_date,
                    "runtime": tmdb_data.get("runtime"),
                    "rating_tmdb": tmdb_data.get("vote_average"),
                    "vote_count_tmdb": tmdb_data.get("vote_count"),
                    "budget": tmdb_data.get("budget"),
                    "revenue": tmdb_data.get("revenue"),
                    "companies": [{"name": c.get("name"), "logo_path": c.get("logo_path")} for c in tmdb_data.get("production_companies", [])] if tmdb_data.get("production_companies") else [],
                    "networks": [{"name": n.get("name"), "logo_path": n.get("logo_path")} for n in tmdb_data.get("networks", [])] if tmdb_data.get("networks") else [],
                    "collection": (tmdb_data.get("belongs_to_collection") or {}).get("name"),
                    "collection_data": {
                        "tmdb_id": (tmdb_data.get("belongs_to_collection") or {}).get("id"),
                        "title": (tmdb_data.get("belongs_to_collection") or {}).get("name"),
                        "overview": None,
                        "poster_path": (tmdb_data.get("belongs_to_collection") or {}).get("poster_path"),
                        "backdrop_path": (tmdb_data.get("belongs_to_collection") or {}).get("backdrop_path"),
                    } if tmdb_data.get("belongs_to_collection") else None,
                    "poster_path": self.formatter.resolve_image_response_path(tmdb_data.get("poster_path"), subfolder="posters"),
                    "backdrop_path": self.formatter.resolve_image_response_path(backdrop_path, subfolder="backdrops"),
                    "original_language": tmdb_data.get("original_language"),
                    "type": "movie",
                    "tmdb_id": tmdb_id,
                    "imdb_id": imdb_id,
                    "rating_imdb": _parse_omdb_float(omdb_data.get("imdb_rating")),
                    "vote_count_imdb": _parse_omdb_int(omdb_data.get("imdb_votes")),
                    "rating_rotten": omdb_data.get("rotten_tomatoes"),
                    "rating_meta": _parse_omdb_int(omdb_data.get("metascore")),
                    "cast": cast,
                    "directors": directors,
                    "writers": writers,
                    "is_adult": tmdb_data.get("adult", False),
                    "is_favorite": bool(virtual_state.is_favorite) if virtual_state else False,
                    "user_rating": virtual_state.user_rating if virtual_state else None,
                    "user_comment": virtual_state.user_comment if virtual_state else None,
                    "custom_tags": (virtual_state.custom_tags or []) if virtual_state else [],
                    "tags": [],
                    "is_tracked": is_tracked,
                    "watch_count": 1 if virtual_state and virtual_state.is_watched else 0,
                    "is_watched": bool(virtual_state.is_watched) if virtual_state else False,
                    "resume_position": 0,
                    "last_watched_at": None,
                    "playback_logs": [],
                    "trailer_key": trailer_key,
                    "in_library": False,
                }
                return JSONResponse(content=result, media_type="application/json; charset=utf-8")

            # Original logic for local item
            try:
                item_id_int = int(item_id)
            except ValueError:
                return JSONResponse(status_code=400, content={"error": "Invalid item ID"})

            item = db.query(MediaItem).options(
                joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
                joinedload(MediaItem.matches).joinedload(MediaMatch.collection_entity).joinedload(MediaCollection.localizations),
                joinedload(MediaItem.matches).joinedload(MediaMatch.people).joinedload(MediaPersonLink.person).joinedload(Person.localizations),
                joinedload(MediaItem.extras),
            ).filter(MediaItem.id == item_id_int).first()
        
            if not item:
                return JSONResponse(status_code=404, content={"error": "Item not found"})

            # Determine UI language
            ui_lang = _preferred_metadata_language(db)

            active_match = next((m for m in item.matches if m.is_active), None)
            if not active_match:
                return JSONResponse(status_code=404, content={"error": "No active match found"})

            from app.services.language_service import LanguageService
            loc = LanguageService.pick_localization(active_match.localizations, [ui_lang] if ui_lang else [])

            if loc:
                # Synchronously download missing media assets for local/missing movie
                missing_poster = None
                missing_backdrop = None
                missing_logo = None
            
                if loc.poster_path and not _public_image_path(loc.local_poster_path, "posters"):
                    local_p = os.path.join("data", "media", "images", "posters", loc.poster_path.lstrip("/"))
                    if not os.path.exists(local_p):
                        missing_poster = loc.poster_path
                    
                if active_match.backdrop_path and not _public_image_path(active_match.local_backdrop_path, "backdrops"):
                    local_b = os.path.join("data", "media", "images", "backdrops", active_match.backdrop_path.lstrip("/"))
                    if not os.path.exists(local_b):
                        missing_backdrop = active_match.backdrop_path
                if loc.logo_path and not _public_image_path(loc.local_logo_path, "logos"):
                    local_logo = os.path.join("data", "media", "images", "logos", loc.logo_path.lstrip("/"))
                    if not os.path.exists(local_logo):
                        missing_logo = loc.logo_path
                    
                missing_profiles = []
                for link in active_match.people:
                    person = link.person
                    if person.profile_path and not _public_image_path(person.local_profile_path, "persons"):
                        local_p = os.path.join("data", "media", "images", "persons", person.profile_path.lstrip("/"))
                        if not os.path.exists(local_p):
                            missing_profiles.append(person.profile_path)
                        
                if missing_poster or missing_backdrop or missing_logo or missing_profiles:
                    _download_media_assets_sync(
                        poster_path=missing_poster,
                        backdrop_path=missing_backdrop,
                        logo_path=missing_logo,
                        cast_profiles=missing_profiles
                    )
                
                    # Update DB paths immediately!
                    try:
                        updated = False
                        if missing_poster:
                            local_p_rel = f"data/media/images/posters/{missing_poster.lstrip('/')}"
                            if os.path.exists(local_p_rel):
                                loc.local_poster_path = local_p_rel
                                updated = True
                        if missing_backdrop:
                            local_b_rel = f"data/media/images/backdrops/{missing_backdrop.lstrip('/')}"
                            if os.path.exists(local_b_rel):
                                active_match.local_backdrop_path = local_b_rel
                                updated = True
                        if missing_logo:
                            local_logo_rel = f"data/media/images/logos/{missing_logo.lstrip('/')}"
                            if os.path.exists(local_logo_rel):
                                loc.local_logo_path = local_logo_rel
                                updated = True
                        for link in active_match.people:
                            person = link.person
                            if person.profile_path and person.profile_path in missing_profiles:
                                local_p_rel = f"data/media/images/persons/{person.profile_path.lstrip('/')}"
                                if os.path.exists(local_p_rel):
                                    person.local_profile_path = local_p_rel
                                    person.image_status = ImageStatus.COMPLETED
                                    updated = True
                        if updated:
                            db.commit()
                    except Exception as e:
                        db.rollback()
                        logger.error(f"Error updating local image paths in DB: {e}")

            # Build cast list with person images
            cast = []
            directors = []
            writers = []
            from app.services.language_service import LanguageService
            for link in sorted(active_match.people, key=lambda x: x.order):
                person = link.person
                p_loc = None
                if person.localizations:
                    p_loc = LanguageService.pick_localization(person.localizations, [ui_lang] if ui_lang else [])

                person_data = {
                    "id": person.id,
                    "name": p_loc.name if p_loc else "Unknown",
                    "character": link.character_name,
                    "job": link.job,
                    "profile_path": _resolve_person_profile_path(person),
                    "popularity": person.popularity or 0,
                    "gender": person.gender
                }

                if link.job in ("Director", "Creator"):
                    directors.append(person_data)
                elif link.job == "Writer":
                    writers.append(person_data)
                elif link.job == "Actor":
                    cast.append(person_data)

            # Technical info
            technical = {
                "resolution": item.resolution,
                "video_codec": item.video_codec,
                "audio_codec": item.audio_codec,
                "audio_channels": item.audio_channels,
                "hdr_type": item.hdr_type,
                "bit_depth": item.bit_depth,
                "framerate": item.framerate,
                "duration": item.duration,
                "size_bytes": item.size,
                "source": item.source.value if item.source else None,
                "edition": item.edition.value if item.edition else None,
                "audio_type": item.audio_type.value if item.audio_type else None,
            }
        
            # Extract Trailer Key from Localization
            trailer_key = loc.trailer_url if loc else None
            cache_type = "tv" if item.item_type in (ItemType.SERIES, ItemType.SEASON, ItemType.EPISODE) else "movie"
            target_tmdb_id = active_match.series_tmdb_id if (item.item_type in (ItemType.SERIES, ItemType.SEASON, ItemType.EPISODE) and active_match.series_tmdb_id) else active_match.tmdb_id
            movie_cache = _pick_tmdb_cache(
                db,
                target_tmdb_id,
                cache_type,
                _preferred_metadata_languages(db),
            ) if target_tmdb_id else None

            companies_fallback = active_match.companies
            if not companies_fallback and movie_cache and movie_cache.raw_data:
                companies_fallback = [{"name": c.get("name"), "logo_path": c.get("logo_path")} for c in movie_cache.raw_data.get("production_companies", [])]
            networks_fallback = active_match.networks
            if not networks_fallback and movie_cache and movie_cache.raw_data:
                networks_fallback = [{"name": n.get("name"), "logo_path": n.get("logo_path")} for n in movie_cache.raw_data.get("networks", [])]

            preferred_logo_path = _pick_logo_path(movie_cache.raw_data if movie_cache else None, ui_lang) if movie_cache else None
            effective_logo_path = preferred_logo_path or (loc.logo_path if loc else None)
            effective_local_logo_path = (
                loc.local_logo_path
                if loc and effective_logo_path and effective_logo_path == loc.logo_path
                else None
            )
            preferred_backdrop_path = _pick_backdrop_path(movie_cache.raw_data if movie_cache else None, ui_lang) if movie_cache else None
            effective_backdrop_path = (active_match.backdrop_path if active_match and active_match.backdrop_path else None) or preferred_backdrop_path
            effective_local_backdrop_path = (
                active_match.local_backdrop_path
                if active_match and effective_backdrop_path and effective_backdrop_path == active_match.backdrop_path
                else None
            )

            result = {
                "id": item.id,
                "title": loc.title if loc else item.fn_title or item.filename,
                "logo_path": self.formatter.resolve_logo_response_path(
                    logo_path=effective_logo_path,
                    local_logo_path=effective_local_logo_path,
                ),
                "original_title": loc.original_title if loc else None,
                "tagline": loc.tagline if loc else None,
                "overview": loc.overview if loc else None,
                "genres": _split_genres(loc.genres) if loc and loc.genres else [],
                "keywords": active_match.keywords if (active_match and active_match.keywords) else [],
                "year": active_match.release_date.year if active_match.release_date else (active_match.first_air_date.year if active_match.first_air_date else None),
                "release_date": str(active_match.release_date.date()) if active_match.release_date else None,
                "runtime": active_match.runtime,
                "rating_tmdb": active_match.rating_tmdb,
                "rating_imdb": active_match.rating_imdb,
                "rating_rotten": active_match.rating_rotten,
                "rating_meta": active_match.rating_meta,
                "vote_count_tmdb": active_match.vote_count_tmdb,
                "vote_count_imdb": active_match.vote_count_imdb,
                "budget": active_match.budget,
                "revenue": active_match.revenue,
                "companies": companies_fallback,
                "networks": networks_fallback,
                "collection": active_match.collection,
                "collection_data": self.formatter.serialize_collection(active_match.collection_entity, active_match.collection, ui_lang),
                "poster_path": (_public_image_path(loc.local_poster_path, "posters") or loc.poster_path) if loc else None,
                "backdrop_path": (
                    _public_image_path(effective_local_backdrop_path, "backdrops") or effective_backdrop_path
                ) if (loc or effective_backdrop_path) else None,
                "origin_country": loc.origin_country if loc else None,
                "original_language": loc.original_language if loc else None,
                "spoken_languages": loc.spoken_languages if loc else None,
                "type": item.item_type.value,
                "path": item.current_path,
                "filename": item.filename,
                "tmdb_id": active_match.tmdb_id,
                "imdb_id": active_match.imdb_id,
                "cast": cast[:10],  # Top 10 cast members
                "directors": directors[:2],
                "writers": writers[:2],
                "technical": technical,
                "is_adult": active_match.is_adult,
                "is_favorite": item.is_favorite or False,
                "user_rating": item.user_rating,
                "user_comment": item.user_comment,
                "custom_tags": [t.name for t in item.tags] if item.tags else [],
                "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in item.tags],
                "watch_count": getattr(item, "watch_count", 0),
                "is_watched": getattr(item, "is_watched", False),
                "resume_position": getattr(item, "resume_position", 0),
                "last_watched_at": getattr(item, "last_watched_at").isoformat() if getattr(item, "last_watched_at", None) else None,
                "playback_logs": _serialize_playback_logs(item),
                "trailer_key": trailer_key,
                "extras": [self.formatter.serialize_extra_file(extra) for extra in (item.extras or [])],
            }

            return JSONResponse(content=result, media_type="application/json; charset=utf-8")
        except Exception as e:
            import traceback
            logger.error(f"Error getting library item detail: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)
