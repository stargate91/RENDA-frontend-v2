from sqlalchemy.orm import Session

from .library_query_service import LibraryQueryService
from .library_scanner_service import LibraryScannerService
from .library_stats_service import LibraryStatsService
from .library_update_service import LibraryUpdateService
from .library_collection_service import LibraryCollectionService
from .library_people_service import LibraryPeopleService
from .library_tab_service import LibraryTabService


class MediaLibraryService:
    """
    Backward-compatible facade for library operations.
    New code should prefer the narrower services directly.
    """

    def __init__(self, db: Session):
        self.db = db
        self.stats = LibraryStatsService(db)
        self.collections = LibraryCollectionService(db)
        self.people = LibraryPeopleService(db)
        self.tabs = LibraryTabService(db)
        self.query = LibraryQueryService(db)
        self.update = LibraryUpdateService(db)
        self.scanner = LibraryScannerService(db)

    def get_stats(self):
        return self.stats.get_stats()

    def get_continue_watching(self, limit=12):
        return self.query.get_continue_watching(limit=limit)

    def get_grouped_library(self, requested_tabs=None):
        return self.tabs.get_grouped_library(requested_tabs=requested_tabs)

    def get_library_filter_options(self, tab: str, filter_ownership: str = "owned", filter_status: str = "active"):
        return self.tabs.get_library_filter_options(tab, filter_ownership, filter_status)

    def get_library_tab_page(
        self,
        tab,
        page=1,
        page_size=40,
        sort_by="title_asc",
        search="",
        selected_tags=None,
        selected_genre=None,
        selected_decade=None,
        selected_year=None,
        filter_favorite="all",
        filter_watched="all",
        filter_ownership="owned",
        filter_status="active",
        filter_gender="all",
        people_role="all",
    ):
        return self.tabs.get_library_tab_page(
            tab=tab,
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
            filter_ownership=filter_ownership,
            filter_status=filter_status,
            filter_gender=filter_gender,
            people_role=people_role,
        )

    def get_tag_groups(self):
        return self.query.get_tag_groups()

    def get_people_group(self, role: str, filter_status: str = "active", tab: str = "people"):
        return self.people.get_people_group(role, filter_status=filter_status, tab=tab)

    def get_movie_collections(self, page=1, page_size=40, search=""):
        return self.collections.get_movie_collections(page=page, page_size=page_size, search=search)

    def _get_people_group(self, role: str):
        return self.get_people_group(role, filter_status="active")
