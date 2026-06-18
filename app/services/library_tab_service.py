from typing import Optional
from sqlalchemy.orm import Session

from ..repositories.media_repository import MediaRepository
from .library_virtual_cache_service import LibraryVirtualCacheService


class LibraryTabService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = MediaRepository(db)
        from .library_collection_service import LibraryCollectionService
        self.collection_service = LibraryCollectionService(db)
        from .library_people_service import LibraryPeopleService
        self.people_service = LibraryPeopleService(db)

        # Initialize the extracted logic services
        from .library_virtual_cache_service import LibraryVirtualCacheService
        from .library.formatter import LibraryFormatterService
        from .library.filter_sort import LibraryFilterSortService
        from .library.virtual_query import LibraryVirtualQueryService
        from .library.grouped import LibraryGroupedService
        
        self.virtual_cache = LibraryVirtualCacheService(db)
        self.formatter = LibraryFormatterService(db)
        self.filter_sort = LibraryFilterSortService()
        self.virtual_query = LibraryVirtualQueryService(db, self.virtual_cache, self.formatter, self.filter_sort)

        self.grouped_service = LibraryGroupedService(
            db=db,
            repository=self.repository,
            collection_service=self.collection_service,
            people_service=self.people_service,
            formatter=self.formatter,
        )

        # Initialize the Providers
        from .library.providers.owned import OwnedTabProvider
        from .library.providers.virtual import VirtualTabProvider
        from .library.providers.people import PeopleTabProvider
        
        self.owned_provider = OwnedTabProvider(db, self.formatter, self.filter_sort, self.repository, self.get_grouped_library)
        self.virtual_provider = VirtualTabProvider(db, self.formatter, self.filter_sort, self.virtual_query)
        self.people_provider = PeopleTabProvider(db, self.formatter, self.filter_sort, self.people_service)

    def get_library_tab_page(
        self,
        tab: str,
        page: int = 1,
        page_size: Optional[int] = 40,
        sort_by: str = "title_asc",
        search: str = "",
        selected_tags: Optional[list[str]] = None,
        selected_genre: Optional[str] = None,
        selected_decade: Optional[str] = None,
        selected_year: Optional[int] = None,
        filter_favorite: str = "all",
        filter_watched: str = "all",
        filter_ownership: str = "owned",
        filter_status: str = "active",
        filter_gender: str = "all",
        people_role: str = "all",
    ) -> dict:
        normalized_tab = (tab or "movies").lower()
        if normalized_tab not in {"movies", "series", "adult", "adult_series", "people", "adult_people", "actors", "directors"}:
            raise ValueError(f"Unsupported library tab: {tab}")
        if normalized_tab in {"actors", "directors"}:
            normalized_tab = "people"

        items, total_items, safe_page, safe_page_size, total_pages = [], 0, 1, page_size, 1

        if normalized_tab in {"movies", "series", "adult", "adult_series"} and filter_ownership == "owned":
            items, total_items, safe_page, safe_page_size, total_pages = self.owned_provider.get_page(
                normalized_tab, page, page_size, sort_by, search, selected_tags, selected_genre, selected_decade, selected_year, filter_favorite, filter_watched, filter_ownership, filter_status, filter_gender
            )
        elif normalized_tab in {"movies", "series", "adult", "adult_series"} and filter_ownership == "unowned":
            items, total_items, safe_page, safe_page_size, total_pages = self.virtual_provider.get_page(
                normalized_tab, page, page_size, sort_by, search, selected_tags, selected_genre, selected_decade, selected_year, filter_favorite, filter_watched, filter_ownership, filter_status, filter_gender
            )
        elif normalized_tab in {"people", "adult_people"}:
            items, total_items, safe_page, safe_page_size, total_pages = self.people_provider.get_page(
                normalized_tab, page, page_size, sort_by, search, selected_tags, selected_genre, selected_decade, selected_year, filter_favorite, filter_watched, filter_ownership, filter_status, filter_gender
                , people_role
            )
        else:
            # Fallback
            items, total_items, safe_page, safe_page_size, total_pages = self.owned_provider.get_page(
                normalized_tab, page, page_size, sort_by, search, selected_tags, selected_genre, selected_decade, selected_year, filter_favorite, filter_watched, filter_ownership, filter_status, filter_gender
            )

        owned_counts = self.repository.get_library_owned_counts()
        counts = self.grouped_service.get_grouped_library(
            requested_tabs={"movies", "series", "adult", "adult_series", "people", "adult_people"}
        ).get("counts", {})
        counts["movies"] = owned_counts.get("movies", 0)
        counts["series"] = owned_counts.get("series", 0)
        counts["adult"] = owned_counts.get("adult", 0)
        counts["adult_series"] = owned_counts.get("adult_series", 0)

        return {
            "tab": normalized_tab,
            "items": items,
            "counts": counts,
            "owned_counts": owned_counts,
            "total_items": total_items,
            "page": safe_page,
            "page_size": safe_page_size,
            "total_pages": total_pages,
        }

    def get_grouped_library(self, requested_tabs: Optional[set[str]] = None) -> dict:
        return self.grouped_service.get_grouped_library(requested_tabs=requested_tabs)

    def get_library_filter_options(self, tab: str, filter_ownership: str = "owned", filter_status: str = "active") -> dict:
        return self.grouped_service.get_library_filter_options(tab, filter_ownership, filter_status)
