import logging
from sqlalchemy.orm import Session

from app.services.library.details.formatter import DetailFormatterService
from app.services.library.details.item import ItemDetailProvider
from app.services.library.details.series import SeriesDetailProvider
from app.services.library.details.collection import CollectionDetailProvider

logger = logging.getLogger(__name__)

class LibraryDetailService:
    def __init__(self, db: Session):
        self.db = db
        self.formatter = DetailFormatterService()
        self.item_provider = ItemDetailProvider(self.db, self.formatter)
        self.series_provider = SeriesDetailProvider(self.db, self.formatter)
        self.collection_provider = CollectionDetailProvider(self.db, self.formatter)

    def get_library_item_detail(self, item_id: str, full_people: bool = False):
        return self.item_provider.get_library_item_detail(item_id, full_people=full_people)

    def get_collection_detail(self, collection_tmdb_id: int, language: str | None = None):
        return self.collection_provider.get_collection_detail(collection_tmdb_id, language=language)

    def get_library_series_detail(self, series_tmdb_id: int, seasons_limit: int = 5, initial_episodes_limit: int = 4):
        return self.series_provider.get_library_series_detail(series_tmdb_id, seasons_limit=seasons_limit, initial_episodes_limit=initial_episodes_limit)

    def get_library_series_season_detail(self, series_tmdb_id: int, season_number: int):
        return self.series_provider.get_library_series_season_detail(series_tmdb_id, season_number)
