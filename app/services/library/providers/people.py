from typing import Optional, Tuple
from sqlalchemy.orm import Session
from .base import BaseTabProvider
from ..formatter import LibraryFormatterService
from ..filter_sort import LibraryFilterSortService
from ...library_people_service import LibraryPeopleService

class PeopleTabProvider(BaseTabProvider):
    def __init__(self, db: Session, formatter: LibraryFormatterService, filter_sort: LibraryFilterSortService, people_service: LibraryPeopleService):
        super().__init__(db, formatter, filter_sort)
        self.people_service = people_service

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
        people_role: str,
    ) -> Tuple[list[dict], int, int, Optional[int], int]:
        raw_items = self.people_service.get_people_group(people_role, filter_status=filter_status, tab=tab)
        card_items = self.formatter.format_media_cards(tab, raw_items)
        
        filtered_items = self.filter_sort.filter_media_cards(
            tab,
            card_items,
            search=search,
            selected_tags=selected_tags,
            selected_genre=selected_genre,
            selected_decade=selected_decade,
            selected_year=selected_year,
            filter_favorite=filter_favorite,
            filter_watched=filter_watched,
            filter_ownership=filter_ownership,
            filter_gender=filter_gender,
        )
        sorted_items = self.filter_sort.sort_media_cards(filtered_items, sort_by)

        if page_size is None or int(page_size) <= 0:
            paged_items = sorted_items
            total_pages = 1
            safe_page_size = None
            safe_page = 1
        else:
            safe_page_size = min(1000, max(20, int(page_size)))
            total_pages = max(1, (len(sorted_items) + safe_page_size - 1) // safe_page_size)
            safe_page = max(1, min(int(page), total_pages))
            start_index = (safe_page - 1) * safe_page_size
            paged_items = sorted_items[start_index:start_index + safe_page_size]

        return paged_items, len(sorted_items), safe_page, safe_page_size, total_pages
