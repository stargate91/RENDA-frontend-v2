from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy.orm import joinedload
from copy import deepcopy

from app.db.base import Session
from app.db.models import MediaItem, ExtraFile, Tag

from app.api.routes.overrides.logic import (
    _convert_media_to_bonus_extra,
    _refresh_planned_path,
    _apply_media_updates,
    _sync_target_language_metadata,
    _convert_extra_to_media,
    _apply_extra_updates,
    _parse_virtual_episode_item_id,
    _get_or_create_virtual_episode_state,
    _get_or_create_virtual_media_state,
)

import logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/media/bulk-update")
def bulk_update_media_items(payload: dict):
    """Bulk updates media items or extra files with the same manual overrides."""
    db = Session()
    try:
        raw_ids = payload.get("ids") or []
        target_type = str(payload.get("type") or "media").strip().lower()
        updates = payload.get("updates") or {}
        item_updates = payload.get("item_updates") or []

        ids = []
        for raw_id in raw_ids:
            try:
                ids.append(int(raw_id))
            except (TypeError, ValueError):
                logger.warning(f"Ignoring invalid bulk update id: {raw_id}")

        if target_type not in {"media", "extra"}:
            return JSONResponse(status_code=400, content={"error": "Invalid bulk update type"})
        if not ids:
            return JSONResponse(status_code=400, content={"error": "No valid ids provided"})

        touched_parent_ids = set()
        updated_ids = []

        if target_type == "media":
            items = db.query(MediaItem).filter(MediaItem.id.in_(ids)).all()
            if not items:
                return JSONResponse(status_code=404, content={"error": "No matching media items found"})
            requested_main_type = updates.get("main_type")
            if requested_main_type == "bonus":
                for item in items:
                    parent = _convert_media_to_bonus_extra(db, item, updates.get("parent_id"), updates.get("subtype"))
                    _refresh_planned_path(db, parent)
                    updated_ids.append(item.id)
                db.commit()
                return {
                    "status": "success",
                    "updated_ids": updated_ids,
                    "type": target_type,
                }

            item_updates_map = {}
            for entry in item_updates:
                try:
                    entry_id = int(entry.get("id"))
                except (TypeError, ValueError):
                    continue
                per_item_updates = entry.get("updates") or {}
                item_updates_map[entry_id] = {**updates, **per_item_updates}

            for item in items:
                effective_updates = item_updates_map.get(item.id, updates)
                if effective_updates.get("main_type") in {"movie", "episode"}:
                    effective_updates = {**deepcopy(effective_updates), "item_type": effective_updates["main_type"]}
                _apply_media_updates(item, effective_updates)
                if "target_language" in effective_updates:
                    _sync_target_language_metadata(db, item)
                _refresh_planned_path(db, item)
                updated_ids.append(item.id)
        else:
            extras = db.query(ExtraFile).options(joinedload(ExtraFile.parent_item).joinedload(MediaItem.matches)).filter(ExtraFile.id.in_(ids)).all()
            if not extras:
                return JSONResponse(status_code=404, content={"error": "No matching extra files found"})
            requested_main_type = updates.get("main_type")
            if requested_main_type in {"movie", "episode"}:
                item_updates_map = {}
                for entry in item_updates:
                    try:
                        entry_id = int(entry.get("id"))
                    except (TypeError, ValueError):
                        continue
                    per_item_updates = entry.get("updates") or {}
                    item_updates_map[entry_id] = {**updates, **per_item_updates}

                for extra in extras:
                    item = _convert_extra_to_media(db, extra, requested_main_type)
                    effective_updates = item_updates_map.get(extra.id, updates)
                    if effective_updates.get("main_type") in {"movie", "episode"}:
                        effective_updates = {**deepcopy(effective_updates), "item_type": effective_updates["main_type"]}
                    _apply_media_updates(item, effective_updates)
                    if "target_language" in effective_updates:
                        _sync_target_language_metadata(db, item)
                    _refresh_planned_path(db, item)
                    updated_ids.append(item.id)
                db.commit()
                return {
                    "status": "success",
                    "updated_ids": updated_ids,
                    "type": target_type,
                }
            for extra in extras:
                _apply_extra_updates(extra, updates)
                if extra.parent_item_id:
                    touched_parent_ids.add(extra.parent_item_id)
                updated_ids.append(extra.id)

            if touched_parent_ids:
                parents = db.query(MediaItem).filter(MediaItem.id.in_(touched_parent_ids)).all()
                for parent in parents:
                    _refresh_planned_path(db, parent)

        db.commit()
        return {
            "status": "success",
            "updated_ids": updated_ids,
            "type": target_type,
        }
    except ValueError as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk updating media: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/media/bulk-tags")
def bulk_update_item_tags(payload: dict):
    """Bulk adds or removes tags from multiple media items."""
    raw_item_ids = payload.get("item_ids", [])
    item_ids = []
    for raw_id in raw_item_ids:
        try:
            item_ids.append(int(raw_id))
        except (TypeError, ValueError):
            logger.warning(f"Ignoring non-media item id in bulk tag update: {raw_id}")

    add_tag_names = list(dict.fromkeys(str(t).strip() for t in payload.get("add_tags", []) if str(t).strip()))
    remove_tag_names = list(dict.fromkeys(str(t).strip() for t in payload.get("remove_tags", []) if str(t).strip()))
    
    if not item_ids:
        return JSONResponse(status_code=400, content={"error": "No valid media item ids provided"})
        
    db = Session()
    try:
        # 1. Create any missing tags that are to be added
        for name in add_tag_names:
            existing = db.query(Tag).filter(Tag.name == name).first()
            if not existing:
                new_tag = Tag(name=name, color="#1e90ff")
                db.add(new_tag)
        db.commit()
        
        # Fetch the Tag entities to add/remove
        tags_to_add = db.query(Tag).filter(Tag.name.in_(add_tag_names)).all() if add_tag_names else []
        tags_to_remove = db.query(Tag).filter(Tag.name.in_(remove_tag_names)).all() if remove_tag_names else []
        
        # 2. Update each media item
        items = db.query(MediaItem).filter(MediaItem.id.in_(item_ids)).all()
        if not items:
            return JSONResponse(status_code=404, content={"error": "No matching media items found"})

        updated_count = 0
        for item in items:
            current_tags_map = {t.id: t for t in item.tags}
            changed = False
            
            # Remove tags
            for t_rem in tags_to_remove:
                if t_rem.id in current_tags_map:
                    item.tags.remove(current_tags_map[t_rem.id])
                    changed = True
            
            # Add tags
            for t_add in tags_to_add:
                if t_add.id not in current_tags_map:
                    item.tags.append(t_add)
                    changed = True

            if changed:
                updated_count += 1
                    
        db.commit()
        return {
            "status": "success",
            "matched_count": len(items),
            "updated_count": updated_count,
            "added_tags": [t.name for t in tags_to_add],
            "removed_tags": [t.name for t in tags_to_remove]
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk updating item tags: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/media/bulk-watched")
def bulk_update_item_watched(payload: dict):
    """Bulk updates watched state for physical media items and virtual episodes."""
    db = Session()
    try:
        from app.db.models import MediaItem

        raw_ids = payload.get("item_ids") or []
        watched = bool(payload.get("is_watched", True))
        item_ids = []
        virtual_episode_ids = []
        for raw_id in raw_ids:
            try:
                if isinstance(raw_id, str) and raw_id.startswith("tmdb_"):
                    episode_key = _parse_virtual_episode_item_id(raw_id)
                    if episode_key:
                        virtual_episode_ids.append((raw_id, episode_key))
                        continue
                item_ids.append(int(raw_id))
            except (TypeError, ValueError):
                logger.warning(f"Ignoring non-media item id in bulk watched update: {raw_id}")

        if not item_ids and not virtual_episode_ids:
            return JSONResponse(status_code=400, content={"error": "No valid item_ids provided"})

        items = db.query(MediaItem).filter(MediaItem.id.in_(item_ids)).all()
        for item in items:
            item.is_watched = watched
            if watched:
                item.resume_position = 0
                if not item.watch_count:
                    item.watch_count = 1
            else:
                item.watch_count = 0

            # Sync watched state to VirtualMediaState
            active_match = next((m for m in item.matches if m.is_active), None)
            if active_match:
                from app.db.models import ItemType
                v_media_type = "tv" if item.item_type == ItemType.EPISODE else "movie"
                v_tmdb_id = active_match.series_tmdb_id or active_match.tmdb_id if v_media_type == "tv" else active_match.tmdb_id
                if v_tmdb_id:
                    v_state = _get_or_create_virtual_media_state(db, v_tmdb_id, v_media_type)
                    if v_media_type == "tv":
                        # For series, only track — don't overwrite aggregate is_watched
                        if watched:
                            v_state.is_tracked = True
                    else:
                        v_state.is_watched = watched
                        if watched:
                            v_state.is_tracked = True

        updated_ids = [item.id for item in items]
        for raw_id, episode_key in virtual_episode_ids:
            state = _get_or_create_virtual_episode_state(
                db,
                episode_key["series_tmdb_id"],
                episode_key["season_number"],
                episode_key["episode_number"],
            )
            state.is_watched = watched
            if watched:
                parent_state = _get_or_create_virtual_media_state(
                    db,
                    episode_key["series_tmdb_id"],
                    "tv",
                )
                parent_state.is_tracked = True
            updated_ids.append(raw_id)

        db.commit()
        return {
            "status": "success",
            "updated_ids": updated_ids,
            "is_watched": watched,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk updating watched state: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
