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

    def get_library_item_detail(self, item_id: str):
        return self.item_provider.get_library_item_detail(item_id)

    def get_collection_detail(self, collection_tmdb_id: int):
        return self.collection_provider.get_collection_detail(collection_tmdb_id)

    def get_library_series_detail(self, series_tmdb_id: int):
        return self.series_provider.get_library_series_detail(series_tmdb_id)