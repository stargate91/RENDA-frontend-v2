import logging
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.db.base import Session as DBSession
from app.db.models.media import CustomList, CustomListItem, MediaItem
from app.db.models.metadata import MediaMatch
from app.utils.logger import logger as app_logger
from app.services.lists_service import _add_or_get_list_item, _serialize_list_item

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/lists/{list_id}/items")
def add_item_to_list(list_id: int, payload: dict):
    db = DBSession()
    try:
        custom_list = db.query(CustomList).filter(CustomList.id == list_id).first()
        if not custom_list:
            return JSONResponse(status_code=404, content={"error": "List not found"})
            
        tmdb_id = payload.get("tmdb_id")
        media_item_id = payload.get("media_item_id")
        media_type = payload.get("media_type", "movie")
        title = payload.get("title", "").strip()
        poster_path = payload.get("poster_path")
        language = (payload.get("language") or "").strip() or None
        before_count = db.query(CustomListItem).filter(CustomListItem.list_id == list_id).count()
        app_logger.error(
            f"[LISTS_DEBUG] add-request list_id={list_id} before_count={before_count} "
            f"tmdb_id={tmdb_id} media_item_id={media_item_id} media_type={media_type} title={title!r}"
        )
        item, created = _add_or_get_list_item(db, list_id, tmdb_id, media_item_id, media_type, title, poster_path, language)
        after_count = db.query(CustomListItem).filter(CustomListItem.list_id == list_id).count()
        app_logger.error(
            f"[LISTS_DEBUG] add-result list_id={list_id} created={created} after_count={after_count} "
            f"item_id={item.id} tmdb_id={item.tmdb_id} media_item_id={item.media_item_id} title={item.title!r}"
        )
        return {
            **_serialize_list_item(db, item),
            "created": created,
        }
    except ValueError as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding item to list: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.post("/lists/bulk-add")
def bulk_add_items_to_lists(payload: dict):
    db = DBSession()
    try:
        raw_list_ids = payload.get("list_ids") or []
        raw_items = payload.get("items") or []
        language = (payload.get("language") or "").strip() or None

        list_ids = []
        for value in raw_list_ids:
            try:
                list_ids.append(int(value))
            except (TypeError, ValueError):
                continue
        list_ids = list(dict.fromkeys(list_ids))

        items = [item for item in raw_items if isinstance(item, dict)]
        if not list_ids:
            return JSONResponse(status_code=400, content={"error": "At least one list must be selected"})
        if not items:
            return JSONResponse(status_code=400, content={"error": "At least one item must be selected"})

        existing_lists = db.query(CustomList.id).filter(CustomList.id.in_(list_ids)).all()
        valid_list_ids = [int(row.id) for row in existing_lists]
        missing_list_ids = [list_id for list_id in list_ids if list_id not in valid_list_ids]
        if not valid_list_ids:
            return JSONResponse(status_code=404, content={"error": "No valid lists found"})

        report = {
            str(list_id): {
                "list_id": list_id,
                "added_count": 0,
                "already_in_list_count": 0,
            }
            for list_id in valid_list_ids
        }
        totals = {
            "added_count": 0,
            "already_in_list_count": 0,
            "processed_count": 0,
        }

        def _as_int(value):
            if value is None or value == "":
                return None
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

        for list_id in valid_list_ids:
            for raw_item in items:
                tmdb_id = _as_int(raw_item.get("tmdb_id"))
                media_item_id = _as_int(raw_item.get("media_item_id"))
                media_type = raw_item.get("media_type", "movie")
                title = (raw_item.get("title") or "").strip()
                poster_path = raw_item.get("poster_path")

                if tmdb_id is None and media_item_id is None:
                    continue

                item, created = _add_or_get_list_item(
                    db,
                    list_id,
                    tmdb_id,
                    media_item_id,
                    media_type,
                    title,
                    poster_path,
                    language,
                    False,
                )
                if created:
                    report[str(list_id)]["added_count"] += 1
                    totals["added_count"] += 1
                else:
                    report[str(list_id)]["already_in_list_count"] += 1
                    totals["already_in_list_count"] += 1
                totals["processed_count"] += 1

        db.commit()
        return {
            "status": "completed",
            "list_ids": valid_list_ids,
            "missing_list_ids": missing_list_ids,
            "items_processed": len(items),
            "report": report,
            "totals": totals,
        }
    except ValueError as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk adding items to lists: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.delete("/lists/{list_id}/items/{item_id}")
def remove_item_from_list(list_id: int, item_id: int):
    db = DBSession()
    try:
        item = db.query(CustomListItem).filter(CustomListItem.list_id == list_id, CustomListItem.id == item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found in this list"})
            
        db.delete(item)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing item {item_id} from list {list_id}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.delete("/lists/{list_id}/items/by-tmdb/{tmdb_id}")
def remove_item_by_tmdb(list_id: int, tmdb_id: int):
    db = DBSession()
    try:
        item = db.query(CustomListItem).filter(CustomListItem.list_id == list_id, CustomListItem.tmdb_id == tmdb_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found in this list"})
            
        db.delete(item)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing tmdb item {tmdb_id} from list {list_id}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.delete("/lists/{list_id}/items/by-media-item/{media_item_id}")
def remove_item_by_media_item(list_id: int, media_item_id: int):
    db = DBSession()
    try:
        item = db.query(CustomListItem).filter(CustomListItem.list_id == list_id, CustomListItem.media_item_id == media_item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found in this list"})
            
        db.delete(item)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing media item {media_item_id} from list {list_id}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.get("/lists/item-membership/{item_id}")
def get_item_membership(item_id: str):
    db = DBSession()
    try:
        tmdb_id = None
        media_item_id = None
        
        if item_id.startswith("tmdb_"):
            try:
                tmdb_id = int(item_id.split("_")[1])
            except ValueError:
                return JSONResponse(status_code=400, content={"error": "Invalid TMDB ID format"})
        else:
            try:
                media_item_id = int(item_id)
            except ValueError:
                return JSONResponse(status_code=400, content={"error": "Invalid item ID format"})
                
        if media_item_id:
            media_item = db.query(MediaItem).filter(MediaItem.id == media_item_id).first()
            if media_item:
                match = db.query(MediaMatch).filter(MediaMatch.media_item_id == media_item_id, MediaMatch.is_active == True).first()
                if match:
                    tmdb_id = match.tmdb_id
                    
        query = db.query(CustomListItem)
        if tmdb_id and media_item_id:
            query = query.filter((CustomListItem.tmdb_id == tmdb_id) | (CustomListItem.media_item_id == media_item_id))
        elif tmdb_id:
            query = query.filter(CustomListItem.tmdb_id == tmdb_id)
        elif media_item_id:
            query = query.filter(CustomListItem.media_item_id == media_item_id)
        else:
            return {"list_ids": []}
            
        list_items = query.all()
        list_ids = list(set([li.list_id for li in list_items]))
        return {"list_ids": list_ids}
    except Exception as e:
        logger.error(f"Error fetching item membership for {item_id}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
