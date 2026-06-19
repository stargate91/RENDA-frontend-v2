from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import uuid
import threading
import logging

from app.db.base import Session
from app.db.models import Person, Tag, ImageStatus
from app.utils.library_utils.image_constants import BACKDROP_SIZE, PERSON_SIZE
from app.services.image_processing_service import ImageProcessingService

from app.utils.people_utils import (
    _add_person_from_tmdb_internal,
    _serialize_person_summary,
    _get_or_create_person_db,
    _normalize_user_rating,
    _resolve_person_profile_path,
    _public_image_path,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/people/{person_id:int}/backdrop")
def update_person_backdrop(person_id: int, payload: dict):
    """Updates the backdrop of a person, using a credit backdrop image."""
    db = Session()
    try:
        from app.services.asset_service import AssetService

        person = _get_or_create_person_db(db, person_id)
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        backdrop_path = payload.get("backdrop_path")
        if not backdrop_path:
            return JSONResponse(status_code=400, content={"error": "backdrop_path is required"})

        asset_service = AssetService()
        local_path = asset_service.download_image(backdrop_path, "backdrops", size=BACKDROP_SIZE)
        if not local_path:
            return JSONResponse(status_code=500, content={"error": "Failed to download backdrop"})

        person.manual_backdrop_path = backdrop_path
        person.manual_local_backdrop_path = local_path
        db.commit()
        db.refresh(person)

        return {
            "status": "success",
            "backdrop_path": _public_image_path(person.manual_local_backdrop_path, "backdrops") or person.manual_backdrop_path,
            "local_backdrop_path": person.manual_local_backdrop_path,
            "has_local_backdrop": bool(_public_image_path(person.manual_local_backdrop_path or person.manual_backdrop_path, "backdrops")),
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating person backdrop: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.post("/people/add-tmdb")
def add_person_tmdb(payload: dict):
    """Fetches a person by TMDB ID or adult performer ID, creates/updates them in the DB, sets as active, and enriches metadata."""
    raw_id = payload.get("tmdb_id")
    if not raw_id:
        return JSONResponse(status_code=400, content={"error": "tmdb_id is required"})
        
    db = Session()
    try:
        raw_str = str(raw_id).strip()
        if ":" in raw_str and any(raw_str.startswith(prefix) for prefix in ["stashdb:", "fansdb:", "theporndb:"]):
            source, uuid_str = raw_str.split(":", 1)
            import hashlib
            from app.api.graphql_clients import AdultGraphQLClient
            from app.db.models import Person, PersonLocalization
            from app.services.person_service import PersonService
            
            def get_stable_integer_id(src: str, u_str: str) -> int:
                h = hashlib.sha256(f"{src}:{u_str}".encode()).hexdigest()
                return int(h[:7], 16)
                
            stable_id = get_stable_integer_id(source, uuid_str)
            
            client = AdultGraphQLClient(db, source)
            data = client.get_performer_details(uuid_str)
            if not data:
                return JSONResponse(status_code=404, content={"error": f"Performer not found on {source}"})
                
            gender_str = str(data.get("gender") or "").upper()
            if "FEMALE" in gender_str:
                mapped_gender = 1
            elif "MALE" in gender_str:
                mapped_gender = 2
            elif gender_str:
                mapped_gender = 3
            else:
                mapped_gender = 0
                
            images = data.get("images") or []
            profile_url = images[0].get("url") if images else None
            
            person = db.query(Person).filter(Person.id == stable_id).first()
            if not person:
                person = Person(
                    id=stable_id,
                    birthday=data.get("birthdate"),
                    deathday=data.get("death_date"),
                    place_of_birth=data.get("country"),
                    gender=mapped_gender,
                    known_for_department="Acting",
                    profile_path=profile_url,
                    is_adult=True,
                    is_active=True,
                    external_ids={
                        "stashdb_id": uuid_str if source == "stashdb" else None,
                        "fansdb_id": uuid_str if source == "fansdb" else None,
                        "theporndb_id": uuid_str if source == "theporndb" else None,
                        "source": source,
                        "aliases": data.get("aliases") or [],
                        "attributes": {
                            "ethnicity": data.get("ethnicity"),
                            "eye_color": data.get("eye_color"),
                            "hair_color": data.get("hair_color"),
                            "height": data.get("height"),
                            "measurements": data.get("measurements"),
                            "tattoos": data.get("tattoos"),
                            "piercings": data.get("piercings"),
                        }
                    }
                )
                db.add(person)
                loc = PersonLocalization(
                    person_id=stable_id,
                    locale="en",
                    name=data.get("name") or "Unknown",
                    biography=data.get("disambiguation")
                )
                db.add(loc)
            else:
                person.is_active = True
                
            db.commit()
            
            person_service = PersonService(db)
            person_service.enrich_person_metadata(stable_id, ["en"])
            
            return JSONResponse(content=_serialize_person_summary(db, person))
        else:
            person, _activated = _add_person_from_tmdb_internal(db, int(raw_id))
            return JSONResponse(content=_serialize_person_summary(db, person))
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding person: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/people/{person_id:int}/status")
def update_person_status(person_id: int, payload: dict):
    """Updates the status (is_active, is_favorite, user_rating, user_comment) of a person."""
    db = Session()
    try:
        person = _get_or_create_person_db(db, person_id)
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})
            
        was_active = person.is_active
        normalized_user_rating = None
        if "is_active" in payload:
            person.is_active = bool(payload["is_active"])
        if "is_favorite" in payload:
            person.is_favorite = bool(payload["is_favorite"])
        if "user_rating" in payload:
            normalized_user_rating = _normalize_user_rating(payload["user_rating"])
            person.user_rating = normalized_user_rating
        normalized_user_comment = None
        if "user_comment" in payload:
            normalized_user_comment = (str(payload["user_comment"]).strip() if payload["user_comment"] not in (None, "") else None)
            person.user_comment = normalized_user_comment
        if (
            payload.get("is_favorite") is True
            or ("user_rating" in payload and normalized_user_rating is not None)
            or ("user_comment" in payload and normalized_user_comment is not None)
        ):
            person.is_active = True
        if "custom_tags" in payload:
            is_adult = bool(getattr(person, "is_adult", False))
            new_tag_names = [str(t).strip() for t in payload["custom_tags"] if str(t).strip()]
            for name in new_tag_names:
                existing = db.query(Tag).filter(Tag.name == name, Tag.is_adult == is_adult).first()
                if not existing:
                    db.add(Tag(name=name, is_adult=is_adult))
            person.custom_tags = new_tag_names
            
        if person.is_active and person.profile_path and (not person.local_profile_path or not _public_image_path(person.local_profile_path, "persons")):
            person.image_status = ImageStatus.PENDING
            person.local_profile_path = None
        db.commit()

        # If newly activated, trigger background enrichment
        if "is_active" in payload and payload["is_active"] and not was_active:
            def _enrich_bg(p_id):
                bg_db = Session()
                try:
                    from app.services.person_service import PersonService
                    from app.utils.people_utils import _preferred_person_languages
                    person_service = PersonService(bg_db)
                    langs = _preferred_person_languages(bg_db)
                    person_service.enrich_person_metadata(p_id, languages=langs)
                except Exception as e:
                    logger.error(f"Background enrichment failed for {p_id}: {e}")
                finally:
                    bg_db.close()
            threading.Thread(target=_enrich_bg, args=(person.id,), daemon=True).start()

        return {
            "status": "success",
            "is_active": person.is_active,
            "is_favorite": person.is_favorite,
            "user_rating": person.user_rating,
            "user_comment": person.user_comment,
            "custom_tags": person.custom_tags or []
        }
    except Exception as e:
        db.rollback()
        if isinstance(e, ValueError):
            return JSONResponse(status_code=400, content={"error": str(e)})
        logger.error(f"Error updating person status: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/people/{person_id:int}/profile")
def update_person_profile(person_id: int, payload: dict):
    """Updates the profile picture of a person, downloading it if not present locally."""
    db = Session()
    try:
        from app.services.asset_service import AssetService
        
        person = _get_or_create_person_db(db, person_id)
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})
            
        profile_path = payload.get("profile_path")
        if not profile_path:
            return JSONResponse(status_code=400, content={"error": "profile_path is required"})
            
        # If it is a full TMDB URL, extract the relative path
        db_profile_path = profile_path
        if isinstance(profile_path, str) and profile_path.startswith("https://image.tmdb.org/t/p/"):
            parts = profile_path.split("/t/p/")
            if len(parts) > 1:
                subparts = parts[1].split("/", 1)
                if len(subparts) > 1:
                    db_profile_path = "/" + subparts[1]

        # 1. Store manual override separately
        person.manual_profile_path = db_profile_path
        person.manual_local_profile_path = None
        
        # 2. Download the image locally
        asset_service = AssetService()
        local_path = asset_service.download_image(profile_path, "persons", size=PERSON_SIZE)
        if local_path:
            person.manual_local_profile_path = local_path
            person.image_status = ImageStatus.COMPLETED
        else:
            person.image_status = ImageStatus.FAILED
            
        db.commit()
        db.refresh(person)
        return {
            "status": "success",
            "profile_path": _resolve_person_profile_path(person),
            "local_profile_path": person.manual_local_profile_path or person.local_profile_path,
            "has_local_profile": bool(_public_image_path(person.manual_local_profile_path or person.manual_profile_path or person.local_profile_path or person.profile_path, "persons")),
        }
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Error updating person profile: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/people/{person_id:int}/upload-profile")
def upload_person_profile(person_id: int, file: UploadFile = File(...)):
    """Uploads a local image file directly as the person's profile picture."""
    db = Session()
    try:
        person = _get_or_create_person_db(db, person_id)
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})
            
        processor = ImageProcessingService("data/media/images")
        processor.ensure_folders()

        ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        filename = f"/{uuid.uuid4().hex}.{ext}"
        filepath = processor.build_local_path("persons", filename)
        saved_path = processor.write_upload(filepath, file.file)
        if not saved_path:
            return JSONResponse(status_code=400, content={"error": "Invalid image upload"})
            
        person.manual_local_profile_path = filename
        person.manual_profile_path = filename
        person.image_status = ImageStatus.COMPLETED
        
        db.commit()
        db.refresh(person)
        return {
            "status": "success",
            "profile_path": _resolve_person_profile_path(person),
            "local_profile_path": person.manual_local_profile_path or person.local_profile_path,
            "has_local_profile": bool(_public_image_path(person.manual_local_profile_path or person.manual_profile_path or person.local_profile_path or person.profile_path, "persons")),
        }
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Error uploading profile: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/people/{person_id:int}/upload-backdrop")
def upload_person_backdrop(person_id: int, file: UploadFile = File(...)):
    """Uploads a local image file directly as the person's backdrop."""
    db = Session()
    try:
        person = _get_or_create_person_db(db, person_id)
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})

        processor = ImageProcessingService("data/media/images")
        processor.ensure_folders()

        ext = file.filename.split('.')[-1] if file.filename and '.' in file.filename else 'jpg'
        filename = f"/{uuid.uuid4().hex}.{ext}"
        filepath = processor.build_local_path("backdrops", filename)
        saved_path = processor.write_upload(filepath, file.file)
        if not saved_path:
            return JSONResponse(status_code=400, content={"error": "Invalid image upload"})

        person.manual_local_backdrop_path = filename
        person.manual_backdrop_path = filename

        db.commit()
        db.refresh(person)
        return {
            "status": "success",
            "backdrop_path": _public_image_path(person.manual_local_backdrop_path, "backdrops") or person.manual_backdrop_path,
            "local_backdrop_path": person.manual_local_backdrop_path,
            "has_local_backdrop": bool(_public_image_path(person.manual_local_backdrop_path or person.manual_backdrop_path, "backdrops")),
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error uploading backdrop: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.get("/people/{person_id:int}/link/preview")
def link_person_source_preview(person_id: int, source: str, external_id: str):
    """Returns a side-by-side comparison of local metadata and the external source's metadata."""
    if not source or not external_id:
        return JSONResponse(status_code=400, content={"error": "source and external_id are required"})
        
    db = Session()
    try:
        from app.db.models import Person, PersonLocalization
        from app.api.graphql_clients import AdultGraphQLClient
        from app.api.tmdb_client import TMDBClient
        
        person = db.query(Person).filter(Person.id == person_id).first()
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})
            
        loc = db.query(PersonLocalization).filter(
            PersonLocalization.person_id == person_id,
            PersonLocalization.locale == "en"
        ).first()
        
        local_attrs = (person.external_ids or {}).get("attributes") or {}
        local_data = {
            "name": loc.name if loc else "Unknown",
            "biography": loc.biography if loc else None,
            "birthday": person.birthday,
            "place_of_birth": person.place_of_birth,
            "gender": person.gender,
            "height": local_attrs.get("height"),
            "measurements": local_attrs.get("measurements"),
            "ethnicity": local_attrs.get("ethnicity"),
            "eye_color": local_attrs.get("eye_color"),
            "hair_color": local_attrs.get("hair_color")
        }
        
        external_data = {}
        if source in ["stashdb", "fansdb", "theporndb"]:
            client = AdultGraphQLClient(db, source)
            ext_perf = client.get_performer_details(external_id)
            if ext_perf:
                gender_str = str(ext_perf.get("gender") or "").upper()
                if "FEMALE" in gender_str:
                    mapped_gender = 1
                elif "MALE" in gender_str:
                    mapped_gender = 2
                elif gender_str:
                    mapped_gender = 3
                else:
                    mapped_gender = 0
                    
                external_data = {
                    "name": ext_perf.get("name"),
                    "biography": ext_perf.get("disambiguation"),
                    "birthday": ext_perf.get("birthdate"),
                    "place_of_birth": ext_perf.get("country"),
                    "gender": mapped_gender,
                    "height": ext_perf.get("height"),
                    "measurements": ext_perf.get("measurements"),
                    "ethnicity": ext_perf.get("ethnicity"),
                    "eye_color": ext_perf.get("eye_color"),
                    "hair_color": ext_perf.get("hair_color"),
                    "aliases": ext_perf.get("aliases") or [],
                    "images_count": len(ext_perf.get("images") or [])
                }
        elif source == "tmdb":
            tmdb_client = TMDBClient(db)
            ext_perf = tmdb_client.get_person_details(int(external_id), language="en-US")
            if ext_perf:
                external_data = {
                    "name": ext_perf.get("name"),
                    "biography": ext_perf.get("biography"),
                    "birthday": ext_perf.get("birthday"),
                    "place_of_birth": ext_perf.get("place_of_birth"),
                    "gender": ext_perf.get("gender") if ext_perf.get("gender") is not None else 0,
                    "height": None,
                    "measurements": None,
                    "ethnicity": None,
                    "eye_color": None,
                    "hair_color": None,
                    "aliases": ext_perf.get("also_known_as") or [],
                    "images_count": len(ext_perf.get("images", {}).get("profiles") or [])
                }
                
        # Check if a duplicate person exists to merge their user fields
        duplicate_person = None
        if source == "tmdb":
            target_id = int(external_id)
            duplicate_person = db.query(Person).filter(Person.id == target_id).first()
        elif source in ["stashdb", "fansdb", "theporndb"]:
            import hashlib
            h = hashlib.sha256(f"{source}:{external_id}".encode()).hexdigest()
            target_id = int(h[:7], 16)
            duplicate_person = db.query(Person).filter(Person.id == target_id).first()

        if duplicate_person and duplicate_person.id != person.id:
            local_data["user_rating"] = person.user_rating
            local_data["user_comment"] = person.user_comment
            local_data["is_favorite"] = person.is_favorite
            local_data["custom_tags"] = person.custom_tags or []

            external_data["user_rating"] = duplicate_person.user_rating
            external_data["user_comment"] = duplicate_person.user_comment
            external_data["is_favorite"] = duplicate_person.is_favorite
            external_data["custom_tags"] = duplicate_person.custom_tags or []

        return JSONResponse(content={
            "local": local_data,
            "external": external_data
        })
    except Exception as e:
        logger.error(f"Error previewing link source: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/people/{person_id:int}/link")
def link_person_source(person_id: int, payload: dict):
    """Links an external source (TMDb, StashDB, FansDB, THEPornDB) to an existing person, merging metadata."""
    source = payload.get("source")
    external_id = payload.get("external_id")
    overrides = payload.get("overrides")
    if not source or not external_id:
        return JSONResponse(status_code=400, content={"error": "source and external_id are required"})
        
    db = Session()
    try:
        from app.db.models import Person
        from app.services.person_service import PersonService
        
        person = db.query(Person).filter(Person.id == person_id).first()
        if not person:
            return JSONResponse(status_code=404, content={"error": "Person not found"})
            
        ext_ids = dict(person.external_ids or {})
        
        duplicate_person = None
        if source == "tmdb":
            target_id = int(external_id)
            ext_ids["tmdb_id"] = target_id
            duplicate_person = db.query(Person).filter(Person.id == target_id).first()
        elif source in ["stashdb", "fansdb", "theporndb"]:
            ext_ids[f"{source}_id"] = str(external_id)
            person.is_adult = True
            import hashlib
            h = hashlib.sha256(f"{source}:{external_id}".encode()).hexdigest()
            target_id = int(h[:7], 16)
            duplicate_person = db.query(Person).filter(Person.id == target_id).first()
        else:
            return JSONResponse(status_code=400, content={"error": f"Unsupported source: {source}"})
            
        # Update source preference to the newly linked source if requested, or keep existing
        if "source" not in ext_ids:
            ext_ids["source"] = source
            
        person.external_ids = ext_ids

        # Extract user fields from overrides
        if overrides:
            if "is_favorite" in overrides:
                person.is_favorite = bool(overrides.pop("is_favorite"))
            if "user_rating" in overrides:
                person.user_rating = overrides.pop("user_rating")
                import datetime
                person.user_rating_at = datetime.datetime.utcnow()
            if "user_comment" in overrides:
                person.user_comment = overrides.pop("user_comment")
            if "custom_tags" in overrides:
                person.custom_tags = overrides.pop("custom_tags")

        # Merge duplicate person if it exists and is distinct
        if duplicate_person and duplicate_person.id != person.id:
            from app.db.models import MediaPersonLink
            # Move media links to the current person
            db.query(MediaPersonLink).filter(MediaPersonLink.person_id == duplicate_person.id).update(
                {"person_id": person.id}, synchronize_session=False
            )
            # Merge favorite status, ratings, comments, and popularity if not overridden
            if not person.is_favorite and duplicate_person.is_favorite:
                person.is_favorite = True
            if person.user_rating is None and duplicate_person.user_rating is not None:
                person.user_rating = duplicate_person.user_rating
                person.user_rating_at = duplicate_person.user_rating_at
            if not person.user_comment and duplicate_person.user_comment:
                person.user_comment = duplicate_person.user_comment
            if (person.popularity or 0.0) < (duplicate_person.popularity or 0.0):
                person.popularity = duplicate_person.popularity

            # Merge custom tags if not overridden
            if not person.custom_tags and duplicate_person.custom_tags:
                person.custom_tags = duplicate_person.custom_tags
            elif person.custom_tags and duplicate_person.custom_tags:
                keep_tags = list(person.custom_tags or [])
                del_tags = list(duplicate_person.custom_tags or [])
                person.custom_tags = list(set(keep_tags + del_tags))

            # Merge other external IDs from the duplicate person
            keep_ext = dict(person.external_ids or {})
            del_ext = dict(duplicate_person.external_ids or {})
            for k, v in del_ext.items():
                if v and not keep_ext.get(k):
                    keep_ext[k] = v
                elif isinstance(v, list) and isinstance(keep_ext.get(k), list):
                    keep_ext[k] = list(set(keep_ext[k] + v))
                elif isinstance(v, dict) and isinstance(keep_ext.get(k), dict):
                    merged_dict = dict(keep_ext[k])
                    for dk, dv in v.items():
                        if dv and not merged_dict.get(dk):
                            merged_dict[dk] = dv
                    keep_ext[k] = merged_dict
            person.external_ids = keep_ext

            # Delete the duplicate person
            db.delete(duplicate_person)

        db.commit()
        
        # Enrich metadata from all linked sources, applying explicit user overrides
        person_service = PersonService(db)
        person_service.enrich_person_metadata(person_id, ["en"], overrides)
        
        # Reload and serialize
        db.refresh(person)
        return JSONResponse(content=_serialize_person_summary(db, person))
    except Exception as e:
        db.rollback()
        logger.error(f"Error linking person source: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
