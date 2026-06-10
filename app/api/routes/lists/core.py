import logging
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse
from app.db.base import Session as DBSession
from app.db.models.media import CustomList, CustomListItem
from app.utils.logger import logger as app_logger
from app.services.lists_service import _add_or_get_list_item, _serialize_list_item

logger = logging.getLogger(__name__)
router = APIRouter()


def _serialize_list_export(db, custom_list: CustomList) -> dict:
    items = db.query(CustomListItem).filter(CustomListItem.list_id == custom_list.id).order_by(CustomListItem.added_at.asc()).all()
    exported_items = []
    for item in items:
        serialized = _serialize_list_item(db, item)
        exported_items.append({
            "tmdb_id": serialized.get("tmdb_id"),
            "media_type": serialized.get("media_type") or "movie",
            "title": serialized.get("title"),
            "poster_path": serialized.get("poster_path"),
            "imdb_id": serialized.get("imdb_id"),
            "rating_imdb": serialized.get("rating_imdb"),
            "vote_count_imdb": serialized.get("vote_count_imdb"),
            "rating_rotten": serialized.get("rating_rotten"),
            "rating_meta": serialized.get("rating_meta"),
        })

    return {
        "format": "renda_list",
        "version": 2,
        "exported_at": datetime.utcnow().isoformat(),
        "list": {
            "name": custom_list.name,
            "description": custom_list.description,
            "color": custom_list.color or "#3b82f6",
            "icon": custom_list.icon or "ListVideo",
            "items": exported_items,
        },
    }


def _build_import_name(db, desired_name: str) -> str:
    base_name = (desired_name or "").strip() or "Imported List"
    if not db.query(CustomList).filter(CustomList.name == base_name).first():
        return base_name

    suffix = 2
    while True:
        candidate = f"{base_name} ({suffix})"
        if not db.query(CustomList).filter(CustomList.name == candidate).first():
            return candidate
        suffix += 1

@router.post("/lists/debug-log")
def write_lists_debug_log(payload: dict):
    app_logger.error(f"[LISTS_DEBUG][CLIENT] {payload}")
    return {"status": "ok"}

@router.get("/lists")
def get_all_lists():
    db = DBSession()
    try:
        watchlist = db.query(CustomList).filter(CustomList.name == "Watchlist").first()
        if not watchlist:
            watchlist = CustomList(
                name="Watchlist",
                description="Your default system watchlist.",
                color="#0088ff",
                icon="Bookmark"
            )
            db.add(watchlist)
            db.commit()

        lists = db.query(CustomList).all()
        result = []
        for l in lists:
            is_watchlist = l.name == "Watchlist"
            item_count = db.query(CustomListItem).filter(CustomListItem.list_id == l.id).count()
            items = db.query(CustomListItem).filter(CustomListItem.list_id == l.id).order_by(CustomListItem.added_at.desc()).limit(4).all()
            posters = [
                serialized.get("poster_path")
                for serialized in (_serialize_list_item(db, item) for item in items)
                if serialized.get("poster_path")
            ]
            
            result.append({
                "id": l.id,
                "name": l.name,
                "is_watchlist": is_watchlist,
                "description": l.description,
                "color": l.color or "#3b82f6",
                "icon": l.icon or "ListVideo",
                "created_at": l.created_at.isoformat() if l.created_at else None,
                "item_count": item_count,
                "sample_posters": posters
            })
        return result
    except Exception as e:
        logger.error(f"Error fetching lists: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.get("/lists/{list_id}/export")
def export_list(list_id: int):
    db = DBSession()
    try:
        custom_list = db.query(CustomList).filter(CustomList.id == list_id).first()
        if not custom_list:
            return JSONResponse(status_code=404, content={"error": "List not found"})

        return _serialize_list_export(db, custom_list)
    except Exception as e:
        logger.error(f"Error exporting list {list_id}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/lists/import")
def import_list(payload: dict, background_tasks: BackgroundTasks):
    from fastapi import BackgroundTasks
    from app.scanner.scanner_manager import scan_status, scan_status_lock
    import time
    from app.services.lists_service import _store_bulk_import_report
    
    db = DBSession()
    try:
        raw_list = payload.get("list") or {}
        raw_items = raw_list.get("items") or []
        language = (payload.get("language") or "").strip() or None

        imported_name = _build_import_name(db, raw_list.get("name"))
        imported_list = CustomList(
            name=imported_name,
            description=(raw_list.get("description") or "").strip() or None,
            color=(raw_list.get("color") or "").strip() or "#3b82f6",
            icon=(raw_list.get("icon") or "").strip() or "ListVideo",
        )
        db.add(imported_list)
        db.flush()
        db.commit()
        db.refresh(imported_list)

        if raw_items:
            with scan_status_lock:
                from fastapi import HTTPException
                if scan_status.get("active"):
                    raise HTTPException(status_code=400, detail=f"Task already in progress: {scan_status.get('phase', 'unknown')}")
                scan_status.update({
                    "active": True,
                    "phase": "importing",
                    "current": 0,
                    "total": len(raw_items),
                    "start_time": time.time(),
                    "message": f"0/{len(raw_items)}",
                    "current_item": "",
                    "list_id": imported_list.id,
                    "can_stop": True,
                    "stop_requested": False,
                })
            
            _store_bulk_import_report(imported_list.id, {
                "status": "running",
                "list_id": imported_list.id,
                "started_at": time.time(),
            })
            from app.services.lists_service import _run_list_import_job
            background_tasks.add_task(_run_list_import_job, imported_list.id, raw_items, language)

        return {
            "id": imported_list.id,
            "name": imported_list.name,
            "is_watchlist": False,
            "description": imported_list.description,
            "color": imported_list.color,
            "icon": imported_list.icon,
            "created_at": imported_list.created_at.isoformat() if imported_list.created_at else None,
            "item_count": 0,
            "sample_posters": [],
            "status": "started" if raw_items else "completed"
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing list: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.post("/lists")
def create_list(payload: dict):
    db = DBSession()
    try:
        name = payload.get("name", "").strip()
        description = payload.get("description", "").strip() or None
        color = payload.get("color", "").strip() or "#3b82f6"
        icon = payload.get("icon", "").strip() or "ListVideo"
        
        if not name:
            return JSONResponse(status_code=400, content={"error": "List name is required"})
            
        existing = db.query(CustomList).filter(CustomList.name == name).first()
        if existing:
            return JSONResponse(status_code=400, content={"error": "A list with this name already exists"})
            
        new_list = CustomList(
            name=name,
            description=description,
            color=color,
            icon=icon
        )
        db.add(new_list)
        db.commit()
        
        return {
            "id": new_list.id,
            "name": new_list.name,
            "is_watchlist": False,
            "description": new_list.description,
            "color": new_list.color,
            "icon": new_list.icon,
            "created_at": new_list.created_at.isoformat() if new_list.created_at else None,
            "item_count": 0,
            "sample_posters": []
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating list: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.put("/lists/{list_id}")
def update_list(list_id: int, payload: dict):
    db = DBSession()
    try:
        custom_list = db.query(CustomList).filter(CustomList.id == list_id).first()
        if not custom_list:
            return JSONResponse(status_code=404, content={"error": "List not found"})

        name = payload.get("name", custom_list.name)
        description = payload.get("description", custom_list.description)
        color = payload.get("color", custom_list.color or "#3b82f6")
        icon = payload.get("icon", custom_list.icon or "ListVideo")

        name = (name or "").strip()
        description = description.strip() if isinstance(description, str) else description
        color = (color or "").strip() or "#3b82f6"
        icon = (icon or "").strip() or "ListVideo"

        if not name:
            return JSONResponse(status_code=400, content={"error": "List name is required"})

        existing = db.query(CustomList).filter(CustomList.name == name, CustomList.id != list_id).first()
        if existing:
            return JSONResponse(status_code=400, content={"error": "A list with this name already exists"})

        custom_list.name = name
        custom_list.description = description or None
        custom_list.color = color
        custom_list.icon = icon
        db.commit()

        item_count = db.query(CustomListItem).filter(CustomListItem.list_id == custom_list.id).count()
        items = db.query(CustomListItem).filter(CustomListItem.list_id == custom_list.id).order_by(CustomListItem.added_at.desc()).limit(4).all()
        posters = [
            serialized.get("poster_path")
            for serialized in (_serialize_list_item(db, item) for item in items)
            if serialized.get("poster_path")
        ]

        return {
            "id": custom_list.id,
            "name": custom_list.name,
            "is_watchlist": custom_list.name == "Watchlist",
            "description": custom_list.description,
            "color": custom_list.color,
            "icon": custom_list.icon,
            "created_at": custom_list.created_at.isoformat() if custom_list.created_at else None,
            "item_count": item_count,
            "sample_posters": posters
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating list {list_id}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.delete("/lists/{list_id}")
def delete_list(list_id: int):
    db = DBSession()
    try:
        custom_list = db.query(CustomList).filter(CustomList.id == list_id).first()
        if not custom_list:
            return JSONResponse(status_code=404, content={"error": "List not found"})
            
        if custom_list.name == "Watchlist":
            return JSONResponse(status_code=400, content={"error": "The standard Watchlist cannot be deleted."})
            
        db.delete(custom_list)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting list {list_id}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.get("/lists/{list_id}")
def get_list_details(list_id: int):
    db = DBSession()
    try:
        custom_list = db.query(CustomList).filter(CustomList.id == list_id).first()
        if not custom_list:
            return JSONResponse(status_code=404, content={"error": "List not found"})
            
        items = db.query(CustomListItem).filter(CustomListItem.list_id == list_id).order_by(CustomListItem.added_at.desc()).all()
        items_result = [_serialize_list_item(db, item) for item in items]
            
        return {
            "id": custom_list.id,
            "name": custom_list.name,
            "is_watchlist": custom_list.name == "Watchlist",
            "description": custom_list.description,
            "color": custom_list.color,
            "icon": custom_list.icon,
            "created_at": custom_list.created_at.isoformat() if custom_list.created_at else None,
            "items": items_result
        }
    except Exception as e:
        logger.error(f"Error fetching list details {list_id}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
