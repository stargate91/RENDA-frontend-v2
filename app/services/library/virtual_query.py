from typing import Optional
from sqlalchemy import case, cast, func, literal, or_, and_, select, String, Integer, Float, union_all
from sqlalchemy.orm import Session
from ...db.models import ItemStatus, ItemType, MediaItem, VirtualMediaState
from ...db.models.metadata import MediaMatch, OMDBCache
from ...utils.library_utils import _preferred_metadata_languages, _split_genres, _pick_tmdb_cache
from ...utils.library_utils.image_constants import POSTER_SIZE
from ...utils.library_helpers import public_image_path as _public_image_path
from .asset_resolver import resolve_asset_path
from ..library_virtual_cache_service import LibraryVirtualCacheService
from .formatter import LibraryFormatterService
from .filter_sort import LibraryFilterSortService

class LibraryVirtualQueryService:
    def __init__(self, db: Session, virtual_cache: LibraryVirtualCacheService, formatter: LibraryFormatterService, filter_sort: LibraryFilterSortService):
        self.db = db
        self.virtual_cache = virtual_cache
        self.formatter = formatter
        self.filter_sort = filter_sort

    def get_virtual_unowned_page(
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
    ) -> tuple[list[dict], int, Optional[int], int]:
        if tab in {"series", "adult_series"}:
            media_type = "tv"
        elif tab in {"scenes", "adult_scenes"}:
            media_type = "scene"
        else:
            media_type = "movie"

        adult_only = tab in {"adult", "adult_series", "adult_scenes"}
        safe_page = max(1, int(page or 1))
        safe_page_size = None if page_size is None or int(page_size) <= 0 else min(1000, max(20, int(page_size)))
        preferred_languages = _preferred_metadata_languages(self.db)
        has_tmdb_cache = self.virtual_cache.can_join_tmdb_cache_in_main_query()
        sort_metric = str(sort_by or "title_asc").replace("_asc", "").replace("_desc", "")
        needs_cache_metadata = bool(
            (selected_genre and selected_genre != "all")
            or (selected_decade and selected_decade != "all")
            or (selected_year not in (None, "", "all"))
            or sort_metric in {"year", "rating", "rating_imdb", "release_date"}
        )

        list_snapshot_sq = self.virtual_cache.build_virtual_list_snapshot_subquery(media_type)

        state_keys_sq = (
            select(
                VirtualMediaState.tmdb_id.label("tmdb_id"),
                VirtualMediaState.media_type.label("media_type"),
            )
            .where(
                VirtualMediaState.media_type == media_type,
                VirtualMediaState.is_tracked == True,
            )
        )

        list_keys_sq = select(
            list_snapshot_sq.c.tmdb_id.label("tmdb_id"),
            list_snapshot_sq.c.media_type.label("media_type"),
        )

        candidate_union_sq = union_all(list_keys_sq, state_keys_sq).subquery()
        candidate_keys_sq = (
            select(
                candidate_union_sq.c.tmdb_id,
                candidate_union_sq.c.media_type,
            )
            .group_by(candidate_union_sq.c.tmdb_id, candidate_union_sq.c.media_type)
            .subquery()
        )

        if media_type == "movie":
            local_owned_ids_sq = (
                select(MediaMatch.tmdb_id)
                .select_from(MediaMatch)
                .join(MediaItem, MediaItem.id == MediaMatch.media_item_id)
                .where(
                    MediaMatch.is_active == True,
                    MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED]),
                    MediaItem.item_type == ItemType.MOVIE,
                    MediaMatch.tmdb_id.isnot(None),
                )
                .group_by(MediaMatch.tmdb_id)
                .subquery()
            )
        elif media_type == "scene":
            local_owned_ids_sq = (
                select(MediaMatch.tmdb_id)
                .select_from(MediaMatch)
                .join(MediaItem, MediaItem.id == MediaMatch.media_item_id)
                .where(
                    MediaMatch.is_active == True,
                    MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED]),
                    MediaItem.item_type == ItemType.SCENE,
                    MediaMatch.tmdb_id.isnot(None),
                )
                .group_by(MediaMatch.tmdb_id)
                .subquery()
            )
        else:
            local_owned_ids_sq = (
                select(func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id).label("tmdb_id"))
                .select_from(MediaMatch)
                .join(MediaItem, MediaItem.id == MediaMatch.media_item_id)
                .where(
                    MediaMatch.is_active == True,
                    MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED]),
                    MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]),
                    func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id).isnot(None),
                )
                .group_by(func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id))
                .subquery()
            )

        cache_sq = self.virtual_cache.build_virtual_cache_choice_subquery(media_type, preferred_languages) if has_tmdb_cache else None

        base = (
            self.db.query(
                candidate_keys_sq.c.tmdb_id.label("tmdb_id"),
                list_snapshot_sq.c.list_title.label("list_title"),
                list_snapshot_sq.c.list_poster_path.label("list_poster_path"),
                VirtualMediaState.manual_poster_path.label("manual_poster_path"),
                VirtualMediaState.manual_local_poster_path.label("manual_local_poster_path"),
                VirtualMediaState.user_rating.label("user_rating"),
                VirtualMediaState.is_favorite.label("is_favorite"),
                VirtualMediaState.is_watched.label("is_watched"),
                VirtualMediaState.custom_tags.label("custom_tags"),
                VirtualMediaState.updated_at.label("updated_at"),
                (cache_sq.c.raw_data if cache_sq is not None else literal(None)).label("raw_data"),
            )
            .select_from(candidate_keys_sq)
            .outerjoin(
                VirtualMediaState,
                and_(
                    VirtualMediaState.tmdb_id == candidate_keys_sq.c.tmdb_id,
                    VirtualMediaState.media_type == candidate_keys_sq.c.media_type,
                ),
            )
            .outerjoin(
                list_snapshot_sq,
                and_(
                    list_snapshot_sq.c.tmdb_id == candidate_keys_sq.c.tmdb_id,
                    list_snapshot_sq.c.media_type == candidate_keys_sq.c.media_type,
                ),
            )
            .outerjoin(local_owned_ids_sq, local_owned_ids_sq.c.tmdb_id == candidate_keys_sq.c.tmdb_id)
            .filter(local_owned_ids_sq.c.tmdb_id.is_(None))
            .filter(or_(VirtualMediaState.id.is_(None), VirtualMediaState.is_tracked == True))
        )
        if cache_sq is not None:
            base = base.outerjoin(cache_sq, cache_sq.c.tmdb_id == candidate_keys_sq.c.tmdb_id)

        if cache_sq is not None:
            title_field = "$.name" if media_type == "tv" else "$.title"
            title_expr = func.coalesce(
                cast(func.json_extract(cache_sq.c.raw_data, title_field), String),
                list_snapshot_sq.c.list_title,
                literal(""),
            )
            original_title_expr = func.coalesce(
                cast(func.json_extract(cache_sq.c.raw_data, "$.original_name" if media_type == "tv" else "$.original_title"), String),
                literal(""),
            )
            date_field = "$.date" if media_type == "scene" else ("$.first_air_date" if media_type == "tv" else "$.release_date")
            release_date_expr = cast(
                func.json_extract(cache_sq.c.raw_data, date_field),
                String,
            )
            year_expr = cast(func.substr(release_date_expr, 1, 4), Integer)
            rating_expr = cast(func.json_extract(cache_sq.c.raw_data, "$.vote_average"), Float)
            genres_expr = cast(func.json_extract(cache_sq.c.raw_data, "$.genres"), String)
            adult_expr = literal(1) if media_type == "scene" else cast(func.json_extract(cache_sq.c.raw_data, "$.adult"), Integer)
        else:
            title_expr = func.coalesce(list_snapshot_sq.c.list_title, literal(""))
            original_title_expr = literal("")
            release_date_expr = literal("")
            year_expr = literal(0)
            rating_expr = literal(0)
            genres_expr = literal("")
            adult_expr = literal(None)
        tags_expr = cast(VirtualMediaState.custom_tags, String)

        if cache_sq is not None:
            base = base.filter(adult_expr == 1 if adult_only else func.coalesce(adult_expr, 0) == 0)

        if filter_favorite == "favorites":
            base = base.filter(VirtualMediaState.is_favorite == True)
        if filter_watched == "watched":
            base = base.filter(VirtualMediaState.is_watched == True)
        elif filter_watched == "unwatched":
            base = base.filter(or_(VirtualMediaState.is_watched == False, VirtualMediaState.is_watched.is_(None)))

        normalized_search = (search or "").strip().lower()
        if normalized_search and (has_tmdb_cache or not needs_cache_metadata):
            search_like = f"%{normalized_search}%"
            base = base.filter(
                or_(
                    func.lower(title_expr).like(search_like),
                    func.lower(original_title_expr).like(search_like),
                )
            )

        if selected_tags:
            for tag in selected_tags:
                base = base.filter(tags_expr.like(f'%"{tag}"%'))

        if selected_genre and selected_genre != "all" and has_tmdb_cache:
            base = base.filter(func.lower(genres_expr).like(f"%{str(selected_genre).lower()}%"))
        if selected_year not in (None, "", "all") and has_tmdb_cache:
            try:
                selected_year_int = int(selected_year)
                base = base.filter(year_expr == selected_year_int)
            except (TypeError, ValueError):
                pass
        if selected_decade and selected_decade != "all" and has_tmdb_cache:
            try:
                selected_decade_start = int(str(selected_decade).replace("s", ""))
                base = base.filter(year_expr >= selected_decade_start, year_expr <= selected_decade_start + 9)
            except (TypeError, ValueError):
                pass

        order_direction_desc = str(sort_by or "").endswith("_desc")
        order_expr = func.lower(title_expr)
        if sort_metric == "year":
            order_expr = func.coalesce(year_expr, 0)
        elif sort_metric == "release_date":
            order_expr = func.coalesce(release_date_expr, "")
        elif sort_metric == "rating":
            order_expr = func.coalesce(rating_expr, 0)
        elif sort_metric == "user_rating":
            order_expr = func.coalesce(VirtualMediaState.user_rating, 0)
        elif sort_metric == "rating_imdb":
            order_expr = literal(0)

        if has_tmdb_cache or not needs_cache_metadata:
            if sort_metric in {"year", "rating", "user_rating", "rating_imdb", "release_date"}:
                base = base.order_by(order_expr.desc() if order_direction_desc else order_expr.asc(), func.lower(title_expr).asc(), candidate_keys_sq.c.tmdb_id.asc())
            else:
                base = base.order_by(order_expr.desc() if order_direction_desc else order_expr.asc(), candidate_keys_sq.c.tmdb_id.asc())

        python_postprocess = needs_cache_metadata and not has_tmdb_cache
        total_items = base.count() if not python_postprocess else None
        if python_postprocess:
            rows = base.all()
        elif safe_page_size:
            rows = base.offset((safe_page - 1) * safe_page_size).limit(safe_page_size).all()
        else:
            rows = base.all()

        preloaded_cache_payload = {}
        if python_postprocess:
            preloaded_cache_payload = self.virtual_cache.preload_virtual_cache_payload(
                media_type,
                [int(row.tmdb_id) for row in rows if row.tmdb_id is not None],
                preferred_languages,
            )

        resolved_raw_payloads = {}
        for row in rows:
            raw_data = row.raw_data if isinstance(row.raw_data, dict) else {}
            if python_postprocess:
                raw_data = preloaded_cache_payload.get(int(row.tmdb_id), raw_data if isinstance(raw_data, dict) else {})
            if not raw_data:
                cached = _pick_tmdb_cache(self.db, row.tmdb_id, media_type, preferred_languages)
                raw_data = cached.raw_data if cached and isinstance(cached.raw_data, dict) else {}
            resolved_raw_payloads[row.tmdb_id] = raw_data if isinstance(raw_data, dict) else {}

        if python_postprocess or cache_sq is None:
            rows = [
                row for row in rows
                if bool(resolved_raw_payloads.get(row.tmdb_id, {}).get("adult", False)) == adult_only
            ]
            total_items = len(rows)

        omdb_map = {}
        imdb_ids = {
            raw_data.get("external_ids", {}).get("imdb_id") or raw_data.get("imdb_id")
            for raw_data in resolved_raw_payloads.values()
            if isinstance(raw_data, dict)
        }
        imdb_ids = {imdb_id for imdb_id in imdb_ids if imdb_id}
        if imdb_ids:
            omdb_rows = self.db.query(OMDBCache).filter(OMDBCache.imdb_id.in_(imdb_ids)).all()
            omdb_map = {
                row.imdb_id: row.raw_data
                for row in omdb_rows
                if row.imdb_id and isinstance(row.raw_data, dict)
            }

        def _get_virtual_imdb_rating(raw_data):
            if not isinstance(raw_data, dict):
                return None
            imdb_id = raw_data.get("external_ids", {}).get("imdb_id") or raw_data.get("imdb_id")
            if not imdb_id:
                return None
            omdb_raw = omdb_map.get(imdb_id)
            if not isinstance(omdb_raw, dict):
                return None
            try:
                rating = float(omdb_raw.get("imdb_rating"))
            except (TypeError, ValueError):
                return None
            return rating if rating > 0 else None

        items = []
        for row in rows:
            raw_data = resolved_raw_payloads.get(row.tmdb_id, {})
            if media_type == "scene":
                raw_poster_path = row.manual_poster_path or (raw_data.get("images", [{}])[0].get("url") if raw_data.get("images") else None) or row.list_poster_path
            else:
                raw_poster_path = row.manual_poster_path or raw_data.get("poster_path") or row.list_poster_path

            local_poster_path = resolve_asset_path(
                subfolder="posters",
                manual_local_path=row.manual_local_poster_path,
                manual_path=row.manual_poster_path,
                remote_path=(raw_data.get("images", [{}])[0].get("url") if media_type == "scene" and raw_data.get("images") else raw_data.get("poster_path")) or row.list_poster_path,
            )
            title = row.list_title or "Unknown TMDB Item"
            if media_type == "tv":
                title = raw_data.get("name") or raw_data.get("title") or title
            elif media_type == "scene":
                title = raw_data.get("title") or title
            else:
                title = raw_data.get("title") or raw_data.get("name") or title

            if media_type == "scene":
                release_date = raw_data.get("date")
            else:
                release_date = raw_data.get("first_air_date") if media_type == "tv" else raw_data.get("release_date")

            year_value = None
            if release_date and len(str(release_date)) >= 4:
                try:
                    year_value = int(str(release_date)[:4])
                except (TypeError, ValueError):
                    year_value = None

            year_display = None
            if media_type == "tv" and str(raw_data.get("status") or "").lower() in {"ended", "canceled", "cancelled"}:
                first_air_date = raw_data.get("first_air_date")
                last_air_date = raw_data.get("last_air_date")
                if first_air_date and last_air_date and len(first_air_date) >= 4 and len(last_air_date) >= 4:
                    first_year = first_air_date[:4]
                    last_year = last_air_date[:4]
                    year_display = first_year if first_year == last_year else f"{first_year}-{last_year}"

            genres = _split_genres([
                genre.get("name") if isinstance(genre, dict) else genre
                for genre in (raw_data.get("genres") or [])
                if (isinstance(genre, dict) and genre.get("name")) or isinstance(genre, str)
            ])

            items.append({
                "id": f"stash_{raw_data.get('id')}" if media_type == "scene" and raw_data.get("id") else f"tmdb_{row.tmdb_id}",
                "title": title,
                "original_title": raw_data.get("original_title"),
                "original_series_title": raw_data.get("original_name") if media_type == "tv" else None,
                "year": year_value,
                "year_display": year_display,
                "release_date": release_date,
                "poster_path": raw_poster_path,
                "local_poster_path": local_poster_path,
                "displayPosterRemote": raw_poster_path if media_type == "scene" else (f"https://image.tmdb.org/t/p/{POSTER_SIZE}{raw_poster_path}" if raw_poster_path else None),
                "rating": raw_data.get("vote_average") or 0,
                "rating_tmdb": raw_data.get("vote_average") or 0,
                "rating_imdb": _get_virtual_imdb_rating(raw_data),
                "type": "scene" if media_type == "scene" else ("series" if media_type == "tv" else "movie"),
                "series_tmdb_id": row.tmdb_id if media_type == "tv" else None,
                "tmdb_id": row.tmdb_id,
                "series_title": title if media_type == "tv" else None,
                "is_favorite": bool(row.is_favorite) if row.is_favorite is not None else False,
                "in_library": False,
                "user_rating": row.user_rating,
                "custom_tags": row.custom_tags or [],
                "genres": genres,
                "is_watched": bool(row.is_watched) if row.is_watched is not None else False,
                "resume_position": 0,
                "duration": 0,
                "added_at": row.updated_at.isoformat() if row.updated_at else None,
                "file_size": 0,
            })

        if python_postprocess:
            formatted_items = self.formatter.format_media_cards(tab, items)
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
                filter_ownership="unowned",
            )
            sorted_items = self.filter_sort.sort_media_cards(filtered_items, sort_by)
            total_items = len(sorted_items)
            if safe_page_size:
                start_index = (safe_page - 1) * safe_page_size
                paged_items = sorted_items[start_index:start_index + safe_page_size]
            else:
                paged_items = sorted_items
            total_pages = 1 if not safe_page_size else max(1, (total_items + safe_page_size - 1) // safe_page_size)
            return paged_items, total_items, safe_page_size, total_pages

        total_pages = 1 if not safe_page_size else max(1, (total_items + safe_page_size - 1) // safe_page_size)
        return items, total_items, safe_page_size, total_pages
