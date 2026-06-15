from itertools import combinations
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
from sqlalchemy.orm import Session, joinedload, aliased
from sqlalchemy import func, or_
from app.db.deletion import delete_extra_files_by_ids, delete_media_items_by_ids
from app.db.models import MediaItem, MediaMatch, MediaCollection, ExtraFile, ItemStatus, ItemType, MovieEdition, MediaSource, MediaAudioType, PartType, PartStyle, ExtraSubtype, ExtraCategory, UserSetting, TMDBCache
from app.utils.library_utils import _split_genres

class MediaRepository:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _safe_file_size(path_str: Optional[str]) -> int:
        if not path_str:
            return 0
        try:
            path = Path(path_str)
            return path.stat().st_size if path.exists() else 0
        except OSError:
            return 0

    def _preferred_metadata_language(self) -> str:
        primary = self.db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
        if primary and primary.value and primary.value != "none":
            return primary.value
        fallback = self.db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()
        if fallback and fallback.value and fallback.value != "none":
            return fallback.value
        return "en-US"

    def _get_cached_genres_for_match(self, match: MediaMatch, preferred_lang: str) -> List[dict]:
        lang_candidates = [preferred_lang]
        short_lang = preferred_lang.split("-")[0]
        if short_lang not in lang_candidates:
            lang_candidates.append(short_lang)

        cache_query = self.db.query(TMDBCache).filter(TMDBCache.tmdb_id == match.tmdb_id)

        for lang in lang_candidates:
            cache = cache_query.filter(TMDBCache.cache_key.like(f"%language={lang}%")).order_by(TMDBCache.updated_at.desc()).first()
            if cache and isinstance(cache.raw_data, dict):
                genres = cache.raw_data.get("genres") or []
                if genres:
                    return genres

        fallback_cache = cache_query.order_by(TMDBCache.updated_at.desc()).first()
        if fallback_cache and isinstance(fallback_cache.raw_data, dict):
            return fallback_cache.raw_data.get("genres") or []

        return []

    def get_by_id(self, item_id: int) -> Optional[MediaItem]:
        return self.db.query(MediaItem).filter(MediaItem.id == item_id).first()

    def get_extra_by_id(self, extra_id: int) -> Optional[ExtraFile]:
        return self.db.query(ExtraFile).filter(ExtraFile.id == extra_id).first()

    def get_discovery_items(self) -> List[MediaItem]:
        return self.db.query(MediaItem).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
            joinedload(MediaItem.extras)
        ).filter(
            ~MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED, ItemStatus.IGNORED])
        ).all()

    def get_discovery_extras(self) -> List[Tuple[ExtraFile, ItemStatus, str, str]]:
        return self.db.query(
            ExtraFile, 
            MediaItem.status,
            MediaItem.planned_path, 
            MediaItem.filename
        ).join(
            MediaItem, ExtraFile.parent_item_id == MediaItem.id
        ).filter(
            ~MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED, ItemStatus.IGNORED])
        ).all()

    def get_discovery_item_count(self) -> int:
        return self.db.query(func.count(MediaItem.id)).filter(
            ~MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED, ItemStatus.IGNORED])
        ).scalar() or 0

    def get_library_items(self, requested_tabs: Optional[set[str]] = None) -> List[MediaItem]:
        requested_tabs = {tab.lower() for tab in (requested_tabs or set())}
        query = self.db.query(MediaItem).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
            joinedload(MediaItem.matches).joinedload(MediaMatch.collection_entity).joinedload(MediaCollection.localizations),
            joinedload(MediaItem.tags),
        ).filter(
            MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED])
        )

        if len(requested_tabs) == 1:
            tab = next(iter(requested_tabs))
            if tab == "movies":
                query = query.filter(MediaItem.item_type == ItemType.MOVIE)
            elif tab == "series":
                query = query.filter(MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]))
            elif tab == "adult":
                query = query.join(
                    MediaMatch,
                    (MediaMatch.media_item_id == MediaItem.id) & (MediaMatch.is_active == True)
                ).filter(
                    MediaMatch.is_adult == True,
                    MediaItem.item_type == ItemType.MOVIE
                ).distinct()
            elif tab == "adult_series":
                query = query.join(
                    MediaMatch,
                    (MediaMatch.media_item_id == MediaItem.id) & (MediaMatch.is_active == True)
                ).filter(
                    MediaMatch.is_adult == True,
                    MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE])
                ).distinct()

        return query.all()

    def get_library_owned_counts(self) -> Dict[str, int]:
        base_query = self.db.query(MediaItem).filter(
            MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED])
        )
        active_adult_match = self.db.query(MediaMatch.id).filter(
            MediaMatch.media_item_id == MediaItem.id,
            MediaMatch.is_active == True,
            MediaMatch.is_adult == True,
        ).exists()

        movies = base_query.filter(
            MediaItem.item_type == ItemType.MOVIE,
            ~active_adult_match,
        ).count()

        series = self.db.query(
            func.count(func.distinct(func.coalesce(MediaItem.fd_title, MediaItem.fn_title)))
        ).filter(
            MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED]),
            MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]),
            ~active_adult_match,
        ).scalar() or 0

        adult = base_query.filter(
            MediaItem.item_type == ItemType.MOVIE,
            active_adult_match,
        ).count()

        adult_series = self.db.query(
            func.count(func.distinct(func.coalesce(MediaItem.fd_title, MediaItem.fn_title)))
        ).filter(
            MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED]),
            MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]),
            active_adult_match,
        ).scalar() or 0

        return {
            "movies": movies,
            "series": series,
            "adult": adult,
            "adult_series": adult_series,
        }

    def get_owned_library_page(
        self,
        tab: str,
        page: int,
        page_size: int,
        sort_by: str = "title_asc",
        filter_favorite: str = "all",
        filter_watched: str = "all",
    ) -> Tuple[List[MediaItem], int]:
        active_sort_match = aliased(MediaMatch)
        active_adult_match = self.db.query(MediaMatch.id).filter(
            MediaMatch.media_item_id == MediaItem.id,
            MediaMatch.is_active == True,
            MediaMatch.is_adult == True,
        ).exists()

        query = self.db.query(MediaItem).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
            joinedload(MediaItem.matches).joinedload(MediaMatch.collection_entity).joinedload(MediaCollection.localizations),
            joinedload(MediaItem.tags),
        ).outerjoin(
            active_sort_match,
            (active_sort_match.media_item_id == MediaItem.id) & (active_sort_match.is_active == True),
        ).filter(
            MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED])
        )

        if tab == "movies":
            query = query.filter(
                MediaItem.item_type == ItemType.MOVIE,
                ~active_adult_match,
            )
        elif tab == "series":
            query = query.filter(
                MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]),
                ~active_adult_match,
            )
        elif tab == "adult":
            query = query.filter(
                MediaItem.item_type == ItemType.MOVIE,
                active_adult_match,
            )
        elif tab == "adult_series":
            query = query.filter(
                MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]),
                active_adult_match,
            )

        if filter_favorite == "favorites":
            query = query.filter(MediaItem.is_favorite == True)

        if filter_watched == "watched":
            query = query.filter(MediaItem.is_watched == True)
        elif filter_watched == "unwatched":
            query = query.filter(MediaItem.is_watched == False)

        title_expr = func.lower(func.coalesce(MediaItem.fn_title, MediaItem.fd_title, MediaItem.filename))
        year_expr = func.coalesce(MediaItem.fn_year, MediaItem.fd_year, 0)
        rating_expr = func.coalesce(active_sort_match.rating_tmdb, 0)
        rating_imdb_expr = func.coalesce(active_sort_match.rating_imdb, 0)
        user_rating_expr = func.coalesce(MediaItem.user_rating, 0)
        added_expr = MediaItem.created_at
        duration_expr = func.coalesce(MediaItem.duration, 0)
        size_expr = func.coalesce(MediaItem.size, 0)
        last_watched_expr = func.coalesce(MediaItem.last_watched_at, MediaItem.created_at)
        release_date_expr = func.coalesce(active_sort_match.release_date, active_sort_match.first_air_date, MediaItem.created_at)

        if sort_by == "title_desc":
            query = query.order_by(title_expr.desc(), MediaItem.id.desc())
        elif sort_by == "year_desc":
            query = query.order_by(year_expr.desc(), MediaItem.id.desc())
        elif sort_by == "year_asc":
            query = query.order_by(year_expr.asc(), MediaItem.id.asc())
        elif sort_by == "rating_desc":
            query = query.order_by(rating_expr.desc(), MediaItem.id.desc())
        elif sort_by == "rating_asc":
            query = query.order_by(rating_expr.asc(), MediaItem.id.asc())
        elif sort_by == "rating_imdb_desc":
            query = query.order_by(rating_imdb_expr.desc(), MediaItem.id.desc())
        elif sort_by == "rating_imdb_asc":
            query = query.order_by(rating_imdb_expr.asc(), MediaItem.id.asc())
        elif sort_by == "user_rating_desc":
            query = query.order_by(user_rating_expr.desc(), MediaItem.id.desc())
        elif sort_by == "user_rating_asc":
            query = query.order_by(user_rating_expr.asc(), MediaItem.id.asc())
        elif sort_by == "added_desc":
            query = query.order_by(added_expr.desc(), MediaItem.id.desc())
        elif sort_by == "added_asc":
            query = query.order_by(added_expr.asc(), MediaItem.id.asc())
        elif sort_by == "duration_desc":
            query = query.order_by(duration_expr.desc(), MediaItem.id.desc())
        elif sort_by == "duration_asc":
            query = query.order_by(duration_expr.asc(), MediaItem.id.asc())
        elif sort_by == "size_desc":
            query = query.order_by(size_expr.desc(), MediaItem.id.desc())
        elif sort_by == "size_asc":
            query = query.order_by(size_expr.asc(), MediaItem.id.asc())
        elif sort_by == "last_watched_desc":
            query = query.order_by(last_watched_expr.desc(), MediaItem.id.desc())
        elif sort_by == "last_watched_asc":
            query = query.order_by(last_watched_expr.asc(), MediaItem.id.asc())
        elif sort_by == "release_date_desc":
            query = query.order_by(release_date_expr.desc(), MediaItem.id.desc())
        elif sort_by == "release_date_asc":
            query = query.order_by(release_date_expr.asc(), MediaItem.id.asc())
        else:
            query = query.order_by(title_expr.asc(), MediaItem.id.asc())

        total_items = query.count()
        safe_page = max(1, page)
        safe_page_size = max(20, min(1000, page_size))
        items = query.offset((safe_page - 1) * safe_page_size).limit(safe_page_size).all()
        return items, total_items

    def delete_items(self, item_ids: List[int]):
        if item_ids:
            delete_media_items_by_ids(self.db, item_ids)

    def delete_extras(self, extra_ids: List[int]):
        if extra_ids:
            delete_extra_files_by_ids(self.db, extra_ids)

    def get_stats(self) -> Dict[str, Any]:
        library_statuses = [ItemStatus.RENAMED, ItemStatus.ORGANIZED]
        review_statuses = [
            ItemStatus.NEW,
            ItemStatus.ERROR,
            ItemStatus.UNCERTAIN,
            ItemStatus.NO_MATCH,
            ItemStatus.MULTIPLE,
        ]
        active_adult_match = self.db.query(MediaMatch.id).filter(
            MediaMatch.media_item_id == MediaItem.id,
            MediaMatch.is_active == True,
            MediaMatch.is_adult == True,
        ).exists()

        total_movies = self.db.query(func.count(MediaItem.id)).filter(
            MediaItem.status.in_(library_statuses),
            MediaItem.item_type == ItemType.MOVIE,
            ~active_adult_match,
        ).scalar() or 0

        total_adult_movies = self.db.query(func.count(func.distinct(MediaItem.id))).join(
            MediaMatch,
            (MediaMatch.media_item_id == MediaItem.id) &
            (MediaMatch.is_active == True) &
            (MediaMatch.is_adult == True),
        ).filter(
            MediaItem.status.in_(library_statuses),
            MediaItem.item_type == ItemType.MOVIE,
        ).scalar() or 0

        total_series = self.db.query(
            func.count(func.distinct(func.coalesce(MediaItem.fd_title, MediaItem.fn_title)))
        ).filter(
            MediaItem.status.in_(library_statuses),
            MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]),
            ~active_adult_match,
        ).scalar() or 0

        total_episodes = self.db.query(func.count(MediaItem.id)).filter(
            MediaItem.status.in_(library_statuses),
            MediaItem.item_type.in_([ItemType.SERIES, ItemType.EPISODE]),
            ~active_adult_match,
        ).scalar() or 0

        library_items = self.db.query(MediaItem).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
        ).filter(
            MediaItem.status.in_(library_statuses)
        ).all()

        movie_bytes = 0
        series_bytes = 0
        adult_bytes = 0
        drives = set()

        for item in library_items:
            item_size = item.size or 0
            if item.current_path:
                if ":" in item.current_path:
                    drives.add(item.current_path.split(":")[0].upper() + ":")
                elif item.current_path.startswith("/"):
                    parts = item.current_path.split("/")
                    if len(parts) > 2 and parts[1] in ["mnt", "media", "Volumes"]:
                        drives.add("/" + parts[1] + "/" + parts[2])
                    else:
                        drives.add("/")

            active_match = next((match for match in item.matches if match.is_active), None)
            is_adult_item = bool(active_match and active_match.is_adult)

            if is_adult_item and item.item_type == ItemType.MOVIE:
                adult_bytes += item_size
            elif item.item_type == ItemType.MOVIE:
                movie_bytes += item_size
            elif item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                series_bytes += item_size

        extra_rows = self.db.query(ExtraFile.current_path, ExtraFile.original_path).join(
            MediaItem, ExtraFile.parent_item_id == MediaItem.id
        ).filter(
            MediaItem.status.in_(library_statuses)
        ).all()

        extras_bytes = 0
        for extra in extra_rows:
            current_path = getattr(extra, "current_path", None)
            original_path = getattr(extra, "original_path", None)
            extras_bytes += self._safe_file_size(current_path or original_path)

            effective_path = current_path or original_path
            if effective_path:
                if ":" in effective_path:
                    drives.add(effective_path.split(":")[0].upper() + ":")
                elif effective_path.startswith("/"):
                    parts = effective_path.split("/")
                    if len(parts) > 2 and parts[1] in ["mnt", "media", "Volumes"]:
                        drives.add("/" + parts[1] + "/" + parts[2])
                    else:
                        drives.add("/")

        total_bytes = movie_bytes + series_bytes + adult_bytes + extras_bytes
        
        # Unmatched count
        unmatched = self.db.query(func.count(MediaItem.id)).filter(
            MediaItem.status.in_([
                ItemStatus.NEW, ItemStatus.MATCHED,
                ItemStatus.UNCERTAIN, ItemStatus.NO_MATCH,
                ItemStatus.MULTIPLE, ItemStatus.ERROR
            ])
        ).scalar() or 0

        manual_review_breakdown = {
            "new": self.db.query(func.count(MediaItem.id)).filter(MediaItem.status == ItemStatus.NEW).scalar() or 0,
            "error": self.db.query(func.count(MediaItem.id)).filter(MediaItem.status == ItemStatus.ERROR).scalar() or 0,
            "uncertain": self.db.query(func.count(MediaItem.id)).filter(MediaItem.status == ItemStatus.UNCERTAIN).scalar() or 0,
            "no_match": self.db.query(func.count(MediaItem.id)).filter(MediaItem.status == ItemStatus.NO_MATCH).scalar() or 0,
            "multiple": self.db.query(func.count(MediaItem.id)).filter(MediaItem.status == ItemStatus.MULTIPLE).scalar() or 0,
        }
        manual_review_total = sum(manual_review_breakdown.values())

        # Genre and Decade distribution
        preferred_lang = self._preferred_metadata_language()
        genre_dist = {}
        genre_dist_ids = {}
        genre_labels = {}
        decade_dist = {}
        genre_pair_dist = {}
        seen_title_keys = set()
        
        for item in library_items:
            active_match = next((m for m in item.matches if m.is_active), None)
            if active_match:
                title_key = None
                if active_match.series_tmdb_id and item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                    title_key = f"tv:{active_match.series_tmdb_id}"
                elif active_match.tmdb_id:
                    title_key = f"movie:{active_match.tmdb_id}"
                elif item.id:
                    title_key = f"item:{item.id}"

                if title_key:
                    if title_key in seen_title_keys:
                        continue
                    seen_title_keys.add(title_key)

                # Decade calculation
                year = None
                if active_match.release_date:
                    year = active_match.release_date.year
                elif active_match.first_air_date:
                    year = active_match.first_air_date.year
                else:
                    year = item.fn_year or item.fd_year
                
                if year and year >= 1900:
                    decade = (year // 10) * 10
                    decade_str = f"{decade}s"
                    decade_dist[decade_str] = decade_dist.get(decade_str, 0) + 1
                    
                # Genre calculation using stable TMDB genre IDs, with labels from the preferred language cache
                raw_genres = self._get_cached_genres_for_match(active_match, preferred_lang)
                if raw_genres:
                    unique_genre_ids = []
                    for genre in raw_genres:
                        genre_name = genre.get("name")
                        if not genre_name:
                            continue
                        split_names = _split_genres([genre_name])
                        for name in split_names:
                            genre_key = name
                            genre_dist_ids[genre_key] = genre_dist_ids.get(genre_key, 0) + 1
                            if genre_key not in genre_labels:
                                genre_labels[genre_key] = name
                            if genre_key not in unique_genre_ids:
                                unique_genre_ids.append(genre_key)

                    # Build title-level co-occurrence edges
                    for source_id, target_id in combinations(sorted(unique_genre_ids), 2):
                        pair_key = f"{source_id}|{target_id}"
                        genre_pair_dist[pair_key] = genre_pair_dist.get(pair_key, 0) + 1

        for genre_id, count in genre_dist_ids.items():
            label = genre_labels.get(genre_id, genre_id)
            genre_dist[label] = count

        top_genre_ids = sorted(genre_dist_ids.items(), key=lambda x: x[1], reverse=True)[:12]
        top_genre_id_set = {genre_id for genre_id, _ in top_genre_ids}
        constellation_nodes = [
            {
                "id": genre_id,
                "label": genre_labels.get(genre_id, genre_id),
                "count": count,
            }
            for genre_id, count in top_genre_ids
        ]
        constellation_links = []
        for pair_key, count in sorted(genre_pair_dist.items(), key=lambda x: x[1], reverse=True):
            source_id, target_id = pair_key.split("|", 1)
            if source_id not in top_genre_id_set or target_id not in top_genre_id_set:
                continue
            constellation_links.append({
                "source": source_id,
                "target": target_id,
                "count": count,
            })
            if len(constellation_links) >= 24:
                break

        return {
            "total_movies": total_movies,
            "total_series": total_series,
            "total_episodes": total_episodes,
            "total_adult_movies": total_adult_movies,
            "total_bytes": total_bytes,
            "unmatched": unmatched,
            "storage_breakdown": {
                "movies": movie_bytes,
                "series": series_bytes,
                "extras": extras_bytes,
                "adult": adult_bytes,
            },
            "manual_review_total": manual_review_total,
            "manual_review_breakdown": manual_review_breakdown,
            "genre_distribution": genre_dist,
            "genre_distribution_ids": genre_dist_ids,
            "genre_labels": genre_labels,
            "genre_constellation": {
                "nodes": constellation_nodes,
                "links": constellation_links,
            },
            "decade_distribution": decade_dist,
            "items": [item.current_path for item in library_items if item.current_path]
        }

    def commit(self):
        self.db.commit()

    def rollback(self):
        self.db.rollback()
