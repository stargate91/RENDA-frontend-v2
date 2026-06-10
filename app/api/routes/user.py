import logging
from datetime import datetime
from urllib.parse import parse_qs, urlsplit
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import joinedload

from app.db.base import Session
from app.db.models.media import CustomListItem, MediaItem, VirtualMediaState
from app.db.models.metadata import MediaMatch, MetadataLocalization, TMDBCache
from app.db.models.person import MediaPersonLink, Person, PersonLocalization
from app.db.models.enums import ItemStatus, ItemType
from app.utils.library_utils import (
    _public_image_path,
    _preferred_metadata_languages,
    _pick_match_localization,
    _resolve_virtual_catalog_metadata,
)
from app.utils.people_utils import _normalize_user_rating, _pick_person_localization, _resolve_person_profile_path

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/user/catalog")
def get_user_catalog(
    unrated: bool = False,
    tab: str = None,
    offset: int = 0,
    limit: int = 40,
    search: str = "",
    sort_by: str = "title_asc",
    rating_filter: str = "all",
    exact_rating: float | None = None,
    favorite_only: bool = False,
    people_role: str = "all",
):
    db = Session()
    try:
        from app.services.catalog.catalog_service import UserCatalogService
        service = UserCatalogService(db)
        return service.get_user_catalog(
            unrated=unrated,
            tab=tab,
            offset=offset,
            limit=limit,
            search=search,
            sort_by=sort_by,
            rating_filter=rating_filter,
            exact_rating=exact_rating,
            favorite_only=favorite_only,
            people_role=people_role,
        )
    finally:
        db.close()


@router.post("/user/catalog/bulk-status")
def bulk_update_catalog_status(payload: dict):
    db = Session()
    try:
        from app.api.routes.overrides import _get_or_create_virtual_media_state, _hydrate_virtual_metadata

        tab = str(payload.get("tab") or "").strip().lower()
        updates = payload.get("updates") or {}
        raw_ids = payload.get("ids") or []

        if tab not in {"movies", "series", "people", "actors", "directors"}:
            return JSONResponse(status_code=400, content={"error": "Invalid catalog tab"})
        if not raw_ids:
            return JSONResponse(status_code=400, content={"error": "No ids provided"})

        normalized_updates = {}
        if "is_favorite" in updates and tab in {"people", "actors", "directors"}:
            normalized_updates["is_favorite"] = bool(updates["is_favorite"])
        if "user_rating" in updates:
            normalized_updates["user_rating"] = _normalize_user_rating(updates["user_rating"])

        if not normalized_updates:
            return JSONResponse(status_code=400, content={"error": "No supported updates provided"})

        updated_ids = []

        if tab in {"people", "actors", "directors"}:
            person_ids = []
            for raw_id in raw_ids:
                try:
                    person_ids.append(int(raw_id))
                except (TypeError, ValueError):
                    continue

            if not person_ids:
                return JSONResponse(status_code=400, content={"error": "No valid person ids provided"})

            people = db.query(Person).filter(Person.id.in_(person_ids)).all()
            for person in people:
                if "is_favorite" in normalized_updates:
                    person.is_favorite = normalized_updates["is_favorite"]
                if "user_rating" in normalized_updates:
                    person.user_rating = normalized_updates["user_rating"]
                    person.user_rating_at = datetime.utcnow() if person.user_rating is not None else None
                updated_ids.append(person.id)

            db.commit()
            return {"status": "success", "tab": tab, "updated_ids": updated_ids}

        media_type = "tv" if tab == "series" else "movie"
        physical_ids = []
        virtual_tmdb_ids = []

        for raw_id in raw_ids:
            value = str(raw_id or "").strip()
            if not value:
                continue
            if value.startswith("tmdb_"):
                try:
                    virtual_tmdb_ids.append(int(value.split("_", 1)[1]))
                except (TypeError, ValueError, IndexError):
                    continue
            else:
                try:
                    physical_ids.append(int(value))
                except (TypeError, ValueError):
                    continue

        touched_virtual_ids = set()

        if physical_ids:
            items = db.query(MediaItem).options(joinedload(MediaItem.matches)).filter(MediaItem.id.in_(physical_ids)).all()
            for item in items:
                if "user_rating" in normalized_updates:
                    item.user_rating = normalized_updates["user_rating"]
                    item.user_rating_at = datetime.utcnow() if item.user_rating is not None else None

                if media_type == "tv":
                    active_match = next((match for match in item.matches if match.is_active), None)
                    series_tmdb_id = None
                    if active_match:
                        series_tmdb_id = active_match.series_tmdb_id or active_match.tmdb_id
                    if series_tmdb_id:
                        state = _get_or_create_virtual_media_state(db, series_tmdb_id, "tv")
                        if "user_rating" in normalized_updates:
                            state.user_rating = normalized_updates["user_rating"]
                            state.user_rating_at = datetime.utcnow() if state.user_rating is not None else None
                        touched_virtual_ids.add(series_tmdb_id)

                updated_ids.append(item.id)

        for tmdb_id in virtual_tmdb_ids:
            state = _get_or_create_virtual_media_state(db, tmdb_id, media_type)
            if "user_rating" in normalized_updates:
                state.user_rating = normalized_updates["user_rating"]
                state.user_rating_at = datetime.utcnow() if state.user_rating is not None else None
                if state.user_rating is not None:
                    state.is_tracked = True
            touched_virtual_ids.add(tmdb_id)
            updated_ids.append(f"tmdb_{tmdb_id}")

        db.commit()

        for tmdb_id in touched_virtual_ids:
            try:
                _hydrate_virtual_metadata(db, tmdb_id, media_type)
            except Exception as exc:
                logger.warning(f"Failed to hydrate virtual metadata for catalog bulk update {media_type} {tmdb_id}: {exc}")

        return {"status": "success", "tab": tab, "updated_ids": updated_ids}
    except ValueError as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk updating catalog status: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
