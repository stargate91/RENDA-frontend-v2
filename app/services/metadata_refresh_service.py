import logging
import threading
import time
from typing import Optional

from sqlalchemy.orm import Session as SQLASession

from app.api.tmdb_client import TMDBClient
from app.db.base import Session
from app.db.models import MediaItem, MediaMatch, Person
from app.services.collection_service import CollectionService
from app.services.metadata_enrichment_service import MetadataEnrichmentService
from app.services.person_service import PersonService
from app.services.target_type_service import normalize_target_type
from app.utils.library_utils import _preferred_metadata_language

logger = logging.getLogger(__name__)

_REFRESH_STATE_LOCK = threading.Lock()
_REFRESH_STATE_TTL_SECONDS = 15 * 60
_REFRESH_STATE_BY_KEY: dict[str, dict] = {}

def _build_refresh_key(target_type: str, target_id: int, language: Optional[str] = None) -> str:
    normalized_type = normalize_target_type(target_type, default="")
    normalized_language = str(language or "").strip().lower()
    return f"{normalized_type}:{int(target_id)}:{normalized_language}"


def _cleanup_refresh_states() -> None:
    now = time.time()
    expired_keys = [
        key
        for key, state in _REFRESH_STATE_BY_KEY.items()
        if (now - float(state.get("updated_at") or 0)) >= _REFRESH_STATE_TTL_SECONDS
    ]
    for key in expired_keys:
        _REFRESH_STATE_BY_KEY.pop(key, None)


class MetadataRefreshService:
    def __init__(self, db: SQLASession):
        self.db = db

    @staticmethod
    def get_refresh_state(target_type: str, target_id: int, language: Optional[str] = None) -> dict:
        key = _build_refresh_key(target_type, target_id, language)
        with _REFRESH_STATE_LOCK:
            _cleanup_refresh_states()
            state = _REFRESH_STATE_BY_KEY.get(key)
            if not state:
                return {
                    "status": "idle",
                    "target_type": normalize_target_type(target_type, default=""),
                    "target_id": int(target_id),
                    "language": language,
                    "error": None,
                }
            return {
                "status": state.get("status") or "idle",
                "target_type": state.get("target_type"),
                "target_id": state.get("target_id"),
                "language": state.get("language"),
                "error": state.get("error"),
            }

    @staticmethod
    def start_refresh(target_type: str, target_id: int, language: Optional[str] = None) -> dict:
        normalized_type = normalize_target_type(target_type, default="")
        key = _build_refresh_key(normalized_type, target_id, language)

        with _REFRESH_STATE_LOCK:
            _cleanup_refresh_states()
            current = _REFRESH_STATE_BY_KEY.get(key)
            if current and current.get("status") == "refreshing":
                return {
                    "status": "refreshing",
                    "target_type": normalized_type,
                    "target_id": int(target_id),
                    "language": language,
                }

            _REFRESH_STATE_BY_KEY[key] = {
                "status": "refreshing",
                "target_type": normalized_type,
                "target_id": int(target_id),
                "language": language,
                "error": None,
                "updated_at": time.time(),
            }

        threading.Thread(
            target=MetadataRefreshService._run_refresh_in_background,
            args=(normalized_type, int(target_id), language),
            daemon=True,
        ).start()

        return {
            "status": "started",
            "target_type": normalized_type,
            "target_id": int(target_id),
            "language": language,
        }

    @staticmethod
    def _run_refresh_in_background(target_type: str, target_id: int, language: Optional[str] = None) -> None:
        key = _build_refresh_key(target_type, target_id, language)
        db = Session()
        try:
            service = MetadataRefreshService(db)
            if target_type == "item":
                service.refresh_item(target_id, language=language)
            elif target_type in {"movie", "series"}:
                service.refresh_virtual_media(target_id, target_type, language=language)
            elif target_type == "person":
                service.refresh_person(target_id, language=language)
            elif target_type == "collection":
                service.refresh_collection(target_id, language=language)
            elif target_type == "library-series":
                service.refresh_series(target_id, language=language)
            else:
                raise ValueError(f"Unsupported target_type: {target_type}")

            with _REFRESH_STATE_LOCK:
                _REFRESH_STATE_BY_KEY[key] = {
                    "status": "idle",
                    "target_type": target_type,
                    "target_id": int(target_id),
                    "language": language,
                    "error": None,
                    "updated_at": time.time(),
                }
        except Exception as exc:
            logger.error(f"Metadata refresh failed for {target_type} {target_id}: {exc}")
            with _REFRESH_STATE_LOCK:
                _REFRESH_STATE_BY_KEY[key] = {
                    "status": "failed",
                    "target_type": target_type,
                    "target_id": int(target_id),
                    "language": language,
                    "error": str(exc),
                    "updated_at": time.time(),
                }
        finally:
            db.close()
            Session.remove()

    def refresh_item(self, item_id: int, language: Optional[str] = None) -> dict:
        item = self.db.query(MediaItem).filter(MediaItem.id == int(item_id)).first()
        if not item:
            raise ValueError("Item not found")

        resolved_language = (language or "").strip() or item.locale or _preferred_metadata_language(self.db) or "en-US"
        fallback_language = "en-US" if resolved_language.lower() != "en-us" else None
        MetadataEnrichmentService(self.db).enrich_matched_item(
            item,
            language=resolved_language,
            fallback_language=fallback_language,
        )
        return {
            "target_type": "item",
            "target_id": item.id,
            "language": resolved_language,
            "status": "refreshed",
        }

    def refresh_virtual_media(self, tmdb_id: int, media_type: str, language: Optional[str] = None) -> dict:
        from app.services.lists_service import _hydrate_virtual_metadata

        normalized_media_type = "tv" if str(media_type or "").lower() in {"tv", "series"} else "movie"
        resolved_language = (language or "").strip() or _preferred_metadata_language(self.db) or "en-US"
        _hydrate_virtual_metadata(self.db, int(tmdb_id), normalized_media_type, resolved_language)
        return {
            "target_type": "series" if normalized_media_type == "tv" else "movie",
            "target_id": int(tmdb_id),
            "language": resolved_language,
            "status": "refreshed",
        }

    def refresh_person(self, person_id: int, language: Optional[str] = None) -> dict:
        person = self.db.query(Person).filter(Person.id == int(person_id)).first()
        if not person:
            raise ValueError("Person not found")

        resolved_language = (language or "").strip() or _preferred_metadata_language(self.db) or "en-US"
        languages = [resolved_language]
        if resolved_language.lower() != "en-us":
            languages.append("en-US")
        PersonService(self.db).enrich_person_metadata(int(person_id), languages, force_refresh=True)
        return {
            "target_type": "person",
            "target_id": int(person_id),
            "language": resolved_language,
            "status": "refreshed",
        }

    def refresh_collection(self, collection_tmdb_id: int, language: Optional[str] = None) -> dict:
        tmdb = TMDBClient(self.db)
        resolved_language = (language or "").strip() or _preferred_metadata_language(self.db) or "en-US"
        normalized_lang = str(resolved_language or "en").split("-", 1)[0].strip() or "en"
        include_image_language = ",".join(dict.fromkeys([normalized_lang, "en", "null"]))
        payload = tmdb._call_api(  # noqa: SLF001
            f"/collection/{int(collection_tmdb_id)}",
            {
                "api_key": getattr(tmdb, "_api_key", ""),
                "language": resolved_language,
                "append_to_response": "images",
                "include_image_language": include_image_language,
            },
        ) or {}
        if not payload:
            raise ValueError("Collection metadata not found")

        CollectionService(self.db).upsert_from_tmdb(
            tmdb,
            payload,
            resolved_language,
            is_primary=False,
        )
        self.db.commit()
        return {
            "target_type": "collection",
            "target_id": int(collection_tmdb_id),
            "language": resolved_language,
            "status": "refreshed",
        }

    def refresh_series(self, series_tmdb_id: int, language: Optional[str] = None) -> dict:
        match = self.db.query(MediaMatch).filter(
            MediaMatch.is_active == True,
            (MediaMatch.series_tmdb_id == int(series_tmdb_id)) | (MediaMatch.tmdb_id == int(series_tmdb_id)),
        ).first()
        if match and match.media_item_id:
            return self.refresh_item(match.media_item_id, language=language)
        return self.refresh_virtual_media(series_tmdb_id, "tv", language=language)
