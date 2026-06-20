from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db.base import Session
from app.db.models import VirtualMediaState

from app.api.routes.overrides.logic import _hydrate_virtual_metadata

import logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/virtual-media/track")
def track_virtual_media(payload: dict):
    """Creates a persistent unowned/tracked state for a TMDB-only title or virtual Stash scene."""
    db = Session()
    try:
        tmdb_id = payload.get("tmdb_id")
        media_type = str(payload.get("media_type") or "movie").lower()
        if not tmdb_id:
            return JSONResponse(status_code=400, content={"error": "tmdb_id is required"})
        if media_type not in ("movie", "tv", "scene"):
            return JSONResponse(status_code=400, content={"error": "Invalid media_type"})

        if media_type == "scene":
            from app.db.models import TMDBCache
            scene_uuid = str(tmdb_id)
            if scene_uuid.startswith("stash_"):
                scene_uuid = scene_uuid.split("_")[1]
            try:
                stable_id = int(scene_uuid)
                cache_entry = db.query(TMDBCache).filter(TMDBCache.tmdb_id == stable_id, TMDBCache.cache_key.like("/scene/%")).first()
                if cache_entry:
                    scene_uuid = cache_entry.cache_key.split("/scene/")[1]
            except ValueError:
                pass
            import hashlib
            tmdb_id_int = int.from_bytes(hashlib.md5(scene_uuid.encode("utf-8")).digest()[:8], byteorder="big", signed=True)
        else:
            try:
                tmdb_id_int = int(tmdb_id)
            except (ValueError, TypeError):
                return JSONResponse(status_code=400, content={"error": "tmdb_id must be integer"})

        state = db.query(VirtualMediaState).filter(
            VirtualMediaState.tmdb_id == tmdb_id_int,
            VirtualMediaState.media_type == media_type,
        ).first()
        if not state:
            state = VirtualMediaState(tmdb_id=tmdb_id_int, media_type=media_type, custom_tags=[], is_tracked=True)
            db.add(state)
        else:
            state.is_tracked = True
        db.commit()
        _hydrate_virtual_metadata(db, tmdb_id_int, media_type)

        return {"status": "success", "tmdb_id": tmdb_id, "media_type": media_type, "is_tracked": True}
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
        tmdb_id = payload.get("tmdb_id")
        media_type = str(payload.get("media_type") or "movie").lower()
        if not tmdb_id:
            return JSONResponse(status_code=400, content={"error": "tmdb_id is required"})
        if media_type not in ("movie", "tv", "scene"):
            return JSONResponse(status_code=400, content={"error": "Invalid media_type"})

        if media_type == "scene":
            from app.db.models import TMDBCache
            scene_uuid = str(tmdb_id)
            if scene_uuid.startswith("stash_"):
                scene_uuid = scene_uuid.split("_")[1]
            try:
                stable_id = int(scene_uuid)
                cache_entry = db.query(TMDBCache).filter(TMDBCache.tmdb_id == stable_id, TMDBCache.cache_key.like("/scene/%")).first()
                if cache_entry:
                    scene_uuid = cache_entry.cache_key.split("/scene/")[1]
            except ValueError:
                pass
            import hashlib
            tmdb_id_int = int.from_bytes(hashlib.md5(scene_uuid.encode("utf-8")).digest()[:8], byteorder="big", signed=True)
        else:
            try:
                tmdb_id_int = int(tmdb_id)
            except (ValueError, TypeError):
                return JSONResponse(status_code=400, content={"error": "tmdb_id must be integer"})

        state = db.query(VirtualMediaState).filter(
            VirtualMediaState.tmdb_id == tmdb_id_int,
            VirtualMediaState.media_type == media_type,
        ).first()
        if state:
            state.is_tracked = False
            db.commit()

        return {"status": "success", "tmdb_id": tmdb_id, "media_type": media_type, "is_tracked": False}
    except Exception as e:
        db.rollback()
        logger.error(f"Error untracking virtual media: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
