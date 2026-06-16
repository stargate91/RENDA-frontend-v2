import os
import logging
from pathlib import Path
from typing import Optional
from copy import deepcopy
from datetime import datetime

from app.db.models import (
    UserSetting,
    VirtualMediaState,
    VirtualEpisodeState,
    ItemStatus,
    ItemType,
    MovieEdition,
    MediaSource,
    MediaAudioType,
    PartType,
    PartStyle,
    ExtraSubtype,
    ExtraFile,
    ExtraCategory,
    MediaItem,
)

logger = logging.getLogger(__name__)

from app.utils.library_utils import _preferred_metadata_language, _match_language_code


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
            item.locale = updates["target_language"]
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
        locale="en",
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
    if item.locale:
        db_loc = db.query(MetadataLocalization).filter(
            MetadataLocalization.match_id == active_match.id
        ).all()
        from app.services.language_service import LanguageService
        loc = LanguageService.pick_localization(db_loc, [item.locale])
    if not loc and active_match.localizations:
        from app.services.language_service import LanguageService
        loc = LanguageService.pick_localization(active_match.localizations, db)
    if not loc:
        return

    preview = formatter.format_item(item, active_match, loc)
    if preview.target_subpath:
        item.planned_path = str(preview.target_path).replace("\\", "/")
    else:
        item.planned_path = str(preview.target_path).replace("\\", "/")


def _sync_target_language_metadata(db, item):
    active_match = next((m for m in item.matches if m.is_active), None)
    target_language = item.locale
    if not active_match or not target_language:
        return

    from app.services.metadata_enrichment_service import MetadataEnrichmentService

    MetadataEnrichmentService(db).enrich_matched_item(
        item,
        language=target_language,
        fallback_language=None,
    )
