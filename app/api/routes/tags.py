from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from app.db.base import Session as DBSession
from app.db.models.media import Tag, MediaItem, VirtualMediaState
from app.db.models.person import Person
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

import base64
import uuid
import requests
from pathlib import Path

TAG_IMAGES_DIR = Path("data/media/tags")

def _process_custom_images(custom_images) -> list[str]:
    if not custom_images or not isinstance(custom_images, list):
        return []
    TAG_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    saved_urls = []
    for img in custom_images:
        if not isinstance(img, str) or not img.strip():
            continue
        img = img.strip()
        if img.startswith("/media/tags/"):
            saved_urls.append(img)
            continue
        
        # Base64 string
        if img.startswith("data:image/"):
            try:
                header, data = img.split(",", 1)
                ext = "png"
                if "jpeg" in header or "jpg" in header:
                    ext = "jpg"
                elif "webp" in header:
                    ext = "webp"
                
                filename = f"tag_{uuid.uuid4().hex}.{ext}"
                filepath = TAG_IMAGES_DIR / filename
                with open(filepath, "wb") as f:
                    f.write(base64.b64decode(data))
                saved_urls.append(f"/media/tags/{filename}")
            except Exception as e:
                logger.error(f"Error saving base64 image: {e}")
            continue

        # URL
        if img.startswith("http://") or img.startswith("https://"):
            try:
                ext = "png"
                url_path = img.split("?")[0]
                if url_path.endswith((".jpg", ".jpeg")):
                    ext = "jpg"
                elif url_path.endswith(".webp"):
                    ext = "webp"
                elif url_path.endswith(".gif"):
                    ext = "gif"

                response = requests.get(img, timeout=10)
                if response.status_code == 200:
                    filename = f"tag_{uuid.uuid4().hex}.{ext}"
                    filepath = TAG_IMAGES_DIR / filename
                    with open(filepath, "wb") as f:
                        f.write(response.content)
                    saved_urls.append(f"/media/tags/{filename}")
            except Exception as e:
                logger.error(f"Error downloading image from {img}: {e}")
            continue

    return saved_urls

@router.get("/tags")
def get_all_tags(target_type: str = None, is_adult: bool = False):
    db = DBSession()
    try:
        query = db.query(Tag).filter(Tag.is_adult == is_adult)
        if target_type:
            query = query.filter(Tag.target_type == target_type)
        tags = query.all()
        return [{"id": t.id, "name": t.name, "color": t.color, "target_type": t.target_type, "is_adult": t.is_adult, "custom_images": t.custom_images} for t in tags]
    except Exception as e:
        logger.error(f"Error fetching tags: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
 
@router.post("/tags")
def create_tag(payload: dict):
    db = DBSession()
    try:
        name = payload.get("name", "").strip()
        color = payload.get("color", "#3b82f6")
        target_type = payload.get("target_type", "media").strip().lower()
        is_adult = bool(payload.get("is_adult", False))
        custom_images = payload.get("custom_images", [])
        if not name:
            return JSONResponse(status_code=400, content={"error": "Name required"})
        if target_type not in {"media", "people"}:
            return JSONResponse(status_code=400, content={"error": "Invalid target_type"})
            
        from sqlalchemy import func
        existing = db.query(Tag).filter(
            func.lower(Tag.name) == func.lower(name),
            Tag.is_adult == is_adult
        ).first()
        if existing:
            return JSONResponse(status_code=400, content={"error": "Tag already exists"})
            
        saved_images = _process_custom_images(custom_images)
        tag = Tag(name=name, color=color, target_type=target_type, is_adult=is_adult, custom_images=saved_images)
        db.add(tag)
        db.commit()
        return {"id": tag.id, "name": tag.name, "color": tag.color, "target_type": tag.target_type, "is_adult": tag.is_adult, "custom_images": tag.custom_images}
    except Exception as e:
        db.rollback()
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
 
@router.put("/tags/{tag_id}")
def update_tag(tag_id: int, payload: dict):
    db = DBSession()
    try:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
        if not tag:
            return JSONResponse(status_code=404, content={"error": "Not found"})
            
        if "name" in payload:
            name = payload["name"].strip()
            if name:
                from sqlalchemy import func
                existing = db.query(Tag).filter(
                    func.lower(Tag.name) == func.lower(name),
                    Tag.is_adult == tag.is_adult,
                    Tag.id != tag_id
                ).first()
                if existing:
                    return JSONResponse(status_code=400, content={"error": "Name already taken"})
                old_name = tag.name
                tag.name = name
                if old_name != name:
                    from app.db.models.metadata import TMDBCache
                    for state in db.query(VirtualMediaState).all():
                        current_tags = list(getattr(state, "custom_tags", []) or [])
                        if old_name in current_tags:
                            cache = db.query(TMDBCache).filter(TMDBCache.tmdb_id == state.tmdb_id).first()
                            is_virtual_adult = bool(cache.raw_data.get("adult", False)) if (cache and cache.raw_data) else False
                            if is_virtual_adult == tag.is_adult:
                                state.custom_tags = [name if tag_name == old_name else tag_name for tag_name in current_tags]
                    for person in db.query(Person).filter(Person.is_adult == tag.is_adult).all():
                        current_tags = list(getattr(person, "custom_tags", []) or [])
                        if old_name in current_tags:
                            person.custom_tags = [name if tag_name == old_name else tag_name for tag_name in current_tags]
                
        if "color" in payload:
            tag.color = payload["color"]
            
        if "custom_images" in payload:
            tag.custom_images = _process_custom_images(payload["custom_images"])

        db.commit()
        return {"id": tag.id, "name": tag.name, "color": tag.color, "target_type": tag.target_type, "is_adult": tag.is_adult, "custom_images": tag.custom_images}
    except Exception as e:
        db.rollback()
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: int):
    db = DBSession()
    try:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
        if not tag:
            return JSONResponse(status_code=404, content={"error": "Not found"})

        tag_name = tag.name
        for item in db.query(MediaItem).filter(MediaItem.tags.any(Tag.id == tag_id)).all():
            item.tags = [existing_tag for existing_tag in item.tags if existing_tag.id != tag_id]

        for state in db.query(VirtualMediaState).all():
            current_tags = list(getattr(state, "custom_tags", []) or [])
            if tag_name in current_tags:
                state.custom_tags = [entry for entry in current_tags if entry != tag_name]

        for person in db.query(Person).all():
            current_tags = list(getattr(person, "custom_tags", []) or [])
            if tag_name in current_tags:
                person.custom_tags = [entry for entry in current_tags if entry != tag_name]

        db.delete(tag)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
