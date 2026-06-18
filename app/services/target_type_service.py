from __future__ import annotations

from typing import Optional

CANONICAL_REFRESH_TARGET_TYPES = {
    "item",
    "movie",
    "series",
    "person",
    "collection",
    "library-series",
}

_TARGET_TYPE_ALIASES = {
    "tv": "series",
    "library_series": "library-series",
}


def normalize_target_type(target_type: Optional[str], *, default: Optional[str] = None) -> Optional[str]:
    value = str(target_type or "").strip().lower()
    if not value:
        return default
    return _TARGET_TYPE_ALIASES.get(value, value)


def is_supported_refresh_target_type(target_type: Optional[str]) -> bool:
    normalized = normalize_target_type(target_type)
    return bool(normalized and normalized in CANONICAL_REFRESH_TARGET_TYPES)


def normalize_media_target_type(media_type: Optional[str]) -> str:
    value = str(media_type or "").strip().lower()
    if value in {"tv", "series", "season", "episode"}:
        return "series"
    return "movie"


def build_refresh_target_type(*, media_type: Optional[str], is_virtual: bool) -> str:
    normalized_type = normalize_media_target_type(media_type)
    if is_virtual:
        return normalized_type
    return "item" if normalized_type == "movie" else "library-series"
