from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import uuid
import threading
import logging

from app.db.base import Session
from app.db.models import Person, Tag, ImageStatus
from app.utils.library_utils.image_constants import PERSON_SIZE
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

@router.post("/people/add-tmdb")
def add_person_tmdb(payload: dict):
    """Fetches a person by TMDB ID, creates/updates them in the DB, sets as active, and enriches metadata in all configured languages."""
    tmdb_id = payload.get("tmdb_id")
    if not tmdb_id:
        return JSONResponse(status_code=400, content={"error": "tmdb_id is required"})
        
    db = Session()
    try:
        person, _activated = _add_person_from_tmdb_internal(db, int(tmdb_id))
        return JSONResponse(content=_serialize_person_summary(db, person))
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding TMDB person: {e}")
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
        if "is_active" in payload:
            person.is_active = bool(payload["is_active"])
        if "is_favorite" in payload:
            person.is_favorite = bool(payload["is_favorite"])
        if "user_rating" in payload:
            person.user_rating = _normalize_user_rating(payload["user_rating"])
        if "user_comment" in payload:
            person.user_comment = (str(payload["user_comment"]).strip() if payload["user_comment"] not in (None, "") else None)
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

        # 1. Update remote path
        person.profile_path = db_profile_path
        person.local_profile_path = None
        
        # 2. Download the image locally
        asset_service = AssetService()
        local_path = asset_service.download_image(profile_path, "persons", size=PERSON_SIZE)
        if local_path:
            person.local_profile_path = local_path
            person.image_status = ImageStatus.COMPLETED
        else:
            person.image_status = ImageStatus.FAILED
            
        db.commit()
        db.refresh(person)
        return {
            "status": "success",
            "profile_path": _resolve_person_profile_path(person),
            "local_profile_path": person.local_profile_path,
            "has_local_profile": bool(_public_image_path(person.local_profile_path or person.profile_path, "persons")),
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
            
        person.local_profile_path = filename
        person.profile_path = filename
        person.image_status = ImageStatus.COMPLETED
        
        db.commit()
        db.refresh(person)
        return {
            "status": "success",
            "profile_path": _resolve_person_profile_path(person),
            "local_profile_path": person.local_profile_path,
            "has_local_profile": bool(_public_image_path(person.local_profile_path or person.profile_path, "persons")),
        }
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Error uploading profile: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
