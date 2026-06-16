import logging
from typing import List, Dict, Any
from pathlib import Path
from sqlalchemy.orm import Session
from ..db.models import ItemStatus, ItemType, MediaItem
from ..formatter.formatter import Formatter, FormatterConfig
from ..repositories.media_repository import MediaRepository
from ..schemas.media import MediaItemDTO, MediaMatchDTO, MediaImageDTO, ExtraFileDTO, DiscoveryGroupsDTO
from ..utils.library_utils import _public_image_path, _tmdb_image_url

logger = logging.getLogger(__name__)


def _match_language_code(lang_a, lang_b):
    if not lang_a or not lang_b:
        return False
    a = str(lang_a).lower()
    b = str(lang_b).lower()
    return a == b or a.split("-")[0] == b.split("-")[0]

class MediaDiscoveryService:
    """
    Handles the logic for presenting newly discovered media items.
    Calculates previews and groups items for the Discovery Console.
    """

    def __init__(self, db: Session):
        self.db = db
        self.repository = MediaRepository(db)
        from ..db.models import UserSetting
        lang_setting = self.db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
        self.primary_lang = lang_setting.value if lang_setting else "en"

    def _get_active_loc(self, match, item=None):
        if not match.localizations:
            return None
        preferred_lang = getattr(item, "locale", None) or self.primary_lang
        for loc in match.localizations:
            if _match_language_code(loc.locale, preferred_lang):
                return loc
        for loc in match.localizations:
            if _match_language_code(loc.locale, self.primary_lang):
                return loc
        return next((loc for loc in match.localizations if loc.is_primary), match.localizations[0])

    def get_discovery_groups(self) -> DiscoveryGroupsDTO:
        """Aggregates and groups items for the discovery view."""
        config = FormatterConfig.from_db(self.db)
        formatter = Formatter(config)

        items = self.repository.get_discovery_items()
        extras = self.repository.get_discovery_extras()
        
        groups = {"manual": [], "movies": [], "series": [], "extras": [], "collisions": []}
        parent_planned_paths = {}

        item_data = []
        for item in items:
            preview = self._calculate_preview(item, formatter)
            p_path = self._preview_path(preview) if preview else item.planned_path
            parent_planned_paths[item.id] = p_path
            item_data.append((item, p_path, preview))
        
        for item, p_path, preview in item_data:
            dto = self._serialize_item(item, p_path, preview.action if preview else None)
            
            dto.has_collision = bool(preview.has_collision) if preview else False
            dto.collision_group_id = preview.collision_group_id if preview else None

            if dto.has_collision:
                groups["collisions"].append(dto)
            elif item.status in [ItemStatus.NEW, ItemStatus.UNCERTAIN, ItemStatus.NO_MATCH, ItemStatus.MULTIPLE, ItemStatus.ERROR]:
                groups["manual"].append(dto)
            else:
                if item.item_type == ItemType.MOVIE:
                    groups["movies"].append(dto)
                elif item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                    groups["series"].append(dto)
                else:
                    groups["movies"].append(dto)

        groups["extras"] = self._process_extras(extras, parent_planned_paths, formatter)
        return DiscoveryGroupsDTO(**groups)

    def _calculate_preview(self, item: MediaItem, formatter: Formatter):
        if item.status in [ItemStatus.UNCERTAIN, ItemStatus.MULTIPLE]:
            return None

        active_match = next((m for m in item.matches if m.is_active), None)
        if (item.status in [ItemStatus.MATCHED, ItemStatus.RENAMED, ItemStatus.ORGANIZED]) and active_match:
            try:
                loc = self._get_active_loc(active_match, item)
                if loc:
                    return formatter.format_item(item, active_match, loc)
            except Exception as ex:
                logger.warning(f"Failed to calculate planned path for item {item.id}: {ex}")
        return None

    def _preview_path(self, preview) -> str:
        if not preview:
            return None
        return str(preview.target_path).replace("\\", "/")

    def _resolve_image_path(self, path: str | None, subfolder: str, size: str) -> str | None:
        if not path:
            return None
        local_path = _public_image_path(path, subfolder)
        if local_path and not str(local_path).startswith(("http://", "https://", "/media/")):
            return f"/media/images/{subfolder}{local_path}"
        return local_path or _tmdb_image_url(path, size=size)

    def _serialize_item(self, item: MediaItem, p_path: str, action: str = None) -> MediaItemDTO:
        images = []
        active_match = next((m for m in item.matches if m.is_active), None)
        if active_match or item.status not in [ItemStatus.UNCERTAIN, ItemStatus.MULTIPLE]:
            for am in [m for m in item.matches if m.is_active]:
                loc = self._get_active_loc(am, item)
                if loc:
                    if item.item_type == ItemType.MOVIE:
                        movie_poster = self._resolve_image_path(loc.local_poster_path or loc.poster_path, "posters", "w500")
                        if movie_poster:
                            images.append(MediaImageDTO(type="poster", path=movie_poster, label="poster"))
                    elif item.item_type == ItemType.EPISODE:
                        seen_stills = set()
                        for still in (am.local_all_stills or am.all_stills or []):
                            still_path = self._resolve_image_path(still, "stills", "w400")
                            if still_path and still_path not in seen_stills:
                                images.append(MediaImageDTO(type="still", path=still_path, label="still"))
                                seen_stills.add(still_path)

                        if not images:
                            fallback_still = self._resolve_image_path(am.local_still_path or am.still_path, "stills", "w400")
                            if fallback_still:
                                images.append(MediaImageDTO(type="still", path=fallback_still, label="still"))

                        season_poster = self._resolve_image_path(loc.local_poster_path or loc.poster_path, "posters", "w500")
                        if season_poster:
                            images.append(MediaImageDTO(type="poster", path=season_poster, label="seasonPoster"))

                        series_poster = self._resolve_image_path(loc.local_series_poster_path or loc.series_poster_path, "posters", "w500")
                        if series_poster and series_poster != season_poster:
                            images.append(MediaImageDTO(type="poster", path=series_poster, label="seriesPoster"))

        matches = []
        for m in item.matches:
            loc = self._get_active_loc(m, item)
            matches.append(MediaMatchDTO(
                id=m.id, tmdb_id=m.tmdb_id, type=m.item_type.value if m.item_type else "movie",
                title=loc.title if loc else (loc.series_title if loc else ""),
                year=m.release_date.year if m.release_date else (m.first_air_date.year if m.first_air_date else None),
                poster_path=loc.poster_path if loc else None,
                vote_average=m.rating_tmdb, is_active=m.is_active, confidence=m.confidence_score
            ))

        return MediaItemDTO(
            id=item.id, filename=item.filename, status=item.status.value,
            type=item.item_type.value if item.item_type else "unknown",
            tmdb_id=active_match.tmdb_id if active_match else None,
            series_tmdb_id=active_match.series_tmdb_id if active_match else None,
            title=item.fn_title or item.fd_title or item.filename,
            year=item.fn_year or item.fd_year,
            season=item.fn_season or item.fd_season or item.it_season or (active_match.season_number if active_match else None),
            episode=item.fn_episode or item.fd_episode or item.it_episode or (active_match.episode_number if active_match else None),
            planned_path=p_path,
            extension=item.extension, size_mb=round(item.size / (1024 * 1024), 2) if item.size else 0,
            images=images, matches=matches, current_path=item.current_path,
            action=action,
            audio_type=item.audio_type.value if item.audio_type else None,
            edition=item.edition.value if item.edition else None,
            source=item.source.value if item.source else None,
            target_language=item.locale,
        )

    def _process_extras(self, extras: List[Any], parent_planned_paths: Dict[int, str], formatter: Formatter) -> List[ExtraFileDTO]:
        extra_paths = []
        path_counts = {}
        for ex, p_status, p_planned, p_filename in extras:
            parent_p_path = parent_planned_paths.get(ex.parent_item_id) or p_planned
            raw_parent_name = parent_p_path if parent_p_path else p_filename
            parent_name_stem = Path(raw_parent_name).stem
            parent_dir = str(Path(raw_parent_name).parent) if parent_p_path else ""
            
            # Using formatter logic to predict extra names
            extra_ctx = formatter.build_extra_context(ex, parent_name_stem)
            extra_name = formatter.format_extra_filename(extra_ctx)
            extra_sub = formatter.get_extra_subpath(ex)
            
            base_path = str(Path(parent_dir) / extra_sub / extra_name).replace("\\", "/")
            raw_planned_path = base_path
            
            # Action resolvement
            cat = ex.category.value if hasattr(ex.category, 'value') else str(ex.category)
            short_cat = cat
            if cat == "subtitle": short_cat = "sub"
            elif cat == "image": short_cat = "img"
            elif cat == "metadata": short_cat = "meta"
            
            action = getattr(formatter.config, f"extra_{short_cat}_action", "rename")
            
            if action == "delete":
                extra_paths.append((ex, "-", parent_name_stem, "delete", p_status))
                continue
            
            path_counts[raw_planned_path.lower()] = path_counts.get(raw_planned_path.lower(), 0) + 1
            extra_paths.append((ex, raw_planned_path, parent_name_stem, "rename", p_status))

        result = []
        current_counts = {}
        for ex, raw_p, parent_name, action, p_status in extra_paths:
            p_path = raw_p
            if action == "rename" and p_path != "-":
                path_key = raw_p.lower()
                if path_counts[path_key] > 1:
                    current_counts[path_key] = current_counts.get(path_key, 0) + 1
                    idx = current_counts[path_key]
                    if ex.extension:
                        base = raw_p[:-len(ex.extension)]
                        p_path = f"{base} {idx}{ex.extension}"
                    else:
                        p_path = f"{raw_p} {idx}"

            result.append(ExtraFileDTO(
                id=ex.id, parent_id=ex.parent_item_id, parent_name=parent_name,
                filename=Path(ex.original_path).name, extension=ex.extension,
                category=ex.category.value, subtype=ex.subtype.value if ex.subtype else "other",
                language=ex.language, path=ex.original_path, planned_path=p_path,
                action=action,
                parent_status=p_status.value if p_status and hasattr(p_status, 'value') else (str(p_status) if p_status else None)
            ))
        return result
