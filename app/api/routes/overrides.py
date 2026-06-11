from fastapi import APIRouter
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, func
import logging
import os
import threading
import subprocess
import platform
from pathlib import Path
from typing import Optional
from copy import deepcopy
from datetime import datetime

from app.db.base import Session
from app.db.models import *

logger = logging.getLogger(__name__)
router = APIRouter()


def _preferred_metadata_language(db) -> str:
    primary = db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
    if primary and primary.value and primary.value != "none":
        return primary.value
    fallback = db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()
    if fallback and fallback.value and fallback.value != "none":
        return fallback.value
    return "en-US"


def _match_language_code(lang_a: Optional[str], lang_b: Optional[str]) -> bool:
    if not lang_a or not lang_b:
        return False
    a = str(lang_a).lower()
    b = str(lang_b).lower()
    return a == b or a.split("-")[0] == b.split("-")[0]


def _hydrate_virtual_metadata(db, tmdb_id: int, media_type: str) -> None:
    try:
        from app.services.lists_service import _hydrate_virtual_metadata as hydrate_virtual_metadata_for_list

        hydrate_virtual_metadata_for_list(
            db=db,
            tmdb_id=tmdb_id,
            media_type=media_type,
            language=_preferred_metadata_language(db),
        )
    except Exception as exc:
        logger.warning(f"Failed to hydrate virtual metadata for {media_type} {tmdb_id}: {exc}")


def _normalize_user_rating(value):
    if value is None or value == "":
        return None
    try:
        rating = float(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid user_rating")
    rating = max(0.5, min(10.0, rating))
    return round(rating * 2) / 2


def _parse_virtual_episode_item_id(item_id: str):
    parts = str(item_id).split("_")
    if len(parts) != 4 or parts[0] != "tmdb":
        return None
    try:
        return {
            "series_tmdb_id": int(parts[1]),
            "season_number": int(parts[2]),
            "episode_number": int(parts[3]),
        }
    except (TypeError, ValueError):
        return None


def _get_or_create_virtual_media_state(db, tmdb_id: int, media_type: str):
    state = db.query(VirtualMediaState).filter(
        VirtualMediaState.tmdb_id == tmdb_id,
        VirtualMediaState.media_type == media_type,
    ).first()
    if not state:
        state = VirtualMediaState(tmdb_id=tmdb_id, media_type=media_type, custom_tags=[], is_tracked=False)
        db.add(state)
    return state


def _get_or_create_virtual_episode_state(db, series_tmdb_id: int, season_number: int, episode_number: int):
    state = db.query(VirtualEpisodeState).filter(
        VirtualEpisodeState.series_tmdb_id == series_tmdb_id,
        VirtualEpisodeState.season_number == season_number,
        VirtualEpisodeState.episode_number == episode_number,
    ).first()
    if not state:
        state = VirtualEpisodeState(
            series_tmdb_id=series_tmdb_id,
            season_number=season_number,
            episode_number=episode_number,
            is_watched=False,
        )
        db.add(state)
    return state


def _parse_episode_input(val):
    if val is None or val == "":
        return None
    
    if isinstance(val, (int, list)):
        return val
        
    val_str = str(val).strip()
    if not val_str:
        return None
        
    import json
    if val_str.startswith("[") and val_str.endswith("]"):
        try:
            parsed = json.loads(val_str)
            if isinstance(parsed, list):
                return sorted(list(set(int(x) for x in parsed if str(x).isdigit())))
        except:
            pass

    import re
    parts = re.split(r'[,;]+', val_str)
    episodes = set()
    for part in parts:
        part = part.strip()
        if not part:
            continue
        range_match = re.match(r'^(\d+)\s*-\s*(\d+)$', part)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2))
            if start <= end:
                episodes.update(range(start, end + 1))
            else:
                episodes.update(range(end, start + 1))
        elif part.isdigit():
            episodes.add(int(part))
            
    if not episodes:
        return None
        
    sorted_eps = sorted(list(episodes))
    if len(sorted_eps) == 1:
        return sorted_eps[0]
    return sorted_eps


def _apply_media_updates(item, updates):
    try:
        if updates.get("reset_match"):
            item.matches = []
            item.status = ItemStatus.NEW
            item.planned_path = None

        if "item_type" in updates:
            new_type = ItemType(updates["item_type"])
            if item.item_type != new_type:
                item.item_type = new_type
                item.matches = []
                item.status = ItemStatus.NEW
                item.planned_path = None

        if "target_language" in updates:
            item.target_language = updates["target_language"]
        if "edition" in updates:
            item.edition = MovieEdition(updates["edition"])
        if "source" in updates:
            item.source = MediaSource(updates["source"])
        if "audio_type" in updates:
            item.audio_type = MediaAudioType(updates["audio_type"])

        if "part" in updates:
            item.part = int(updates["part"]) if updates["part"] else None
        if "part_type" in updates:
            item.part_type = PartType(updates["part_type"])
        if "part_style" in updates:
            item.part_style = PartStyle(updates["part_style"])
    except ValueError as exc:
        raise ValueError(f"Invalid value for field: {exc}") from exc

    if "season" in updates or "episode" in updates:
        if "season" in updates:
            item.it_season = int(updates["season"]) if updates["season"] else None
        if "episode" in updates:
            ep_val = updates["episode"]
            if isinstance(ep_val, list):
                import json
                item.it_episode = json.dumps(ep_val)
            elif ep_val is not None:
                item.it_episode = str(ep_val).strip()
            else:
                item.it_episode = None

        active_match = next((m for m in item.matches if m.is_active), None)
        if active_match:
            if "season" in updates:
                active_match.season_number = int(updates["season"]) if updates["season"] else None
            if "episode" in updates:
                active_match.episode_number = _parse_episode_input(updates["episode"])
            active_match.item_type = ItemType.EPISODE
            item.item_type = ItemType.EPISODE


def _apply_extra_updates(extra, updates):
    try:
        if "subtype" in updates:
            extra.subtype = ExtraSubtype(updates["subtype"])
        if "language" in updates:
            extra.language = updates["language"]
        if "parent_id" in updates:
            extra.parent_item_id = int(updates["parent_id"]) if updates["parent_id"] else extra.parent_item_id
    except ValueError as exc:
        raise ValueError(f"Invalid value for field: {exc}") from exc


def _build_media_item_from_extra(extra, target_item_type: str):
    path = Path(extra.current_path or extra.original_path)
    stat = path.stat() if path.exists() else None
    return MediaItem(
        item_type=ItemType(target_item_type),
        original_path=extra.original_path,
        current_path=extra.current_path,
        filename=path.name,
        extension=extra.extension,
        size=stat.st_size if stat else 0,
        mtime=stat.st_mtime if stat else None,
        folder_name=path.parent.name if path.parent else None,
        status=ItemStatus.NEW,
        category="video",
        target_language="en",
        file_hash=extra.file_hash,
    )


def _convert_extra_to_media(db, extra, target_item_type: str):
    item = _build_media_item_from_extra(extra, target_item_type)
    db.add(item)
    db.flush()
    db.delete(extra)
    return item


def _convert_media_to_bonus_extra(db, item, parent_id: Optional[str], subtype: Optional[str] = None):
    if not parent_id:
        raise ValueError("parent_id is required for bonus video conversion")
    if item.extras:
        raise ValueError("Cannot convert media with attached extras to bonus video")

    parent = db.query(MediaItem).filter(MediaItem.id == int(parent_id)).first()
    if not parent:
        raise ValueError("Parent media item not found")
    if parent.id == item.id:
        raise ValueError("A media item cannot be its own parent")

    target_subtype = ExtraSubtype.OTHER
    if subtype:
        try:
            target_subtype = ExtraSubtype(subtype)
        except ValueError:
            pass

    extra = ExtraFile(
        parent_item_id=parent.id,
        category=ExtraCategory.VIDEO,
        subtype=target_subtype,
        original_path=item.original_path,
        current_path=item.current_path,
        extension=item.extension,
        language=None,
    )
    db.add(extra)
    db.flush()
    db.delete(item)
    return parent


def _refresh_planned_path(db, item):
    from app.formatter.formatter import Formatter, FormatterConfig
    from app.db.models import MetadataLocalization

    formatter = Formatter(FormatterConfig.from_db(db))
    active_match = next((m for m in item.matches if m.is_active), None)
    if not active_match:
        return

    loc = None
    if item.target_language:
        db_loc = db.query(MetadataLocalization).filter(
            MetadataLocalization.match_id == active_match.id
        ).all()
        loc = next((entry for entry in db_loc if _match_language_code(entry.target_language, item.target_language)), None)
    if not loc and active_match.localizations:
        loc = next((entry for entry in active_match.localizations if entry.is_primary), active_match.localizations[0])
    if not loc:
        return

    preview = formatter.format_item(item, active_match, loc)
    if preview.target_subpath:
        item.planned_path = str(preview.target_path).replace("\\", "/")
    else:
        item.planned_path = str(preview.target_path).replace("\\", "/")


def _sync_target_language_metadata(db, item):
    active_match = next((m for m in item.matches if m.is_active), None)
    target_language = item.target_language
    if not active_match or not target_language:
        return

    from app.services.metadata_enrichment_service import MetadataEnrichmentService

    MetadataEnrichmentService(db).enrich_matched_item(
        item,
        language=target_language,
        fallback_language=None,
    )


@router.post("/virtual-media/track")
def track_virtual_media(payload: dict):
    """Creates a persistent unowned/tracked state for a TMDB-only title."""
    db = Session()
    try:
        from app.db.models.media import VirtualMediaState

        tmdb_id = payload.get("tmdb_id")
        media_type = str(payload.get("media_type") or "movie").lower()
        if not tmdb_id:
            return JSONResponse(status_code=400, content={"error": "tmdb_id is required"})
        if media_type not in ("movie", "tv"):
            return JSONResponse(status_code=400, content={"error": "Invalid media_type"})

        state = db.query(VirtualMediaState).filter(
            VirtualMediaState.tmdb_id == int(tmdb_id),
            VirtualMediaState.media_type == media_type,
        ).first()
        if not state:
            state = VirtualMediaState(tmdb_id=int(tmdb_id), media_type=media_type, custom_tags=[], is_tracked=True)
            db.add(state)
        else:
            state.is_tracked = True
        db.commit()
        _hydrate_virtual_metadata(db, int(tmdb_id), media_type)

        return {"status": "success", "tmdb_id": int(tmdb_id), "media_type": media_type, "is_tracked": True}
    except Exception as e:
        db.rollback()
        logger.error(f"Error tracking virtual media: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/virtual-media/untrack")
def untrack_virtual_media(payload: dict):
    """Keeps cached/user state but removes the item from tracked/unowned visibility."""
    db = Session()
    try:
        from app.db.models.media import VirtualMediaState

        tmdb_id = payload.get("tmdb_id")
        media_type = str(payload.get("media_type") or "movie").lower()
        if not tmdb_id:
            return JSONResponse(status_code=400, content={"error": "tmdb_id is required"})
        if media_type not in ("movie", "tv"):
            return JSONResponse(status_code=400, content={"error": "Invalid media_type"})

        state = db.query(VirtualMediaState).filter(
            VirtualMediaState.tmdb_id == int(tmdb_id),
            VirtualMediaState.media_type == media_type,
        ).first()
        if state:
            state.is_tracked = False
            db.commit()

        return {"status": "success", "tmdb_id": int(tmdb_id), "media_type": media_type, "is_tracked": False}
    except Exception as e:
        db.rollback()
        logger.error(f"Error untracking virtual media: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/media/update")
def update_media_item(payload: dict):
    """Updates media item or extra file properties manually."""
    db = Session()
    try:
        from app.db.models import MediaItem, ExtraFile
        
        item_id = payload.get("id")
        item_type = payload.get("type", "media")
        updates = payload.get("updates", {})
        
        if item_type == "media":
            item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
            if not item:
                return JSONResponse(status_code=404, content={"error": "Media item not found"})
            requested_main_type = updates.get("main_type")
            if requested_main_type == "bonus":
                item = _convert_media_to_bonus_extra(db, item, updates.get("parent_id"), updates.get("subtype"))
            else:
                if requested_main_type in {"movie", "episode"}:
                    updates = {**deepcopy(updates), "item_type": requested_main_type}
                _apply_media_updates(item, updates)
                if "target_language" in updates:
                    _sync_target_language_metadata(db, item)
        else:
            extra = db.query(ExtraFile).filter(ExtraFile.id == item_id).first()
            if not extra:
                return JSONResponse(status_code=404, content={"error": "Extra file not found"})
            requested_main_type = updates.get("main_type")
            if requested_main_type in {"movie", "episode"}:
                item = _convert_extra_to_media(db, extra, requested_main_type)
                if requested_main_type == "episode":
                    _apply_media_updates(item, updates)
            else:
                _apply_extra_updates(extra, updates)
                item = extra.parent_item

        _refresh_planned_path(db, item)
        db.commit()
        return {"status": "success"}
    except ValueError as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Error updating media: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/media/bulk-update")
def bulk_update_media_items(payload: dict):
    """Bulk updates media items or extra files with the same manual overrides."""
    db = Session()
    try:
        from app.db.models import MediaItem, ExtraFile

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

@router.post("/item/{item_id}/status")
def update_item_status(item_id: str, payload: dict):
    """Updates the status (user_rating, is_watched) of a media item."""
    db = Session()
    try:
        from app.db.models import MediaItem
        from app.db.models.media import Tag, VirtualMediaState

        is_virtual = isinstance(item_id, str) and item_id.startswith("tmdb_")

        if is_virtual:
            media_type = str(payload.get("media_type") or "movie").lower()
            virtual_episode_key = _parse_virtual_episode_item_id(item_id) if media_type == "episode" else None

            if media_type == "episode":
                if not virtual_episode_key:
                    return JSONResponse(status_code=400, content={"error": "Invalid virtual episode id"})
                state = _get_or_create_virtual_episode_state(
                    db,
                    virtual_episode_key["series_tmdb_id"],
                    virtual_episode_key["season_number"],
                    virtual_episode_key["episode_number"],
                )
                if "is_watched" in payload:
                    state.is_watched = bool(payload["is_watched"])
                    if state.is_watched:
                        parent_state = _get_or_create_virtual_media_state(
                            db,
                            virtual_episode_key["series_tmdb_id"],
                            "tv",
                        )
                        parent_state.is_tracked = True
                db.commit()
                return JSONResponse(content={
                    "id": item_id,
                    "is_watched": state.is_watched,
                    "watch_count": 1 if state.is_watched else 0,
                    "resume_position": 0,
                    "last_watched_at": None,
                    "playback_logs": [],
                })

            if media_type not in ("movie", "tv"):
                return JSONResponse(status_code=400, content={"error": "Invalid media_type"})

            try:
                tmdb_id = int(item_id.split("_")[1])
            except (ValueError, IndexError):
                return JSONResponse(status_code=400, content={"error": "Invalid virtual item id"})

            state = _get_or_create_virtual_media_state(db, tmdb_id, media_type)

            if "is_watched" in payload:
                state.is_watched = bool(payload["is_watched"])
                if state.is_watched:
                    state.is_tracked = True
            if "user_rating" in payload:
                state.user_rating = _normalize_user_rating(payload["user_rating"])
                state.user_rating_at = datetime.utcnow() if state.user_rating is not None else None
                if state.user_rating is not None:
                    state.is_tracked = True
            if "user_comment" in payload:
                state.user_comment = payload["user_comment"] if payload["user_comment"] else None
            if "custom_tags" in payload:
                new_tag_names = [str(t).strip() for t in payload["custom_tags"] if str(t).strip()]
                for name in new_tag_names:
                    existing = db.query(Tag).filter(Tag.name == name).first()
                    if not existing:
                        db.add(Tag(name=name))
                db.commit()
                state.custom_tags = new_tag_names

            db.commit()
            if state.is_tracked:
                _hydrate_virtual_metadata(db, tmdb_id, media_type)
            tag_entities = db.query(Tag).filter(Tag.name.in_(state.custom_tags or [])).all() if state.custom_tags else []
            return JSONResponse(content={
                "id": item_id,
                "user_rating": state.user_rating,
                "user_comment": state.user_comment,
                "is_watched": state.is_watched,
                "watch_count": 1 if state.is_watched else 0,
                "resume_position": 0,
                "last_watched_at": None,
                "playback_logs": [],
                "custom_tags": state.custom_tags or [],
                "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tag_entities],
            })

        item = db.query(MediaItem).filter(MediaItem.id == int(item_id)).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found"})

        media_type = str(payload.get("media_type") or "").lower()
        if media_type in ("tv", "series"):
            active_match = next((m for m in item.matches if m.is_active), None)
            series_tmdb_id = None
            if active_match:
                series_tmdb_id = active_match.series_tmdb_id or active_match.tmdb_id
            if series_tmdb_id:
                state = _get_or_create_virtual_media_state(db, series_tmdb_id, "tv")
                if "user_rating" in payload:
                    state.user_rating = _normalize_user_rating(payload["user_rating"])
                    state.user_rating_at = datetime.utcnow() if state.user_rating is not None else None
                if "user_comment" in payload:
                    state.user_comment = payload["user_comment"] if payload["user_comment"] else None
                if "custom_tags" in payload:
                    new_tag_names = [str(t).strip() for t in payload["custom_tags"] if str(t).strip()]
                    for name in new_tag_names:
                        existing = db.query(Tag).filter(Tag.name == name).first()
                        if not existing:
                            db.add(Tag(name=name))
                    db.commit()
                    state.custom_tags = new_tag_names

        if "user_rating" in payload:
            item.user_rating = _normalize_user_rating(payload["user_rating"])
            item.user_rating_at = datetime.utcnow() if item.user_rating is not None else None
        if "user_comment" in payload:
            item.user_comment = payload["user_comment"] if payload["user_comment"] else None
        if "is_watched" in payload:
            item.is_watched = bool(payload["is_watched"])
            if item.is_watched:
                item.resume_position = 0
        if "custom_tags" in payload:
            new_tag_names = [str(t).strip() for t in payload["custom_tags"] if str(t).strip()]
            for name in new_tag_names:
                existing = db.query(Tag).filter(Tag.name == name).first()
                if not existing:
                    db.add(Tag(name=name))
            db.commit()

            if new_tag_names:
                actual_tags = db.query(Tag).filter(Tag.name.in_(new_tag_names)).all()
                item.tags = actual_tags
            else:
                item.tags = []
                
        db.commit()
        return JSONResponse(content={
            "id": item.id,
            "user_rating": item.user_rating,
            "user_comment": item.user_comment,
            "is_watched": item.is_watched,
            "custom_tags": [t.name for t in item.tags] if item.tags else [],
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in item.tags]
        })
    except Exception as e:
        db.rollback()
        if isinstance(e, ValueError):
            return JSONResponse(status_code=400, content={"error": str(e)})
        logger.error(f"Error updating item status: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.post("/item/{item_id}/retry-image")
def retry_item_image(item_id: int):
    """Forces a redownload of the image for a specific item by resetting its local paths and status."""
    from app.db.models import MediaItem, ItemType, ImageStatus, TMDBCache
    from app.services.metadata_enrichment_service import MetadataEnrichmentService
    db = Session()
    try:
        item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
        if not item:
            return {"error": "Item not found"}
            
        match = next((m for m in item.matches if m.is_active), None)
        if not match:
            return {"error": "No active match found for item"}
            
        # 1. Clear TMDB cache so we query the network for fresh metadata
        if item.item_type == ItemType.EPISODE:
            s_num = match.season_number if match.season_number is not None else item.fn_season
            e_num = match.episode_number if match.episode_number is not None else item.fn_episode
            if isinstance(e_num, list) and len(e_num) > 0:
                e_num = e_num[0]
            
            series_id = match.series_tmdb_id or match.tmdb_id
            if series_id and s_num is not None and e_num is not None:
                db.query(TMDBCache).filter(
                    TMDBCache.cache_key.like(f"/tv/{series_id}/season/{s_num}/episode/{e_num}%")
                ).delete(synchronize_session=False)
        elif item.item_type == ItemType.SERIES:
            db.query(TMDBCache).filter(
                TMDBCache.cache_key.like(f"/tv/{match.tmdb_id}%")
            ).delete(synchronize_session=False)
        else:
            db.query(TMDBCache).filter(
                TMDBCache.cache_key.like(f"/movie/{match.tmdb_id}%")
            ).delete(synchronize_session=False)

        db.commit()

        # 2. Re-enrich metadata using the network
        try:
            lang = item.target_language or _preferred_metadata_language(db) or "en-US"
            enricher = MetadataEnrichmentService(db)
            enricher.enrich_matched_item(item, language=lang)
        except Exception as enrich_err:
            logger.warning(f"Metadata re-enrichment failed during retry-image: {enrich_err}")

        # 3. Clear local image paths to force redownload
        for loc in match.localizations:
            if item.item_type == ItemType.EPISODE:
                loc.local_still_path = None
                loc.local_all_stills = None
            else:
                loc.local_poster_path = None
                loc.local_series_poster_path = None
                loc.local_logo_path = None
                loc.local_backdrop_path = None
                loc.local_thumb_path = None

        match.image_status = ImageStatus.PENDING
        db.commit()
        return {"status": "success", "message": "Image queued for retry"}
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
        from app.db.models.media import MediaItem, Tag
        
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
