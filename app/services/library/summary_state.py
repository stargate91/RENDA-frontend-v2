from typing import Optional

from app.services.metadata_refresh_service import MetadataRefreshService
from app.services.target_type_service import build_refresh_target_type, normalize_media_target_type, normalize_target_type


def _has_value(value) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    return value is not None


def has_visual_metadata(*paths) -> bool:
    return any(_has_value(path) for path in paths)


def has_named_media_metadata(title: Optional[str], *visual_paths) -> bool:
    return _has_value(title) and has_visual_metadata(*visual_paths)


def has_poster_metadata(title: Optional[str], poster_path: Optional[str]) -> bool:
    return _has_value(title) and _has_value(poster_path)


def has_descriptive_media_metadata(*values) -> bool:
    return any(_has_value(value) for value in values)


def has_complete_people_metadata(*values) -> bool:
    return all(_has_value(value) for value in values)


def has_person_core_metadata(name: Optional[str], profile_path: Optional[str]) -> bool:
    return has_named_media_metadata(name, profile_path)


def has_localized_media_core_metadata(localization) -> bool:
    if not localization:
        return False
    title = getattr(localization, "title", None) or getattr(localization, "series_title", None)
    poster_path = (
        getattr(localization, "manual_poster_path", None),
        getattr(localization, "manual_local_poster_path", None),
        getattr(localization, "poster_path", None),
        getattr(localization, "local_poster_path", None),
        getattr(localization, "manual_series_poster_path", None),
        getattr(localization, "manual_local_series_poster_path", None),
        getattr(localization, "series_poster_path", None),
        getattr(localization, "local_series_poster_path", None),
    )
    primary_poster = next((path for path in poster_path if _has_value(path)), None)
    return (
        has_poster_metadata(title, primary_poster)
        and _has_value(getattr(localization, "overview", None))
        and has_visual_metadata(
            getattr(localization, "manual_logo_path", None),
            getattr(localization, "manual_local_logo_path", None),
            getattr(localization, "logo_path", None),
            getattr(localization, "local_logo_path", None),
        )
        and has_descriptive_media_metadata(
            getattr(localization, "genres", None),
            getattr(localization, "origin_country", None),
            getattr(localization, "spoken_languages", None),
        )
    )


def has_collection_core_metadata(localization, fallback_title: Optional[str] = None) -> bool:
    title = getattr(localization, "name", None) if localization else fallback_title
    poster_path = (
        getattr(localization, "manual_poster_path", None) if localization else None,
        getattr(localization, "manual_local_poster_path", None) if localization else None,
        getattr(localization, "poster_path", None) if localization else None,
        getattr(localization, "local_poster_path", None) if localization else None,
    )
    primary_poster = next((path for path in poster_path if _has_value(path)), None)
    return (
        has_poster_metadata(title, primary_poster)
        and has_descriptive_media_metadata(
            getattr(localization, "overview", None) if localization else None,
        )
    )


def has_cached_media_core_metadata(
    raw_data: Optional[dict],
    *,
    media_type: str,
    poster_path: Optional[str] = None,
    backdrop_path: Optional[str] = None,
    logo_path: Optional[str] = None,
) -> bool:
    payload = raw_data if isinstance(raw_data, dict) else {}
    title = (
        payload.get("name") or payload.get("original_name")
        if str(media_type).lower() in {"tv", "series"}
        else payload.get("title") or payload.get("original_title")
    )
    return (
        has_poster_metadata(title, poster_path or payload.get("poster_path"))
        and _has_value(payload.get("overview"))
        and _has_value(backdrop_path or payload.get("backdrop_path"))
        and _has_value(logo_path)
        and has_descriptive_media_metadata(
            payload.get("genres"),
            payload.get("release_date"),
            payload.get("first_air_date"),
            payload.get("runtime"),
            payload.get("episode_run_time"),
            payload.get("number_of_seasons"),
            payload.get("production_companies"),
            payload.get("networks"),
        )
        and has_complete_people_metadata(
            (payload.get("aggregate_credits") or {}).get("cast") or (payload.get("credits") or {}).get("cast"),
            payload.get("created_by") or (payload.get("aggregate_credits") or {}).get("crew") or (payload.get("credits") or {}).get("crew"),
        )
    )


def has_complete_virtual_series_metadata(seasons: Optional[list[dict]]) -> bool:
    normalized_seasons = [season for season in (seasons or []) if isinstance(season, dict) and int(season.get("season_number") or 0) > 0]
    if not normalized_seasons:
        return False

    for season in normalized_seasons:
        if not _has_value(season.get("title")) or not _has_value(season.get("poster_path")):
            return False
        episodes = [episode for episode in (season.get("episodes") or []) if isinstance(episode, dict)]
        expected_count = season.get("episode_count")
        try:
            expected_count = int(expected_count)
        except (TypeError, ValueError):
            expected_count = None
        if expected_count is None or expected_count <= 0 or len(episodes) != expected_count:
            return False
        for episode in episodes:
            if not _has_value(episode.get("title")):
                return False
            if not _has_value(episode.get("still_path")):
                return False
    return True


def evaluate_entity_readiness(
    *,
    entity_kind: str,
    media_type: Optional[str] = None,
    source: Optional[str] = None,
    localization=None,
    raw_data: Optional[dict] = None,
    title: Optional[str] = None,
    profile_path: Optional[str] = None,
    fallback_title: Optional[str] = None,
    poster_path: Optional[str] = None,
    backdrop_path: Optional[str] = None,
    logo_path: Optional[str] = None,
    readiness_override: Optional[bool] = None,
) -> bool:
    if readiness_override is not None:
        return bool(readiness_override)

    normalized_kind = str(entity_kind or "").strip().lower()
    normalized_source = str(source or "").strip().lower()

    if normalized_kind == "person":
        return has_person_core_metadata(title, profile_path)

    if normalized_kind == "collection":
        return has_collection_core_metadata(localization, fallback_title=fallback_title)

    if normalized_kind == "media":
        if normalized_source == "cached":
            return has_cached_media_core_metadata(
                raw_data,
                media_type=media_type or "movie",
                poster_path=poster_path,
                backdrop_path=backdrop_path,
                logo_path=logo_path,
            )
        if normalized_source == "named":
            return has_named_media_metadata(title, poster_path, backdrop_path, logo_path)
        return has_localized_media_core_metadata(localization)

    return False


def build_metadata_state(has_core_metadata: bool, refresh_state: Optional[dict] = None) -> str:
    status = str((refresh_state or {}).get("status") or "idle").strip().lower()
    if status == "refreshing":
        return "refreshing"
    if status == "failed":
        return "failed"
    return "ready" if has_core_metadata else "partial"


def build_entity_summary_state_payload(
    *,
    entity_kind: str,
    target_type: str,
    target_id: Optional[int],
    language: Optional[str] = None,
    media_type: Optional[str] = None,
    source: Optional[str] = None,
    localization=None,
    raw_data: Optional[dict] = None,
    title: Optional[str] = None,
    profile_path: Optional[str] = None,
    fallback_title: Optional[str] = None,
    poster_path: Optional[str] = None,
    backdrop_path: Optional[str] = None,
    logo_path: Optional[str] = None,
    readiness_override: Optional[bool] = None,
) -> dict:
    has_core_metadata = evaluate_entity_readiness(
        entity_kind=entity_kind,
        media_type=media_type,
        source=source,
        localization=localization,
        raw_data=raw_data,
        title=title,
        profile_path=profile_path,
        fallback_title=fallback_title,
        poster_path=poster_path,
        backdrop_path=backdrop_path,
        logo_path=logo_path,
        readiness_override=readiness_override,
    )
    return build_summary_state_payload(
        has_core_metadata=has_core_metadata,
        target_type=target_type,
        target_id=target_id,
        language=language,
    )

def build_media_summary_state_payload(
    *,
    has_core_metadata: Optional[bool] = None,
    media_type: Optional[str],
    is_virtual: bool,
    item_id: Optional[int] = None,
    tmdb_id: Optional[int] = None,
    series_tmdb_id: Optional[int] = None,
    language: Optional[str] = None,
    source: Optional[str] = None,
    localization=None,
    raw_data: Optional[dict] = None,
    title: Optional[str] = None,
    poster_path: Optional[str] = None,
    backdrop_path: Optional[str] = None,
    logo_path: Optional[str] = None,
) -> dict:
    normalized_type = normalize_media_target_type(media_type)
    target_type = build_refresh_target_type(media_type=normalized_type, is_virtual=is_virtual)
    if is_virtual:
        target_id = series_tmdb_id or tmdb_id or item_id
    else:
        target_id = item_id if normalized_type == "movie" else (series_tmdb_id or tmdb_id or item_id)
    resolved_has_core_metadata = evaluate_entity_readiness(
        entity_kind="media",
        media_type=normalized_type,
        source=source or ("cached" if is_virtual else "localized"),
        localization=localization,
        raw_data=raw_data,
        title=title,
        poster_path=poster_path,
        backdrop_path=backdrop_path,
        logo_path=logo_path,
        readiness_override=has_core_metadata,
    )
    return build_summary_state_payload(
        has_core_metadata=resolved_has_core_metadata,
        target_type=target_type,
        target_id=target_id,
        language=language,
    )


def build_summary_state_payload(
    *,
    has_core_metadata: bool,
    target_type: str,
    target_id: Optional[int],
    language: Optional[str] = None,
) -> dict:
    normalized_target_type = normalize_target_type(target_type, default="")
    if not target_id:
        refresh_state = {
            "status": "idle",
            "target_type": normalized_target_type,
            "target_id": target_id,
            "language": language,
            "error": None,
        }
    else:
        refresh_state = MetadataRefreshService.get_refresh_state(normalized_target_type, int(target_id), language)

    metadata_state = build_metadata_state(has_core_metadata, refresh_state)
    return {
        "metadata_state": metadata_state,
        "needs_metadata_refresh": metadata_state in {"partial", "failed"},
        "refresh_state": refresh_state,
    }
