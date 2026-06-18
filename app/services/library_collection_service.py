from typing import Optional
from sqlalchemy.orm import Session

from app.services.language_service import LanguageService
from .library.asset_resolver import has_local_asset, resolve_asset_path
from ..db.models import ItemType
from ..repositories.media_repository import MediaRepository
from ..schemas.media import LibraryCollectionsPageDTO, LibraryCollectionDTO, LibraryCollectionItemDTO
from ..utils.library_utils import _preferred_metadata_language
from ..utils.library_utils.image_constants import POSTER_SIZE
from ..utils.library_helpers import match_language_code as _match_language_code, public_image_path as _public_image_path

class LibraryCollectionService:
    """
    Service for querying and organizing movie collections.
    """

    def __init__(self, db: Session):
        self.db = db
        self.repository = MediaRepository(db)

    def get_movie_collections(
        self,
        page: int = 1,
        page_size: Optional[int] = 40,
        search: str = "",
        tab: str = "movies",
    ) -> LibraryCollectionsPageDTO:
        sorted_items = self._build_movie_collection_rows(search=search, tab=tab)
        return self._paginate_collections(sorted_items, page=page, page_size=page_size)

    def _build_movie_collection_rows(self, search: str = "", tab: str = "movies") -> list[dict]:
        ui_lang = _preferred_metadata_language(self.db)
        normalized_search = (search or "").strip().lower()
        items = self.repository.get_library_items(requested_tabs={tab})
        collections_map: dict[int, dict] = {}

        for item in items:
            if item.item_type != ItemType.MOVIE:
                continue

            active_match = next((match for match in item.matches if match.is_active), None)
            if not active_match or not active_match.collection_tmdb_id:
                continue

            if tab == "adult" and not active_match.is_adult:
                continue
            if tab == "movies" and active_match.is_adult:
                continue

            collection_loc = self._pick_collection_localization(active_match.collection_entity, ui_lang)
            collection_title = (
                collection_loc.name
                if collection_loc and collection_loc.name
                else active_match.collection
                or f"Collection {active_match.collection_tmdb_id}"
            )
            if normalized_search and normalized_search not in collection_title.lower():
                continue

            entry = collections_map.get(active_match.collection_tmdb_id)
            if not entry:
                collection_poster = self._resolve_collection_poster(collection_loc)
                entry = {
                    "id": f"collection_{active_match.collection_tmdb_id}",
                    "tmdb_id": active_match.collection_tmdb_id,
                    "title": collection_title,
                    "overview": collection_loc.overview if collection_loc else None,
                    "poster_path": collection_poster,
                    "has_local_poster": has_local_asset(
                        subfolder="posters",
                        manual_local_path=getattr(collection_loc, "manual_local_poster_path", None) if collection_loc else None,
                        local_path=collection_loc.local_poster_path if collection_loc else None,
                    ),
                    "poster_remote_path": f"https://image.tmdb.org/t/p/{POSTER_SIZE}{getattr(collection_loc, 'manual_poster_path', None) or collection_loc.poster_path}" if collection_loc and (getattr(collection_loc, "manual_poster_path", None) or collection_loc.poster_path) else None,
                    "backdrop_path": self._resolve_collection_backdrop(active_match.collection_entity),
                    "owned_count": 0,
                    "total_count": int(getattr(active_match.collection_entity, "total_parts", 0) or 0),
                    "type": "collection",
                    "movies": [],
                }
                collections_map[active_match.collection_tmdb_id] = entry

            movie_loc = self._pick_match_localization(active_match, ui_lang)
            movie_year = self._match_year(item, active_match)
            entry["owned_count"] += 1
            entry["movies"].append({
                "id": item.id,
                "title": movie_loc.title if movie_loc and movie_loc.title else (item.fn_title or item.fd_title or item.filename),
                "year": movie_year,
                "poster_path": self._resolve_match_poster(movie_loc),
                "has_local_poster": has_local_asset(
                    subfolder="posters",
                    manual_local_path=getattr(movie_loc, "manual_local_poster_path", None) if movie_loc else None,
                    local_path=movie_loc.local_poster_path if movie_loc else None,
                ),
                    "backdrop_path": _public_image_path(getattr(active_match, "manual_local_backdrop_path", None), "backdrops") or _public_image_path(active_match.local_backdrop_path, "backdrops") or getattr(active_match, "manual_backdrop_path", None) or active_match.backdrop_path if active_match else None,
                "rating": active_match.rating_tmdb or 0,
                "rating_imdb": active_match.rating_imdb,
                "type": item.item_type.value,
                "tmdb_id": active_match.tmdb_id,
                "path": item.current_path,
                "is_favorite": bool(item.is_favorite),
                "user_rating": item.user_rating,
            })

        from ..formatter.config import FormatterConfig
        config = FormatterConfig.from_db(self.db)
        collection_mode = config.collection_folder_mode
        threshold = config.collection_folder_threshold

        filtered_collections = []
        for col in collections_map.values():
            if collection_mode == "never":
                continue
            elif collection_mode == "threshold":
                if col["owned_count"] >= threshold:
                    filtered_collections.append(col)
            elif collection_mode == "complete_only":
                if col["total_count"] > 0 and col["owned_count"] >= col["total_count"]:
                    filtered_collections.append(col)
            else:  # always or fallback
                if col["owned_count"] >= 1:
                    filtered_collections.append(col)

        sorted_items = sorted(
            filtered_collections,
            key=lambda collection: (-collection["owned_count"], str(collection["title"]).lower(), collection["tmdb_id"]),
        )
        return sorted_items

    def _paginate_collections(self, items: list[dict], page: int, page_size: Optional[int]) -> LibraryCollectionsPageDTO:
        total_items = len(items)
        if page_size is None or int(page_size) <= 0:
            paged_items = items
            total_pages = 1
            normalized_page_size = None
            current_page = 1
        else:
            normalized_page_size = min(1000, max(1, int(page_size)))
            total_pages = max(1, (total_items + normalized_page_size - 1) // normalized_page_size)
            current_page = max(1, min(int(page), total_pages))
            start_index = (current_page - 1) * normalized_page_size
            paged_items = items[start_index:start_index + normalized_page_size]

        dto_items = []
        for item in paged_items:
            dto_items.append(
                LibraryCollectionDTO(
                    id=item["id"],
                    tmdb_id=item["tmdb_id"],
                    title=item["title"],
                    overview=item.get("overview"),
                    poster_path=item.get("poster_path"),
                    has_local_poster=item.get("has_local_poster", False),
                    poster_remote_path=item.get("poster_remote_path"),
                    backdrop_path=item.get("backdrop_path"),
                    owned_count=item.get("owned_count", 0),
                    total_count=item.get("total_count", 0),
                    type=item.get("type", "collection"),
                    movies=[LibraryCollectionItemDTO(**movie) for movie in item.get("movies", [])],
                )
            )

        return LibraryCollectionsPageDTO(
            items=dto_items,
            total_items=total_items,
            page=current_page,
            page_size=normalized_page_size,
            total_pages=total_pages,
        )

    def _pick_collection_localization(self, collection, ui_lang: Optional[str]):
        if not collection or not getattr(collection, "localizations", None):
            return None
        locales = [ui_lang] if ui_lang else []
        return LanguageService.pick_localization(collection.localizations, locales)

    def _resolve_collection_image(self, collection_loc, image_kind: str) -> Optional[str]:
        if not collection_loc:
            return None
        if image_kind == "poster":
            return self._resolve_collection_poster(collection_loc)
        return None

    def _resolve_collection_backdrop(self, collection) -> Optional[str]:
        if not collection:
            return None
        return _public_image_path(getattr(collection, "manual_local_backdrop_path", None), "backdrops") or _public_image_path(collection.local_backdrop_path, "backdrops") or getattr(collection, "manual_backdrop_path", None) or collection.backdrop_path

    def _pick_match_localization(self, match, ui_lang: Optional[str]):
        if not match or not match.localizations:
            return None
        locales = [ui_lang] if ui_lang else []
        return LanguageService.pick_localization(match.localizations, locales)

    def _resolve_match_poster(self, movie_loc) -> Optional[str]:
        if not movie_loc:
            return None
        return resolve_asset_path(
            subfolder="posters",
            manual_local_path=getattr(movie_loc, "manual_local_poster_path", None),
            manual_path=getattr(movie_loc, "manual_poster_path", None),
            local_path=movie_loc.local_poster_path,
            remote_path=movie_loc.poster_path,
        )

    def _resolve_collection_poster(self, collection_loc) -> Optional[str]:
        if not collection_loc:
            return None
        return resolve_asset_path(
            subfolder="posters",
            manual_local_path=getattr(collection_loc, "manual_local_poster_path", None),
            manual_path=getattr(collection_loc, "manual_poster_path", None),
            local_path=collection_loc.local_poster_path,
            remote_path=collection_loc.poster_path,
        )

    def _match_year(self, item, active_match) -> Optional[int]:
        if not active_match:
            return item.fn_year or item.fd_year
        if active_match.release_date:
            return active_match.release_date.year
        if active_match.first_air_date:
            return active_match.first_air_date.year
        return item.fn_year or item.fd_year
