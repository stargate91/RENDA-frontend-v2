import logging
from typing import List, Dict, Any
from app.db.base import Session
from .media_discovery_service import MediaDiscoveryService
from .media_library_service import MediaLibraryService
from .media_action_service import MediaActionService
from ..schemas.media import DiscoveryGroupsDTO, LibraryStatsDTO, LibraryGroupedDTO

logger = logging.getLogger(__name__)

class MediaService:
    """
    Facade service that coordinates media-related operations by delegating 
    to specialized sub-services (Discovery, Library, and Actions).
    Maintains backward compatibility for the API layer.
    """

    def __init__(self, db: Session):
        self.db = db
        self.discovery = MediaDiscoveryService(db)
        self.library = MediaLibraryService(db)
        self.actions = MediaActionService(db)

    def get_library_stats(self) -> LibraryStatsDTO:
        """Returns library statistics for the dashboard."""
        return self.library.get_stats()

    def get_discovery_grouped(self) -> DiscoveryGroupsDTO:
        """Returns grouped discovery items for the UI."""
        return self.discovery.get_discovery_groups()

    def get_discovery_item_count(self) -> int:
        return self.discovery.repository.get_discovery_item_count()

    def delete_items(self, item_ids: List[int], extra_ids: List[int]):
        """Deletes specified media items and extras."""
        return self.actions.delete_media_and_extras(item_ids, extra_ids)

    def update_item_properties(self, item_id: int, item_type: str, updates: dict):
        """Updates media item or extra file properties manually."""
        return self.actions.update_properties(item_id, item_type, updates)

    def get_library_grouped(self) -> LibraryGroupedDTO:
        """Returns grouped organized items for the Library view."""
        return self.library.get_grouped_library()
