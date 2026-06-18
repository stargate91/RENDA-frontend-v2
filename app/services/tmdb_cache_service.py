from __future__ import annotations

from typing import Optional
from urllib.parse import parse_qs, urlsplit

from sqlalchemy.orm import Session

from app.db.models import TMDBCache
from app.utils.library_utils.images import _pick_backdrop_path, _pick_logo_path
from app.utils.library_utils.lang import _match_language_code


class TMDBCacheService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _cache_language(cache: TMDBCache) -> str:
        cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
        try:
            parsed = urlsplit(cache_key)
            parsed_language = str((parse_qs(parsed.query).get("language") or [""])[0] or "")
            if parsed_language:
                return parsed_language
        except Exception:
            pass
        return str(cache.locale or "")

    @staticmethod
    def _rank_cache(cache: TMDBCache, preferred_languages: list[str]) -> tuple[int, float]:
        cache_lang = TMDBCacheService._cache_language(cache)
        for idx, preferred in enumerate(preferred_languages):
            if _match_language_code(cache_lang, preferred):
                return idx, -cache.updated_at.timestamp()
        if _match_language_code(cache_lang, "en"):
            return len(preferred_languages), -cache.updated_at.timestamp()
        return len(preferred_languages) + 1, -cache.updated_at.timestamp()

    def pick_best_cache(
        self,
        *,
        tmdb_id: Optional[int],
        endpoint_prefix: str,
        preferred_languages: list[str],
        require_exact_entity_path: bool = False,
    ) -> Optional[TMDBCache]:
        if not tmdb_id:
            return None

        candidates: list[TMDBCache] = []
        for cache in self.db.query(TMDBCache).filter(TMDBCache.tmdb_id == tmdb_id).all():
            cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
            if not cache_key.startswith(endpoint_prefix):
                continue
            if require_exact_entity_path:
                suffix = cache_key[len(endpoint_prefix):]
                if suffix != "" and not suffix.startswith("?"):
                    continue
            candidates.append(cache)

        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]
        return sorted(candidates, key=lambda cache: self._rank_cache(cache, preferred_languages))[0]

    def pick_best_media_cache(
        self,
        tmdb_id: Optional[int],
        media_type: str,
        preferred_languages: list[str],
    ) -> Optional[TMDBCache]:
        return self.pick_best_cache(
            tmdb_id=tmdb_id,
            endpoint_prefix=f"/{media_type}/{tmdb_id}",
            preferred_languages=preferred_languages,
            require_exact_entity_path=True,
        )

    def pick_best_collection_cache(
        self,
        collection_tmdb_id: Optional[int],
        preferred_languages: list[str],
    ) -> Optional[TMDBCache]:
        return self.pick_best_cache(
            tmdb_id=collection_tmdb_id,
            endpoint_prefix=f"/collection/{collection_tmdb_id}",
            preferred_languages=preferred_languages,
            require_exact_entity_path=False,
        )

    def get_best_cached_payload(
        self,
        tmdb_id: Optional[int],
        media_type: str,
        preferred_languages: list[str],
    ) -> dict:
        context = self.get_best_cached_context(
            tmdb_id=tmdb_id,
            media_type=media_type,
            preferred_languages=preferred_languages,
        )
        return context["tmdb_data"]

    def get_payloads_by_locale(
        self,
        tmdb_id: Optional[int],
        media_type: str,
    ) -> dict[str, dict]:
        if not tmdb_id:
            return {}
        payloads: dict[str, dict] = {}
        prefix = f"/{media_type}/{tmdb_id}"
        for cache in self.db.query(TMDBCache).filter(TMDBCache.tmdb_id == tmdb_id).all():
            cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
            if not cache_key.startswith(prefix) or not isinstance(cache.raw_data, dict):
                continue
            payloads[str(cache.locale or "")] = cache.raw_data
        return payloads

    def get_best_cached_context(
        self,
        *,
        tmdb_id: Optional[int],
        media_type: str,
        preferred_languages: list[str],
        ui_language: Optional[str] = None,
        localization=None,
        media_match=None,
        virtual_state=None,
    ) -> dict:
        cache = self.pick_best_media_cache(tmdb_id, media_type, preferred_languages)
        tmdb_data = cache.raw_data if cache and isinstance(cache.raw_data, dict) else {}
        payloads_by_locale = self.get_payloads_by_locale(tmdb_id, media_type)
        preferred_logo_path = _pick_logo_path(tmdb_data, ui_language) if tmdb_data else None
        preferred_backdrop_path = _pick_backdrop_path(tmdb_data, ui_language) if tmdb_data else None

        effective_logo_path = (
            getattr(virtual_state, "manual_logo_path", None)
            or getattr(localization, "manual_logo_path", None)
            or preferred_logo_path
            or getattr(localization, "logo_path", None)
        )
        effective_logo_path, effective_local_logo_path = self._resolve_localized_logo_paths(localization, effective_logo_path)

        effective_poster_path = (
            getattr(virtual_state, "manual_poster_path", None)
            or tmdb_data.get("poster_path")
        )
        effective_backdrop_path = (
            getattr(virtual_state, "manual_backdrop_path", None)
            or getattr(media_match, "manual_backdrop_path", None)
            or getattr(media_match, "backdrop_path", None)
            or preferred_backdrop_path
            or tmdb_data.get("backdrop_path")
        )
        effective_backdrop_path, effective_local_backdrop_path = self._resolve_match_backdrop_paths(media_match, effective_backdrop_path)

        return {
            "cache": cache,
            "cache_locale": self._cache_language(cache) if cache else None,
            "tmdb_data": tmdb_data,
            "payloads_by_locale": payloads_by_locale,
            "has_cached_metadata": bool(tmdb_data),
            "effective_poster_path": effective_poster_path,
            "effective_logo_path": effective_logo_path,
            "effective_local_logo_path": effective_local_logo_path,
            "effective_backdrop_path": effective_backdrop_path,
            "effective_local_backdrop_path": effective_local_backdrop_path,
            "companies": self._merge_named_logo_entities(
                getattr(media_match, "companies", None),
                tmdb_data.get("production_companies"),
            ),
            "networks": self._merge_named_logo_entities(
                getattr(media_match, "networks", None),
                tmdb_data.get("networks"),
            ),
            "readiness_input": {
                "payload": tmdb_data,
                "poster_path": effective_poster_path,
                "backdrop_path": effective_backdrop_path,
                "logo_path": effective_logo_path,
                "media_type": media_type,
            },
            "filename": (
                tmdb_data.get("title")
                or tmdb_data.get("name")
                or tmdb_data.get("original_title")
                or tmdb_data.get("original_name")
                or (f"tmdb_{tmdb_id}" if tmdb_id else "tmdb_unknown")
            ),
            "api_responses": payloads_by_locale if media_type != "tv" else {},
            "series_api_responses": payloads_by_locale if media_type == "tv" else {},
        }

    @staticmethod
    def _resolve_localized_logo_paths(localization, effective_logo_path: Optional[str]) -> tuple[Optional[str], Optional[str]]:
        if not effective_logo_path:
            return None, None
        if not localization:
            return effective_logo_path, None

        manual_logo_path = getattr(localization, "manual_logo_path", None)
        remote_logo_path = getattr(localization, "logo_path", None)
        if effective_logo_path == manual_logo_path:
            return manual_logo_path, getattr(localization, "manual_local_logo_path", None)
        if effective_logo_path == remote_logo_path:
            return remote_logo_path, getattr(localization, "local_logo_path", None)
        return effective_logo_path, None

    @staticmethod
    def _resolve_match_backdrop_paths(media_match, effective_backdrop_path: Optional[str]) -> tuple[Optional[str], Optional[str]]:
        if not effective_backdrop_path:
            return None, None
        if not media_match:
            return effective_backdrop_path, None

        manual_backdrop_path = getattr(media_match, "manual_backdrop_path", None)
        remote_backdrop_path = getattr(media_match, "backdrop_path", None)
        if effective_backdrop_path == manual_backdrop_path:
            return manual_backdrop_path, getattr(media_match, "manual_local_backdrop_path", None)
        if effective_backdrop_path == remote_backdrop_path:
            return remote_backdrop_path, getattr(media_match, "local_backdrop_path", None)
        return effective_backdrop_path, None

    @staticmethod
    def _merge_named_logo_entities(primary_entities, cached_entities) -> list[dict]:
        cached_logo_by_name: dict[str, Optional[str]] = {}
        for entry in cached_entities or []:
            if isinstance(entry, dict) and entry.get("name"):
                cached_logo_by_name[str(entry["name"]).strip().lower()] = entry.get("logo_path")

        source_entities = primary_entities or cached_entities or []
        merged: list[dict] = []
        for entry in source_entities:
            if isinstance(entry, str):
                merged.append({
                    "name": entry,
                    "logo_path": cached_logo_by_name.get(entry.strip().lower()),
                    "local_logo_path": None,
                })
                continue
            if not isinstance(entry, dict):
                continue
            name = entry.get("name")
            merged.append({
                "name": name,
                "logo_path": entry.get("logo_path") or cached_logo_by_name.get(str(name or "").strip().lower()),
                "local_logo_path": entry.get("local_logo_path"),
            })
        return merged

    def build_detail_fallback_context(
        self,
        *,
        tmdb_id: Optional[int],
        media_type: str,
        preferred_languages: list[str],
        ui_language: Optional[str] = None,
        localization=None,
        media_match=None,
        virtual_state=None,
    ) -> dict:
        context = self.get_best_cached_context(
            tmdb_id=tmdb_id,
            media_type=media_type,
            preferred_languages=preferred_languages,
            ui_language=ui_language,
            localization=localization,
            media_match=media_match,
            virtual_state=virtual_state,
        )
        return {
            "tmdb_data": context["tmdb_data"],
            "has_cached_metadata": context["has_cached_metadata"],
            "effective_poster_path": context["effective_poster_path"],
            "effective_logo_path": context["effective_logo_path"],
            "effective_local_logo_path": context["effective_local_logo_path"],
            "effective_backdrop_path": context["effective_backdrop_path"],
            "effective_local_backdrop_path": context["effective_local_backdrop_path"],
            "companies": context["companies"],
            "networks": context["networks"],
        }

    def hydrate_detail_from_cache(
        self,
        *,
        tmdb_id: Optional[int],
        media_type: str,
        preferred_languages: list[str],
        ui_language: Optional[str] = None,
        virtual_state=None,
    ) -> dict:
        context = self.get_best_cached_context(
            tmdb_id=tmdb_id,
            media_type=media_type,
            preferred_languages=preferred_languages,
            ui_language=ui_language,
            virtual_state=virtual_state,
        )
        return context
