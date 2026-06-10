from abc import ABC, abstractmethod
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from ..formatter import LibraryFormatterService
from ..filter_sort import LibraryFilterSortService

class BaseTabProvider(ABC):
    def __init__(self, db: Session, formatter: LibraryFormatterService, filter_sort: LibraryFilterSortService):
        self.db = db
        self.formatter = formatter
        self.filter_sort = filter_sort

    @abstractmethod
    def get_page(
        self,
        tab: str,
        page: int,
        page_size: Optional[int],
        sort_by: str,
        search: str,
        selected_tags: Optional[list[str]],
        selected_genre: Optional[str],
        selected_decade: Optional[str],
        selected_year: Optional[int],
        filter_favorite: str,
        filter_watched: str,
        filter_ownership: str,
        filter_status: str,
        filter_gender: str,
    ) -> Tuple[list[dict], int, int, Optional[int], int]:
        """
        Returns: (items, total_items, page, page_size, total_pages)
        """
        pass
