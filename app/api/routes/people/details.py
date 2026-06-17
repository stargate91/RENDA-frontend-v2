from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy.orm import joinedload
from typing import Optional
import logging
import threading

from app.db.base import Session
from app.db.models import (
    Person,
    MediaPersonLink,
    MediaMatch,
    MediaItem,
    ItemStatus,
    ItemType,
    ImageStatus,
)

from app.utils.people_utils import (
    _get_or_create_person_db,
    _pick_person_localization,
    _preferred_metadata_language,
    _public_image_path,
    _resolve_person_profile_path,
    _pick_match_localization,
    _download_person_detail_assets,
)

from app.utils.library_utils import (
    _pick_backdrop_path,
    _pick_tmdb_cache,
)
from app.utils.library_utils.image_constants import PERSON_SIZE

logger = logging.getLogger(__name__)
router = APIRouter()

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


def _resolve_person_known_for_backdrop(
    db,
    tmdb_client,
    credits: list[dict],
    preferred_languages: list[str],
    adult_only: bool = False,
) -> Optional[str]:
    candidates: list[tuple[int, str]] = []
    seen_media: set[tuple[str, int]] = set()
    max_scan = 48 if adult_only else 3

    for credit in credits or []:
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
        cached = _pick_tmdb_cache(db, parsed_credit_id, cache_media_type, preferred_languages)
        raw_data = cached.raw_data if cached and isinstance(cached.raw_data, dict) else None

        if raw_data is None:
            raw_data = tmdb_client.get_details(parsed_credit_id, "movie" if media_type == "movie" else "series", language=preferred_languages[0])

        if adult_only and not bool((raw_data or {}).get("adult")):
            continue

        backdrop_path = _pick_backdrop_path(raw_data, preferred_languages[0]) if raw_data else None
        if backdrop_path:
            candidates.append((_backdrop_resolution_from_raw(raw_data, backdrop_path), backdrop_path))
            continue

        fallback_backdrop = credit.get("backdrop_path")
        if fallback_backdrop:
            candidates.append((0, fallback_backdrop))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


@router.get("/people/{person_id:int}")
def get_person_detail(person_id: int):
    """Returns comprehensive detail data for a single person, including their biography and associated library items."""
    db = Session()
    try:
        lead_cast_order_threshold = 3
        
        person = db.query(Person).options(
            joinedload(Person.localizations)
        ).filter(Person.id == person_id).first()
        
        if not person:
            person = _get_or_create_person_db(db, person_id)
            if person:
                # Re-query with localizations loaded
                person = db.query(Person).options(
                    joinedload(Person.localizations)
                ).filter(Person.id == person_id).first()
                
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})
            
        ui_lang = _preferred_metadata_language(db)

        # Ensure we have rich metadata for the person (language support)
        target_lang = ui_lang or "en"
        fetched_langs = (person.fetched_languages or "").split(",")
        if target_lang.split("-")[0] not in fetched_langs or not person.images:
            try:
                from app.services.person_service import PersonService
                person_service = PersonService(db)
                enriched_person = person_service.enrich_person_metadata(person_id, [target_lang, "en"])
                if enriched_person:
                    person = enriched_person
            except Exception as e:
                logger.error(f"Failed to dynamically enrich person {person_id}: {e}")

        loc = _pick_person_localization(person, ui_lang)
                
        # Query associated library items
        links = db.query(MediaPersonLink).join(MediaPersonLink.media_match).join(MediaMatch.media_item).filter(
            MediaPersonLink.person_id == person_id,
            MediaMatch.is_active == True,
            MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
        ).options(
            joinedload(MediaPersonLink.media_match).joinedload(MediaMatch.media_item),
            joinedload(MediaPersonLink.media_match).joinedload(MediaMatch.localizations)
        ).all()
        
        movies = []
        series_map = {}
        person_backdrop = None
        
        for link in links:
            item = link.media_match.media_item
            match = link.media_match
            
            # Get best item localization
            item_loc = _pick_match_localization(match.localizations, ui_lang)
                    
            title = item_loc.title if item_loc else item.fn_title or item.filename
            poster_path = item_loc.poster_path if item_loc else None
            
            if item.item_type == ItemType.MOVIE:
                movies.append({
                    "id": item.id,
                    "title": title,
                    "type": item.item_type.value,
                    "year": match.release_date.year if match.release_date else None,
                    "poster_path": poster_path,
                    "rating": match.rating_tmdb or 0.0,
                    "rating_imdb": match.rating_imdb,
                    "job": link.job,
                    "character": link.character_name,
                    "is_lead": False
                })
            else:  # Episode or Series
                series_title = (item_loc.series_title if item_loc else None) or title
                sid = match.series_tmdb_id or match.tmdb_id or series_title
                if sid not in series_map:
                    series_map[sid] = {
                        "id": f"series_{sid}",
                        "series_tmdb_id": match.series_tmdb_id or match.tmdb_id,
                        "title": series_title,
                        "type": "series",
                        "year": match.first_air_date.year if match.first_air_date else (match.release_date.year if match.release_date else None),
                        "poster_path": item_loc.series_poster_path if item_loc and item_loc.series_poster_path else poster_path,
                        "rating": match.rating_tmdb or 0.0,
                        "rating_imdb": match.rating_imdb,
                        "job": link.job,
                        "character": link.character_name,
                        "is_lead": False,
                        "episode_count": 0
                    }
                series_map[sid]["episode_count"] += 1
                
        # Mark local items with in_library = True
        for m in movies:
            m["in_library"] = True
            m["library_item_id"] = m["id"]
        for s in series_map.values():
            s["in_library"] = True
            s["library_series_tmdb_id"] = s["series_tmdb_id"]

        # Now, try to query TMDB combined_credits
        all_movies = movies
        all_series = list(series_map.values())
        known_for = []
        
        try:
            from app.api.tmdb_client import TMDBClient
            tmdb_client = TMDBClient(db)
            tmdb_data = tmdb_client.get_person_details(person_id, language=target_lang)
            credits_data = tmdb_data.get("combined_credits", {})
            cast_list = credits_data.get("cast", [])
            crew_list = credits_data.get("crew", [])
            person_backdrop = _resolve_person_known_for_backdrop(
                db,
                tmdb_client,
                cast_list + crew_list,
                [target_lang, "en"],
                adult_only=bool(getattr(person, "is_adult", False)),
            )
            
            if cast_list or crew_list:
                # Cache local maps
                # Let's map active movie TMDB IDs in library
                local_movies = db.query(MediaMatch.tmdb_id, MediaItem.id, MediaMatch.rating_imdb).join(MediaMatch.media_item).filter(
                    MediaMatch.is_active == True,
                    MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                    MediaItem.item_type == ItemType.MOVIE
                ).all()
                local_movies_map = {}
                for m in local_movies:
                    if not m.tmdb_id:
                        continue
                    existing = local_movies_map.get(m.tmdb_id)
                    if not existing or (m.rating_imdb or 0) > (existing.get("rating_imdb") or 0):
                        local_movies_map[m.tmdb_id] = {
                            "library_item_id": m.id,
                            "rating_imdb": m.rating_imdb,
                        }

                # Let's map active series TMDB IDs in library
                local_series = db.query(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id, MediaMatch.rating_imdb).join(MediaMatch.media_item).filter(
                    MediaMatch.is_active == True,
                    MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                    MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE])
                ).all()
                local_series_map = {}
                for s in local_series:
                    if s.series_tmdb_id:
                        existing = local_series_map.get(s.series_tmdb_id)
                        if not existing or (s.rating_imdb or 0) > (existing.get("rating_imdb") or 0):
                            local_series_map[s.series_tmdb_id] = {"rating_imdb": s.rating_imdb}
                    if s.tmdb_id:
                        existing = local_series_map.get(s.tmdb_id)
                        if not existing or (s.rating_imdb or 0) > (existing.get("rating_imdb") or 0):
                            local_series_map[s.tmdb_id] = {"rating_imdb": s.rating_imdb}

                combined_credits = {}
                for credit in cast_list + crew_list:
                    cid = credit.get("id")
                    media_type = credit.get("media_type")
                    if not cid or not media_type:
                        continue
                        
                    key = (cid, media_type)
                    
                    role = ""
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
                                year = int(date_str.split("-")[0])
                            except:
                                pass
                        
                        title = credit.get("title") if media_type == "movie" else credit.get("name")
                        
                        in_library = False
                        library_item_id = None
                        library_series_tmdb_id = None
                        
                        if media_type == "movie":
                            if cid in local_movies_map:
                                in_library = True
                                library_item_id = local_movies_map[cid]["library_item_id"]
                        elif media_type == "tv":
                            if cid in local_series_map:
                                in_library = True
                                library_series_tmdb_id = cid
                                
                        combined_credits[key] = {
                            "id": cid,
                            "title": title or "Unknown",
                            "type": "movie" if media_type == "movie" else "series",
                            "year": year,
                            "poster_path": credit.get("poster_path"),
                            "rating": credit.get("vote_average") or 0.0,
                            "rating_imdb": local_movies_map.get(cid, {}).get("rating_imdb") if media_type == "movie" else local_series_map.get(cid, {}).get("rating_imdb"),
                            "roles": [role],
                            "is_lead": is_lead,
                            "in_library": in_library,
                            "library_item_id": library_item_id,
                            "library_series_tmdb_id": library_series_tmdb_id
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

                preferred_known_for = [credit for credit in ordered_credits if credit.get("poster_path")]
                fallback_known_for = [credit for credit in ordered_credits if not credit.get("poster_path")]
                known_for = (preferred_known_for + fallback_known_for)[:3]
                        
                all_movies = parsed_movies
                all_series = parsed_series
        except Exception as ex:
            logger.error(f"Failed to load or parse TMDB credits for person {person_id}: {ex}")
        if not person_backdrop:
            for link in links:
                if link.media_match and link.media_match.backdrop_path:
                    person_backdrop = link.media_match.backdrop_path
                    break
        # Sort films and series by year descending
        all_movies.sort(key=lambda x: x.get("year") or 0, reverse=True)
        all_series.sort(key=lambda x: x.get("year") or 0, reverse=True)

        profile_path = person.profile_path
        person_images = list(person.images or [])
        threading.Thread(
            target=_download_person_detail_assets,
            args=(profile_path, person_images, all_movies, all_series, person_backdrop),
            daemon=True
        ).start()

        if person.profile_path and not _resolve_person_profile_path(person):
            person.image_status = ImageStatus.FAILED
        elif person.profile_path:
            person.local_profile_path = _resolve_person_profile_path(person)
            person.image_status = ImageStatus.COMPLETED

        local_images = []
        for image_path in person.images or []:
            local_image = _public_image_path(image_path, "persons")
            if local_image:
                local_images.append(local_image)
            elif image_path:
                local_images.append(f"https://image.tmdb.org/t/p/{PERSON_SIZE}{image_path}")

        for item in all_movies:
            orig_poster = item.get("poster_path")
            local_poster = _public_image_path(orig_poster, "posters")
            item["poster_path"] = local_poster if local_poster else orig_poster
            item["has_local_poster"] = bool(local_poster)
        for item in all_series:
            orig_poster = item.get("poster_path")
            local_poster = _public_image_path(orig_poster, "posters")
            item["poster_path"] = local_poster if local_poster else orig_poster
            item["has_local_poster"] = bool(local_poster)
        for item in known_for:
            orig_poster = item.get("poster_path")
            local_poster = _public_image_path(orig_poster, "posters")
            item["poster_path"] = local_poster if local_poster else orig_poster
            item["has_local_poster"] = bool(local_poster)

        db.commit()
        
        result = {
            "id": person.id,
            "name": loc.name if loc else "Unknown",
            "biography": loc.biography if loc else None,
            "birthday": person.birthday,
            "deathday": person.deathday,
            "place_of_birth": person.place_of_birth,
            "gender": person.gender,
            "popularity": person.popularity or 0.0,
            "known_for_department": person.known_for_department,
            "is_adult": bool(getattr(person, "is_adult", False)),
            "profile_path": _resolve_person_profile_path(person),
            "has_local_profile": bool(_public_image_path(person.profile_path, "persons")),
            "backdrop_path": _public_image_path(person_backdrop, "backdrops") or person_backdrop,
            "has_local_backdrop": bool(_public_image_path(person_backdrop, "backdrops")),
            "is_active": person.is_active,
            "is_favorite": person.is_favorite,
            "user_rating": person.user_rating,
            "custom_tags": person.custom_tags or [],
            "images": local_images,
            "known_for": known_for,
            "movies": all_movies,
            "series": all_series
        }
        
        return JSONResponse(content=result, media_type="application/json; charset=utf-8")
    except Exception as e:
        import traceback
        logger.error(f"Error getting person detail: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()
