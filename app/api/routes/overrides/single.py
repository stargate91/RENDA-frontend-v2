from fastapi import APIRouter
from fastapi.responses import JSONResponse
from datetime import datetime
from copy import deepcopy

from app.db.base import Session
from app.db.models import (
    MediaItem,
    ExtraFile,
    Tag,
    TMDBCache,
    MediaMatch,
)

from app.api.routes.overrides.logic import (
    _convert_media_to_bonus_extra,
    _apply_media_updates,
    _sync_target_language_metadata,
    _convert_extra_to_media,
    _apply_extra_updates,
    _refresh_planned_path,
    _parse_virtual_episode_item_id,
    _get_or_create_virtual_episode_state,
    _get_or_create_virtual_media_state,
    _normalize_user_rating,
    _preferred_metadata_language,
    _hydrate_virtual_metadata,
)
from app.utils.library_utils.image_constants import BACKDROP_SIZE

import logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/media/update")
def update_media_item(payload: dict):
    """Updates media item or extra file properties manually."""
    db = Session()
    try:
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


@router.post("/item/{item_id}/status")
def update_item_status(item_id: str, payload: dict):
    """Updates the status (user_rating, is_watched) of a media item."""
    db = Session()
    try:
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
                cache = db.query(TMDBCache).filter(TMDBCache.tmdb_id == tmdb_id).first()
                is_item_adult = bool(cache.raw_data.get("adult", False)) if (cache and cache.raw_data) else False

                new_tag_names = [str(t).strip() for t in payload["custom_tags"] if str(t).strip()]
                for name in new_tag_names:
                    existing = db.query(Tag).filter(Tag.name == name, Tag.is_adult == is_item_adult).first()
                    if not existing:
                        db.add(Tag(name=name, is_adult=is_item_adult))
                db.commit()
                state.custom_tags = new_tag_names
                if new_tag_names:
                    state.is_tracked = True

            db.commit()
            if state.is_tracked:
                _hydrate_virtual_metadata(db, tmdb_id, media_type)
            tag_entities = db.query(Tag).filter(Tag.name.in_(state.custom_tags or []), Tag.is_adult == is_item_adult).all() if state.custom_tags else []
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
                    is_item_adult = bool(active_match.is_adult) if active_match else False
                    new_tag_names = [str(t).strip() for t in payload["custom_tags"] if str(t).strip()]
                    for name in new_tag_names:
                        existing = db.query(Tag).filter(Tag.name == name, Tag.is_adult == is_item_adult).first()
                        if not existing:
                            db.add(Tag(name=name, is_adult=is_item_adult))
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
                if not item.watch_count:
                    item.watch_count = 1
            else:
                item.watch_count = 0

            # Sync watched state to VirtualMediaState so it persists independently
            active_match = next((m for m in item.matches if m.is_active), None)
            if active_match:
                v_media_type = media_type if media_type in ("movie", "tv", "series") else None
                if not v_media_type:
                    from app.db.models import ItemType
                    v_media_type = "tv" if item.item_type == ItemType.EPISODE else "movie"
                if v_media_type in ("series",):
                    v_media_type = "tv"
                v_tmdb_id = active_match.tmdb_id
                if v_media_type == "tv":
                    v_tmdb_id = active_match.series_tmdb_id or active_match.tmdb_id
                if v_tmdb_id:
                    v_state = _get_or_create_virtual_media_state(db, v_tmdb_id, v_media_type)
                    if v_media_type == "tv":
                        # For series, only track — don't overwrite aggregate is_watched
                        if item.is_watched:
                            v_state.is_tracked = True
                    else:
                        v_state.is_watched = item.is_watched
                        if item.is_watched:
                            v_state.is_tracked = True
        if "custom_tags" in payload:
            active_match = next((m for m in item.matches if m.is_active), None)
            is_item_adult = bool(active_match.is_adult) if active_match else False

            new_tag_names = [str(t).strip() for t in payload["custom_tags"] if str(t).strip()]
            for name in new_tag_names:
                existing = db.query(Tag).filter(Tag.name == name, Tag.is_adult == is_item_adult).first()
                if not existing:
                    db.add(Tag(name=name, is_adult=is_item_adult))
            db.commit()

            if new_tag_names:
                actual_tags = db.query(Tag).filter(Tag.name.in_(new_tag_names), Tag.is_adult == is_item_adult).all()
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
    from app.db.models import ItemType, ImageStatus
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
            lang = item.locale or _preferred_metadata_language(db) or "en-US"
            enricher = MetadataEnrichmentService(db)
            enricher.enrich_matched_item(item, language=lang)
        except Exception as enrich_err:
            logger.warning(f"Metadata re-enrichment failed during retry-image: {enrich_err}")

        # 3. Clear local image paths to force redownload
        if item.item_type == ItemType.EPISODE:
            match.local_still_path = None
            match.local_all_stills = None
        else:
            match.local_backdrop_path = None
            for loc in match.localizations:
                loc.local_poster_path = None
                loc.local_series_poster_path = None
                loc.local_logo_path = None

        match.image_status = ImageStatus.PENDING
        db.commit()
        return {"status": "success", "message": "Image queued for retry"}
    finally:
        db.close()


@router.post("/item/{item_id}/backdrop")
def update_item_backdrop(item_id: str, payload: dict):
    backdrop_path = payload.get("backdrop_path")
    if not backdrop_path:
        return JSONResponse(status_code=400, content={"error": "backdrop_path is required"})

    db = Session()
    try:
        from app.services.asset_service import AssetService
        if isinstance(item_id, str) and item_id.startswith("tmdb_"):
            try:
                tmdb_id = int(item_id.split("_")[1])
            except (ValueError, IndexError):
                return JSONResponse(status_code=400, content={"error": "Invalid TMDB ID format"})

            asset_service = AssetService()
            local_b = asset_service.download_image(backdrop_path, "backdrops", size=BACKDROP_SIZE)
            if not local_b:
                return JSONResponse(status_code=500, content={"error": "Failed to download backdrop"})

            cache_rows = db.query(TMDBCache).filter(TMDBCache.tmdb_id == tmdb_id).all()
            for cache in cache_rows:
                if not isinstance(cache.raw_data, dict):
                    continue
                raw_data = deepcopy(cache.raw_data)
                raw_data["backdrop_path"] = backdrop_path
                cache.raw_data = raw_data

            db.commit()
            return {"status": "success", "backdrop_path": backdrop_path, "local_backdrop_path": local_b}
        
        target_item_id = None
        if isinstance(item_id, str) and item_id.startswith("series_"):
            try:
                series_tmdb_id = int(item_id.split("_")[1])
            except (ValueError, IndexError):
                return JSONResponse(status_code=400, content={"error": "Invalid series ID format"})
            
            match_row = db.query(MediaMatch).filter(
                (MediaMatch.series_tmdb_id == series_tmdb_id) | (MediaMatch.tmdb_id == series_tmdb_id),
                MediaMatch.is_active == True
            ).first()
            if not match_row:
                return JSONResponse(status_code=404, content={"error": "Series not found"})
            target_item_id = match_row.media_item_id
        else:
            try:
                target_item_id = int(item_id)
            except ValueError:
                return JSONResponse(status_code=400, content={"error": "Invalid item ID format"})

        item = db.query(MediaItem).filter(MediaItem.id == target_item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found"})

        active_match = next((m for m in item.matches if m.is_active), None)
        if not active_match:
            return JSONResponse(status_code=404, content={"error": "No active match found for this item"})

        # Download the image
        asset_service = AssetService()
        local_b = asset_service.download_image(backdrop_path, "backdrops", size=BACKDROP_SIZE)
        if not local_b:
            return JSONResponse(status_code=500, content={"error": "Failed to download backdrop"})

        # Update match properties
        active_match.backdrop_path = backdrop_path
        active_match.local_backdrop_path = local_b

        db.commit()
        return {"status": "success", "backdrop_path": backdrop_path, "local_backdrop_path": local_b}
    except Exception as e:
        db.rollback()
        logger.error(f"Error overriding backdrop: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
