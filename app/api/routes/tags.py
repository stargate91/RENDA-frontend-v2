from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from app.db.base import Session as DBSession
from app.db.models.media import Tag, MediaItem, VirtualMediaState
from app.db.models.person import Person
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/tags")
def get_all_tags(target_type: str = None):
    db = DBSession()
    try:
        query = db.query(Tag)
        if target_type:
            query = query.filter(Tag.target_type == target_type)
        tags = query.all()
        return [{"id": t.id, "name": t.name, "color": t.color, "target_type": t.target_type} for t in tags]
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
        if not name:
            return JSONResponse(status_code=400, content={"error": "Name required"})
        if target_type not in {"media", "people"}:
            return JSONResponse(status_code=400, content={"error": "Invalid target_type"})
            
        from sqlalchemy import func
        existing = db.query(Tag).filter(
            func.lower(Tag.name) == func.lower(name)
        ).first()
        if existing:
            return JSONResponse(status_code=400, content={"error": "Tag already exists"})
            
        tag = Tag(name=name, color=color, target_type=target_type)
        db.add(tag)
        db.commit()
        return {"id": tag.id, "name": tag.name, "color": tag.color, "target_type": tag.target_type}
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
                    Tag.id != tag_id
                ).first()
                if existing:
                    return JSONResponse(status_code=400, content={"error": "Name already taken"})
                old_name = tag.name
                tag.name = name
                if old_name != name:
                    for state in db.query(VirtualMediaState).all():
                        current_tags = list(getattr(state, "custom_tags", []) or [])
                        if old_name in current_tags:
                            state.custom_tags = [name if tag_name == old_name else tag_name for tag_name in current_tags]
                    for person in db.query(Person).all():
                        current_tags = list(getattr(person, "custom_tags", []) or [])
                        if old_name in current_tags:
                            person.custom_tags = [name if tag_name == old_name else tag_name for tag_name in current_tags]
                
        if "color" in payload:
            tag.color = payload["color"]
            
        db.commit()
        return {"id": tag.id, "name": tag.name, "color": tag.color, "target_type": tag.target_type}
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
