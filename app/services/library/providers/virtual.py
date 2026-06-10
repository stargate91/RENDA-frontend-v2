from typing import Optional, Tuple
from sqlalchemy.orm import Session
from .base import BaseTabProvider
from ..formatter import LibraryFormatterService
from ..filter_sort import LibraryFilterSortService
from ..virtual_query import LibraryVirtualQueryService

class VirtualTabProvider(BaseTabProvider):
    def __init__(self, db: Session, formatter: LibraryFormatterService, filter_sort: LibraryFilterSortService, virtual_query: LibraryVirtualQueryService):
        super().__init__(db, formatter, filter_sort)
        self.virtual_query = virtual_query

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
        items, total_items, normalized_page_size, total_pages = self.virtual_query.get_virtual_unowned_page(
            tab,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            search=search,
            selected_tags=selected_tags,
            selected_genre=selected_genre,
            selected_decade=selected_decade,
            selected_year=selected_year,
            filter_favorite=filter_favorite,
            filter_watched=filter_watched,
        )
        
        formatted_items = items if items and (
            "displayTitle" in items[0] or items[0].get("isSeriesNode")
        ) else self.formatter.format_media_cards(tab, items)
        
        safe_page = max(1, int(page or 1))
        if normalized_page_size:
            safe_page = max(1, min(safe_page, total_pages))
            
        return formatted_items, total_items, safe_page, normalized_page_size, total_pages
