import logging
from pathlib import Path
from sqlalchemy.orm import Session
from ..db.models import MediaItem, ExtraFile, MovieEdition, MediaSource, MediaAudioType, PartType, PartStyle, ExtraSubtype, ItemType, ItemStatus
from ..repositories.media_repository import MediaRepository
from ..formatter.formatter import Formatter

logger = logging.getLogger(__name__)

class MediaActionService:
    """
    Handles state-changing operations on media items, 
    such as property overrides, status updates, and deletions.
    """

    def __init__(self, db: Session):
        self.db = db
        self.repository = MediaRepository(db)

    def delete_media_and_extras(self, item_ids: list, extra_ids: list):
        """Permanent removal of records from the database."""
        try:
            self.repository.delete_items(item_ids)
            self.repository.delete_extras(extra_ids)
            self.repository.commit()
        except Exception as e:
            self.repository.rollback()
            logger.error(f"Failed to delete items: {e}")
            raise e

    def update_properties(self, target_id: int, target_type: str, updates: dict):
        """Applies manual overrides to media items or extra files."""
        try:
            if target_type == "media":
                item = self.repository.get_by_id(target_id)
                if not item: raise ValueError("Media item not found")
                self._apply_media_updates(item, updates)
                if "target_language" in updates and updates["target_language"]:
                    try:
                        from .metadata_enrichment_service import MetadataEnrichmentService
                        enricher = MetadataEnrichmentService(self.db)
                        enricher.enrich_matched_item(item, language=updates["target_language"])
                    except Exception as enrich_ex:
                        logger.warning(f"Failed to enrich item {item.id} with new target language: {enrich_ex}")
                self._refresh_planned_path(item)
            else:
                extra = self.repository.get_extra_by_id(target_id)
                if not extra: raise ValueError("Extra file not found")
                self._apply_extra_updates(extra, updates)
                # Refresh parent's path if it affects extras
                self._refresh_planned_path(extra.parent_item)

            self.repository.commit()
        except Exception as e:
            self.repository.rollback()
            logger.error(f"Failed to update properties for {target_type} {target_id}: {e}")
            raise e

    def _apply_media_updates(self, item: MediaItem, updates: dict):
        # Mapping dict keys to model attributes
        mapping = {
            "target_language": "locale",
            "edition": lambda v: MovieEdition(v),
            "source": lambda v: MediaSource(v),
            "audio_type": lambda v: MediaAudioType(v),
            "item_type": lambda v: ItemType(v),
            "part": lambda v: int(v) if v else None,
            "part_type": lambda v: PartType(v),
            "part_style": lambda v: PartStyle(v)
        }
        for key, transform in mapping.items():
            if key in updates:
                val = transform(updates[key]) if callable(transform) else updates[key]
                setattr(item, key, val)

        # Special handling for TV overrides
        if "season" in updates or "episode" in updates:
            active_match = next((m for m in item.matches if m.is_active), None)
            if active_match:
                if "season" in updates: active_match.season_number = int(updates["season"]) if updates["season"] else None
                if "episode" in updates: active_match.episode_number = updates["episode"]
                active_match.item_type = ItemType.EPISODE
                item.item_type = ItemType.EPISODE

    def _apply_extra_updates(self, extra: ExtraFile, updates: dict):
        if "subtype" in updates: extra.subtype = ExtraSubtype(updates["subtype"])
        if "language" in updates: extra.language = updates["language"]
        if "parent_id" in updates: 
            extra.parent_item_id = int(updates["parent_id"]) if updates["parent_id"] else extra.parent_item_id

    def _refresh_planned_path(self, item: MediaItem):
        """Forces a recalculation of the planned path using the Formatter."""
        from ..formatter.formatter import FormatterConfig
        config = FormatterConfig.from_db(self.db)
        formatter = Formatter(config)
        active_match = next((m for m in item.matches if m.is_active), None)
        if active_match:
            try:
                preview = formatter.plan_rename(active_match, "")
                item.planned_path = str(preview.target_path).replace("\\", "/")
            except Exception as e:
                logger.warning(f"Refresh planned path failed for {item.id}: {e}")
