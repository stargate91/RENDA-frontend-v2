from typing import Optional, Tuple, Callable
from sqlalchemy.orm import Session
from .base import BaseTabProvider
from ..formatter import LibraryFormatterService
from ..filter_sort import LibraryFilterSortService
from ....repositories.media_repository import MediaRepository
from ....utils.library_utils import _preferred_metadata_language

class OwnedTabProvider(BaseTabProvider):
    def __init__(self, db: Session, formatter: LibraryFormatterService, filter_sort: LibraryFilterSortService, repository: MediaRepository, get_grouped_library_func: Callable):
        super().__init__(db, formatter, filter_sort)
        self.repository = repository
        self.get_grouped_library_func = get_grouped_library_func

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
        ui_lang = _preferred_metadata_language(self.db)

        if tab in {"series", "adult_series"}:
            owned_series_items = self.repository.get_library_items(requested_tabs={tab})
            card_items = []
            for item in owned_series_items:
                mapped = self.formatter.library_item_to_card(item, ui_lang)
                if not mapped:
                    continue
                target_group, data = mapped
                if target_group == tab:
                    card_items.append(data)

            formatted_items = self.formatter.format_media_cards(tab, card_items)
            filtered_items = self.filter_sort.filter_media_cards(
                tab,
                formatted_items,
                search=search,
                selected_tags=selected_tags,
                selected_genre=selected_genre,
                selected_decade=selected_decade,
                selected_year=selected_year,
                filter_favorite=filter_favorite,
                filter_watched=filter_watched,
                filter_ownership=filter_ownership,
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

        # Movies / Adult Fast Path
        if not search and not (selected_tags or []) and (not selected_genre or selected_genre == "all") and (not selected_decade or selected_decade == "all") and (selected_year is None or selected_year == "" or selected_year == "all") and page_size is not None and int(page_size) > 0:
            safe_page_size = min(1000, max(20, int(page_size)))
            safe_page = max(1, int(page))
            items, total_items = self.repository.get_owned_library_page(
                tab,
                page=safe_page,
                page_size=safe_page_size,
                sort_by=sort_by,
                filter_favorite=filter_favorite,
                filter_watched=filter_watched,
            )
            card_items = []
            for item in items:
                mapped = self.formatter.library_item_to_card(item, ui_lang)
                if not mapped:
                    continue
                target_group, data = mapped
                if target_group == tab:
                    card_items.append(data)

            formatted_items = self.formatter.format_media_cards(tab, card_items)
            total_pages = max(1, (total_items + safe_page_size - 1) // safe_page_size)
            return formatted_items, total_items, max(1, min(safe_page, total_pages)), safe_page_size, total_pages

        # Fallback for complex filters
        grouped = self.get_grouped_library_func(requested_tabs={tab})
        raw_items = grouped.get(tab, [])
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
