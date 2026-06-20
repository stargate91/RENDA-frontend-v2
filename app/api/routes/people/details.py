from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import joinedload
from typing import Optional
from datetime import datetime, timedelta
import logging
import math
import threading

from app.db.base import Session, CacheSession
from app.db.models import (
    Person,
    MediaPersonLink,
    MediaMatch,
    MediaItem,
    ItemStatus,
    ItemType,
    ImageStatus,
    TMDBCache,
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
    _get_omdb_ratings_from_imdb,
    _parse_omdb_float,
)
from app.utils.library_utils.image_constants import PERSON_SIZE
from app.api.tmdb_client import TMDBClient

logger = logging.getLogger(__name__)
router = APIRouter()
from app.services.person_credit_service import (
    PERSON_INITIAL_CREDITS_PAGE_SIZE,
    get_cached_person_credit_backdrops,
    set_cached_person_credit_backdrops,
    select_known_for,
    resolve_person_known_for_backdrop,
    prioritize_person_credits,
    exclude_known_for_credits,
    apply_local_poster_paths,
    paginate_items,
    build_person_asset_preload_batches,
    schedule_person_credit_poster_warmup,
    load_person_credit_payload,
    known_for_score,
)


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

        # Automatically extract and save tmdb_id from urls if not already present
        ext_ids = dict(person.external_ids or {})
        if not ext_ids.get("tmdb_id"):
            for u in ext_ids.get("urls") or []:
                url = u.get("url") if isinstance(u, dict) else u
                if isinstance(url, str) and "themoviedb.org/person/" in url:
                    import re
                    match_tmdb = re.search(r"themoviedb\.org/person/(\d+)", url)
                    if match_tmdb:
                        ext_ids["tmdb_id"] = int(match_tmdb.group(1))
                        person.external_ids = ext_ids
                        db.commit()
                        break
            
        ui_lang = _preferred_metadata_language(db)

        # Ensure we have rich metadata for the person (language support)
        target_lang = ui_lang or "en"
        fetched_langs = (person.fetched_languages or "").split(",")
        has_tmdb = bool(ext_ids.get("tmdb_id"))
        has_tmdb_images = any(img.startswith("/") for img in (person.images or []))

        if target_lang.split("-")[0] not in fetched_langs or not person.images or (has_tmdb and not has_tmdb_images):
            try:
                from app.services.person_service import PersonService
                person_service = PersonService(db)
                enriched_person = person_service.enrich_person_metadata(person_id, [target_lang, "en"])
                if enriched_person:
                    person = enriched_person
            except Exception as e:
                logger.error(f"Failed to dynamically enrich person {person_id}: {e}")

        loc = _pick_person_localization(person, ui_lang)
                
        credit_payload = load_person_credit_payload(
            db,
            person_id=person_id,
            person=person,
            ui_lang=ui_lang,
            target_lang=target_lang,
            lead_cast_order_threshold=lead_cast_order_threshold,
            scenes_page=1,
            scenes_page_size=PERSON_INITIAL_CREDITS_PAGE_SIZE,
            movies_page=1,
            movies_page_size=PERSON_INITIAL_CREDITS_PAGE_SIZE,
            series_page=1,
            series_page_size=PERSON_INITIAL_CREDITS_PAGE_SIZE,
        )
        tmdb_data = credit_payload["tmdb_data"]
        person_backdrop = credit_payload["person_backdrop"]
        known_for = apply_local_poster_paths(credit_payload["known_for"])
        all_movies = credit_payload["movies"]
        all_series = credit_payload["series"]
        all_scenes = credit_payload.get("scenes", [])
        total_scene_credits = credit_payload["total_scene_credits"]
        prioritized_movies = prioritize_person_credits(all_movies, credit_payload["known_for"])
        prioritized_series = prioritize_person_credits(all_series, credit_payload["known_for"])
        initial_movies_page = paginate_items(prioritized_movies, 1, PERSON_INITIAL_CREDITS_PAGE_SIZE)
        initial_series_page = paginate_items(prioritized_series, 1, PERSON_INITIAL_CREDITS_PAGE_SIZE)
        initial_scenes_page = {
            "items": all_scenes,
            "page": 1,
            "page_size": PERSON_INITIAL_CREDITS_PAGE_SIZE,
            "total_items": total_scene_credits,
            "total_pages": max(1, math.ceil(total_scene_credits / PERSON_INITIAL_CREDITS_PAGE_SIZE)),
        }
        initial_movies_page["items"] = apply_local_poster_paths(initial_movies_page["items"])
        initial_series_page["items"] = apply_local_poster_paths(initial_series_page["items"])
        initial_scenes_page["items"] = apply_local_poster_paths(initial_scenes_page["items"])
        preload_movies, preload_series = build_person_asset_preload_batches(
            all_movies,
            all_series,
            credit_payload["known_for"],
            first_page_size=PERSON_INITIAL_CREDITS_PAGE_SIZE,
        )

        profile_path = person.manual_profile_path or person.profile_path
        person_images = list(person.images or [])
        threading.Thread(
            target=_download_person_detail_assets,
            args=(profile_path, person_images, preload_movies, preload_series, person_backdrop),
            daemon=True
        ).start()

        effective_profile_path = person.manual_profile_path or person.profile_path
        has_local_profile = bool(
            _public_image_path(
                person.manual_local_profile_path
                or person.local_profile_path
                or person.manual_profile_path
                or person.profile_path,
                "persons",
            )
        )
        if effective_profile_path and not _resolve_person_profile_path(person):
            person.image_status = ImageStatus.FAILED
        elif effective_profile_path and has_local_profile:
            person.image_status = ImageStatus.COMPLETED

        local_images = []
        seen_images = set()
        for image_path in person.images or []:
            if not image_path:
                continue
            if image_path.startswith("http://") or image_path.startswith("https://"):
                resolved = image_path
            else:
                local_image = _public_image_path(image_path, "persons")
                if local_image:
                    resolved = local_image
                else:
                    resolved = f"https://image.tmdb.org/t/p/{PERSON_SIZE}{image_path}"
            
            if resolved not in seen_images:
                seen_images.add(resolved)
                local_images.append(resolved)

        db.commit()
        
        result = {
            "id": person.id,
            "name": loc.name if loc else "Unknown",
            "alternate_names": [
                alias for alias in (tmdb_data.get("also_known_as") or (person.external_ids or {}).get("aliases") or [])
                if isinstance(alias, str) and alias.strip() and alias.strip() != (loc.name if loc else "Unknown")
            ],
            "biography": loc.biography if loc else None,
            "birthday": person.birthday,
            "deathday": person.deathday,
            "place_of_birth": person.place_of_birth,
            "gender": person.gender,
            "popularity": person.popularity or 0.0,
            "known_for_department": person.known_for_department,
            "is_adult": bool(getattr(person, "is_adult", False)),
            "profile_path": _resolve_person_profile_path(person),
            "has_local_profile": bool(_public_image_path(person.manual_local_profile_path or person.manual_profile_path or person.local_profile_path or person.profile_path, "persons")),
            "backdrop_path": _public_image_path(person.manual_local_backdrop_path or person_backdrop, "backdrops") or person_backdrop,
            "has_local_backdrop": bool(_public_image_path(person.manual_local_backdrop_path or person_backdrop, "backdrops")),
            "is_active": person.is_active,
            "is_favorite": person.is_favorite,
            "user_rating": person.user_rating,
            "user_comment": person.user_comment,
            "custom_tags": person.custom_tags or [],
            "homepage": tmdb_data.get("homepage") or None,
            "external_ids": {
                **(person.external_ids or {}),
                **(tmdb_data.get("external_ids") or {}),
                **({"tmdb_id": tmdb_data["id"]} if tmdb_data and tmdb_data.get("id") else {})
            },
            "images": local_images,
            "known_for": known_for,
            "total_movie_credits": len(all_movies),
            "total_series_credits": len(all_series),
            "total_scene_credits": total_scene_credits,
            "initial_movie_credits_page": initial_movies_page,
            "initial_series_credits_page": initial_series_page,
            "initial_scene_credits_page": initial_scenes_page,
        }
        
        return JSONResponse(content=result, media_type="application/json; charset=utf-8")
    except Exception as e:
        import traceback
        logger.error(f"Error getting person detail: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()


@router.get("/people/{person_id:int}/movies")
def get_person_movies(
    person_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=8, ge=1, le=60),
    exclude_known_for: bool = Query(default=False),
):
    db = Session()
    try:
        person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            person = _get_or_create_person_db(db, person_id)
            if person:
                person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        ui_lang = _preferred_metadata_language(db)
        target_lang = ui_lang or "en"
        credit_payload = load_person_credit_payload(db, person_id, person, ui_lang, target_lang, movies_page=page, movies_page_size=page_size)
        base_items = credit_payload["movies"]
        if exclude_known_for:
            loc = _pick_person_localization(person, ui_lang)
            person_name = loc.name if loc else None
            base_items = exclude_known_for_credits(base_items, credit_payload["known_for"])
            prioritized = sorted(
                base_items,
                key=lambda entry: (known_for_score(entry, person.known_for_department, adult_only=bool(getattr(person, "is_adult", False)), person_name=person_name), entry.get("year") or 0),
                reverse=True,
            )
        else:
            prioritized = prioritize_person_credits(base_items, credit_payload["known_for"])
        paged = paginate_items(prioritized, page, page_size)
        schedule_person_credit_poster_warmup(person_id, "movies", paged["page"], paged["page_size"], paged["items"])
        paged["items"] = apply_local_poster_paths(paged["items"])
        return JSONResponse(content=paged, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting person movies for {person_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()


@router.get("/people/{person_id:int}/series")
def get_person_series(
    person_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=8, ge=1, le=60),
    exclude_known_for: bool = Query(default=False),
):
    db = Session()
    try:
        person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            person = _get_or_create_person_db(db, person_id)
            if person:
                person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        ui_lang = _preferred_metadata_language(db)
        target_lang = ui_lang or "en"
        credit_payload = load_person_credit_payload(db, person_id, person, ui_lang, target_lang, series_page=page, series_page_size=page_size)
        base_items = credit_payload["series"]
        if exclude_known_for:
            loc = _pick_person_localization(person, ui_lang)
            person_name = loc.name if loc else None
            base_items = exclude_known_for_credits(base_items, credit_payload["known_for"])
            prioritized = sorted(
                base_items,
                key=lambda entry: (known_for_score(entry, person.known_for_department, adult_only=bool(getattr(person, "is_adult", False)), person_name=person_name), entry.get("year") or 0),
                reverse=True,
            )
        else:
            prioritized = prioritize_person_credits(base_items, credit_payload["known_for"])
        paged = paginate_items(prioritized, page, page_size)
        schedule_person_credit_poster_warmup(person_id, "series", paged["page"], paged["page_size"], paged["items"])
        paged["items"] = apply_local_poster_paths(paged["items"])
        return JSONResponse(content=paged, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting person series for {person_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()


@router.get("/people/{person_id:int}/scenes")
def get_person_scenes(
    person_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=8, ge=1, le=60),
    source: Optional[str] = Query(default=None),
):
    db = Session()
    try:
        person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            person = _get_or_create_person_db(db, person_id)
            if person:
                person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == person_id).first()
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        ui_lang = _preferred_metadata_language(db)
        target_lang = ui_lang or "en"
        credit_payload = load_person_credit_payload(db, person_id, person, ui_lang, target_lang, scenes_page=page, scenes_page_size=page_size, scenes_source=source)
        base_items = credit_payload.get("scenes", [])
        total_scene_credits = credit_payload["total_scene_credits"]
        paged = {
            "items": apply_local_poster_paths(base_items),
            "page": page,
            "page_size": page_size,
            "total_items": total_scene_credits,
            "total_pages": max(1, math.ceil(total_scene_credits / page_size)),
        }
        return JSONResponse(content=paged, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting person scenes for {person_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()


@router.get("/people/{person_id:int}/credit-backdrops")
def get_person_credit_backdrops(
    person_id: int,
    tmdb_id: int = Query(..., ge=1),
    media_type: str = Query(...),
):
    db = Session()
    try:
        person = db.query(Person).filter(Person.id == person_id).first()
        if not person:
            person = _get_or_create_person_db(db, person_id)
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        normalized_type = "tv" if str(media_type or "").lower() in {"tv", "series"} else "movie"
        ui_lang = _preferred_metadata_language(db) or "en-US"

        cached_payload = get_cached_person_credit_backdrops(person_id, tmdb_id, normalized_type, ui_lang)
        if cached_payload:
            return JSONResponse(content=cached_payload, media_type="application/json; charset=utf-8")

        tmdb_client = TMDBClient(db)
        raw_data = tmdb_client.get_details(tmdb_id, normalized_type, language=ui_lang, include_images=True)
        backdrops = ((raw_data or {}).get("images") or {}).get("backdrops") or []
        has_valid_backdrops = any((not bd.get("iso_639_1") or bd.get("iso_639_1") == "") and int(bd.get("width") or 0) >= 1280 for bd in backdrops)

        payload = {
            "tmdb_id": tmdb_id,
            "media_type": normalized_type,
            "title": raw_data.get("title") or raw_data.get("name") or raw_data.get("original_title") or raw_data.get("original_name"),
            "backdrops": backdrops,
            "has_valid_backdrops": has_valid_backdrops,
        }
        set_cached_person_credit_backdrops(person_id, tmdb_id, normalized_type, ui_lang, payload)

        return JSONResponse(content=payload, media_type="application/json; charset=utf-8")
    except Exception as e:
        logger.error(f"Error getting credit backdrops for person {person_id}, tmdb {tmdb_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        db.close()
