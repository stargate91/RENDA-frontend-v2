from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import MediaCollection, MediaCollectionLocalization
from app.services.asset_service import AssetService
from app.utils.library_utils import _pick_backdrop_path


class CollectionService:
    """Persists and retrieves localized TMDB collection metadata."""

    def __init__(self, db_session: Session):
        self.db = db_session
        self.asset_service = AssetService()

    def upsert_from_tmdb(
        self,
        tmdb_client: Any,
        collection_payload: Any,
        language: str,
        is_primary: bool = False,
    ) -> Optional[MediaCollection]:
        if not collection_payload:
            return None

        payload = collection_payload if isinstance(collection_payload, dict) else collection_payload.model_dump()
        collection_id = payload.get("id")
        if not collection_id:
            return None
        language = (language or "en").strip()

        collection = self.db.query(MediaCollection).filter(MediaCollection.tmdb_id == int(collection_id)).first()
        if not collection:
            collection = MediaCollection(tmdb_id=int(collection_id))
            self.db.add(collection)
            self.db.flush()

        details = {}
        try:
            details = tmdb_client._call_api(  # noqa: SLF001 - internal reuse for first-class collection persistence
                f"/collection/{collection.tmdb_id}",
                {
                    "api_key": getattr(tmdb_client, "_api_key", ""),
                    "language": language,
                },
            ) or {}
        except Exception:
            details = {}

        parts = details.get("parts")
        if isinstance(parts, list) and parts:
            collection.total_parts = len(parts)
        elif collection.total_parts is None:
            payload_parts = payload.get("parts")
            collection.total_parts = len(payload_parts) if isinstance(payload_parts, list) else None

        resolved_name = (
            details.get("name")
            or payload.get("name")
            or f"Collection {collection.tmdb_id}"
        )

        loc = self.db.query(MediaCollectionLocalization).filter(
            MediaCollectionLocalization.collection_tmdb_id == collection.tmdb_id,
            MediaCollectionLocalization.locale == language,
        ).first()
        if not loc:
            # Check if it's already pending in the session
            for obj in self.db.new:
                if (
                    isinstance(obj, MediaCollectionLocalization)
                    and obj.collection_tmdb_id == collection.tmdb_id
                    and obj.locale == language
                ):
                    loc = obj
                    break

            if not loc:
                loc = next(
                    (
                        entry for entry in collection.localizations
                        if entry.locale == language
                    ),
                    None,
                )

            if not loc:
                loc = MediaCollectionLocalization(
                    collection_tmdb_id=collection.tmdb_id,
                    locale=language,
                    name=resolved_name,
                )
                try:
                    self.db.flush()
                    with self.db.begin_nested():
                        self.db.add(loc)
                        self.db.flush([loc])
                except IntegrityError:
                    if loc in self.db:
                        self.db.expunge(loc)
                    loc = self.db.query(MediaCollectionLocalization).filter(
                        MediaCollectionLocalization.collection_tmdb_id == collection.tmdb_id,
                        MediaCollectionLocalization.locale == language,
                    ).first()
                    if not loc:
                        raise

        if is_primary:
            self.db.query(MediaCollectionLocalization).filter(
                MediaCollectionLocalization.collection_tmdb_id == collection.tmdb_id,
                MediaCollectionLocalization.locale != language,
            ).update({"is_primary": False}, synchronize_session=False)

        previous_poster_path = loc.poster_path
        previous_backdrop_path = collection.backdrop_path
        loc.is_primary = is_primary
        loc.name = resolved_name
        loc.overview = details.get("overview") or loc.overview
        loc.poster_path = details.get("poster_path") or payload.get("poster_path") or loc.poster_path
        collection.backdrop_path = (
            _pick_backdrop_path(details, language)
            or details.get("backdrop_path")
            or payload.get("backdrop_path")
            or collection.backdrop_path
        )

        if loc.poster_path != previous_poster_path:
            loc.local_poster_path = None
        if collection.backdrop_path != previous_backdrop_path:
            collection.local_backdrop_path = None

        if loc.poster_path and not loc.local_poster_path:
            loc.local_poster_path = self.asset_service.download_image(loc.poster_path, "posters", size="w500")
        if collection.backdrop_path and not collection.local_backdrop_path:
            collection.local_backdrop_path = self.asset_service.download_image(collection.backdrop_path, "backdrops", size="w1280")
        self.db.flush()

        return collection
