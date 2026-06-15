import logging
from urllib.parse import parse_qs, urlsplit
from pathlib import Path
from typing import Optional

from sqlalchemy import Float, Integer, String, and_, case, cast, func, inspect, literal, or_, select, union_all
from sqlalchemy.orm import Session, joinedload

from ..db.models import CustomListItem, ItemStatus, ItemType, MediaItem, VirtualMediaState
from ..db.models.metadata import MediaMatch, TMDBCache
from ..repositories.media_repository import MediaRepository
from ..schemas.media import LibraryCollectionDTO, LibraryCollectionItemDTO, LibraryCollectionsPageDTO, LibraryGroupedDTO, LibraryStatsDTO
from ..utils.library_utils import _pick_tmdb_cache, _preferred_metadata_language, _preferred_metadata_languages, _split_genres
from ..utils.library_helpers import match_language_code as _match_language_code, public_image_path as _public_image_path

logger = logging.getLogger(__name__)

TAG_EMPTY_STATE_SAMPLE_POSTERS = [
    "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    "https://image.tmdb.org/t/p/w500/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg",
    "https://image.tmdb.org/t/p/w500/6ELCZlTA5lGUops70hKdB83WJxH.jpg",
]

TAG_PREVIEW_GROUP_ORDER = ("movies", "series", "people", "adult", "adult_series", "adult_people")


def _library_year(item, active_match):
    if not active_match:
        return item.fn_year or item.fd_year
    if item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
        if active_match.first_air_date:
            return active_match.first_air_date.year
        if active_match.release_date:
            return active_match.release_date.year
        return item.fn_year or item.fd_year
    if active_match.release_date:
        return active_match.release_date.year
    if active_match.first_air_date:
        return active_match.first_air_date.year
    return item.fn_year or item.fd_year


def _library_release_date(active_match):
    if not active_match:
        return ""
    if active_match.item_type in [ItemType.SERIES, ItemType.EPISODE]:
        return active_match.first_air_date.isoformat() if active_match.first_air_date else ""
    return active_match.release_date.isoformat() if active_match.release_date else ""




class LibraryQueryService:
    """
    Read-only service for library listing, searching, people/tag grouping,
    and dashboard statistics.
    """

    def __init__(self, db: Session):
        self.db = db
        self.repository = MediaRepository(db)
        from .library_collection_service import LibraryCollectionService
        self.collection_service = LibraryCollectionService(db)
        from .library_people_service import LibraryPeopleService
        self.people_service = LibraryPeopleService(db)
        from .library_tab_service import LibraryTabService
        self.tab_service = LibraryTabService(db)
        from .library_virtual_cache_service import LibraryVirtualCacheService
        self.virtual_cache = LibraryVirtualCacheService(db)
        from .library.formatter import LibraryFormatterService
        self.formatter = LibraryFormatterService(db)
    def get_continue_watching(self, limit: int = 12) -> list[dict]:
        from ..db.models.metadata import MediaMatch

        ui_lang = _preferred_metadata_language(self.db)
        safe_limit = max(1, min(limit, 24))
        items = self.db.query(MediaItem).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
        ).filter(
            MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED]),
            MediaItem.item_type.in_([ItemType.MOVIE, ItemType.EPISODE]),
            MediaItem.resume_position > 0,
            MediaItem.is_watched == False,
            MediaItem.duration > 0,
        ).order_by(
            MediaItem.last_watched_at.desc().nullslast(),
            MediaItem.updated_at.desc(),
        ).limit(safe_limit).all()

        results = []
        for item in items:
            active_match = next((match for match in item.matches if match.is_active), None)
            if not active_match:
                continue

            loc = None
            if active_match.localizations:
                if ui_lang:
                    loc = next((localization for localization in active_match.localizations if _match_language_code(localization.target_language, ui_lang)), None)
                if not loc:
                    loc = next((localization for localization in active_match.localizations if localization.is_primary), active_match.localizations[0])

            results.append({
                "id": item.id,
                "title": loc.title if loc else (item.fn_title or item.fd_title or item.filename),
                "series_title": loc.series_title if loc else None,
                "episode_title": loc.episode_title if loc else None,
                "type": item.item_type.value,
                "season_number": active_match.season_number,
                "episode_number": active_match.episode_number,
                "series_tmdb_id": active_match.series_tmdb_id if active_match.series_tmdb_id else (active_match.tmdb_id if item.item_type == ItemType.EPISODE else None),
                "tmdb_id": active_match.tmdb_id,
                "backdrop_path": _public_image_path(loc.backdrop_path, "backdrops") if loc else None,
                "still_path": _public_image_path(loc.still_path, "stills") if loc else None,
                "resume_position": getattr(item, "resume_position", 0),
                "duration": item.duration or 0,
                "is_watched": getattr(item, "is_watched", False),
                "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
            })

        return results

    def get_tag_groups(self, is_adult: bool = False) -> list[dict]:
        from ..db.models import Person, Tag

        preferred_languages = _preferred_metadata_languages(self.db)
        ui_lang = _preferred_metadata_language(self.db)
        tags_map = {}

        # Pre-populate tags_map with all tags from database
        all_db_tags = self.db.query(Tag).filter(Tag.is_adult == is_adult).all()
        for t in all_db_tags:
            tags_map[t.name] = {
                "id": t.id,
                "name": t.name,
                "color": t.color,
                "custom_images": t.custom_images,
                "movies": [],
                "series": [],
                "adult": [],
                "adult_series": [],
                "people": [],
                "adult_people": [],
                "total_count": 0,
            }

        def _ensure_tag(tag_name: str) -> dict:
            if tag_name not in tags_map:
                tags_map[tag_name] = {
                    "id": None,
                    "name": tag_name,
                    "color": None,
                    "custom_images": None,
                    "movies": [],
                    "series": [],
                    "adult": [],
                    "adult_series": [],
                    "people": [],
                    "adult_people": [],
                    "total_count": 0,
                }
            return tags_map[tag_name]

        tagged_media_items = self.db.query(MediaItem).options(
            joinedload(MediaItem.tags),
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
        ).filter(
            MediaItem.status.in_([ItemStatus.MATCHED, ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
            MediaItem.tags.any(Tag.is_adult == is_adult),
        ).all()

        for item in tagged_media_items:
            active_match = next((match for match in item.matches if match.is_active), None)
            if active_match and active_match.is_adult:
                if item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                    target_group = "adult_series"
                else:
                    target_group = "adult"
            elif item.item_type == ItemType.MOVIE:
                target_group = "movies"
            elif item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                target_group = "series"
            else:
                continue

            loc = None
            if active_match and active_match.localizations:
                if ui_lang:
                    loc = next((localization for localization in active_match.localizations if _match_language_code(localization.target_language, ui_lang)), None)
                if not loc:
                    loc = next((localization for localization in active_match.localizations if localization.is_primary), active_match.localizations[0])

            serialized_item = {
                "id": item.id,
                "title": loc.title if loc else (item.fn_title or item.fd_title or item.filename),
                "original_title": loc.original_title if loc else None,
                "original_series_title": loc.original_series_title if loc else None,
                "year": _library_year(item, active_match),
                "release_date": _library_release_date(active_match),
                "poster_path": loc.poster_path if loc else None,
                "backdrop_path": loc.backdrop_path if loc else None,
                "series_poster_path": loc.series_poster_path if loc else None,
                "rating": active_match.rating_tmdb if active_match else 0,
                "rating_imdb": active_match.rating_imdb if active_match else None,
                "type": item.item_type.value,
                "episode_number": active_match.episode_number if active_match else None,
                "series_tmdb_id": active_match.series_tmdb_id if (active_match and active_match.series_tmdb_id) else (active_match.tmdb_id if active_match and item.item_type in [ItemType.SERIES, ItemType.EPISODE] else None),
                "tmdb_id": active_match.tmdb_id if active_match else None,
                "series_title": loc.series_title if loc else None,
                "is_favorite": item.is_favorite or False,
                "in_library": True,
                "user_rating": item.user_rating,
                "custom_tags": [tag.name for tag in item.tags if tag.is_adult == is_adult] if item.tags else [],
                "genres": _split_genres(loc.genres) if (loc and loc.genres) else [],
                "is_watched": getattr(item, "is_watched", False),
                "resume_position": getattr(item, "resume_position", 0),
                "duration": item.duration or 0,
                "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
            }

            for tag in serialized_item["custom_tags"]:
                tag_clean = str(tag).strip()
                if not tag_clean:
                    continue
                tag_entry = _ensure_tag(tag_clean)
                tag_entry[target_group].append(serialized_item)
                tag_entry["total_count"] += 1

        tagged_virtual_states = [
            state for state in self.db.query(VirtualMediaState).filter(
                VirtualMediaState.is_tracked == True,
            ).all()
            if isinstance(getattr(state, "custom_tags", None), list) and any(str(tag).strip() for tag in (state.custom_tags or []))
        ]

        movie_ids = [state.tmdb_id for state in tagged_virtual_states if (state.media_type or "").lower() == "movie" and state.tmdb_id]
        tv_ids = [state.tmdb_id for state in tagged_virtual_states if (state.media_type or "").lower() in {"tv", "series", "show"} and state.tmdb_id]
        movie_cache = self.virtual_cache.preload_virtual_cache_payload("movie", movie_ids, preferred_languages)
        tv_cache = self.virtual_cache.preload_virtual_cache_payload("tv", tv_ids, preferred_languages)

        for state in tagged_virtual_states:
            media_type = "tv" if (state.media_type or "").lower() in {"tv", "series", "show"} else "movie"
            raw_data = tv_cache.get(state.tmdb_id, {}) if media_type == "tv" else movie_cache.get(state.tmdb_id, {})
            is_virtual_adult = bool(raw_data.get("adult", False))
            if is_virtual_adult != is_adult:
                continue
            raw_poster_path = raw_data.get("poster_path")
            local_poster_path = _public_image_path(raw_poster_path, "posters")
            date_field = raw_data.get("first_air_date") if media_type == "tv" else raw_data.get("release_date")
            year_value = None
            if date_field:
                try:
                    year_value = int(str(date_field).split("-")[0])
                except (TypeError, ValueError):
                    year_value = None

            serialized_item = {
                "id": f"tmdb_{state.tmdb_id}",
                "title": (raw_data.get("name") or raw_data.get("title") or f"TMDB {state.tmdb_id}") if media_type == "tv" else (raw_data.get("title") or raw_data.get("name") or f"TMDB {state.tmdb_id}"),
                "original_title": raw_data.get("original_title"),
                "original_series_title": raw_data.get("original_name") if media_type == "tv" else None,
                "year": year_value,
                "release_date": date_field,
                "poster_path": raw_poster_path,
                "backdrop_path": raw_data.get("backdrop_path"),
                "local_poster_path": local_poster_path,
                "local_backdrop_path": _public_image_path(raw_data.get("backdrop_path"), "backdrops"),
                "displayPosterRemote": f"https://image.tmdb.org/t/p/w500{raw_poster_path}" if raw_poster_path else None,
                "rating": raw_data.get("vote_average") or 0,
                "type": "series" if media_type == "tv" else "movie",
                "series_tmdb_id": state.tmdb_id if media_type == "tv" else None,
                "tmdb_id": state.tmdb_id,
                "series_title": (raw_data.get("name") or raw_data.get("title")) if media_type == "tv" else None,
                "is_favorite": state.is_favorite,
                "in_library": False,
                "user_rating": state.user_rating,
                "custom_tags": state.custom_tags or [],
                "genres": _split_genres([
                    genre.get("name") for genre in (raw_data.get("genres") or [])
                    if isinstance(genre, dict) and genre.get("name")
                ]),
                "is_watched": bool(state.is_watched),
                "resume_position": 0,
                "duration": 0,
            }

            target_group = "series" if media_type == "tv" else "movies"
            for tag in serialized_item["custom_tags"]:
                tag_clean = str(tag).strip()
                if not tag_clean:
                    continue
                tag_entry = _ensure_tag(tag_clean)
                tag_entry[target_group].append(serialized_item)
                tag_entry["total_count"] += 1

        tagged_people = self.db.query(Person).options(joinedload(Person.localizations)).filter(
            Person.custom_tags.isnot(None),
            Person.is_adult == is_adult,
        ).all()

        for person in tagged_people:
            tags = person.custom_tags
            if not tags or not isinstance(tags, list):
                continue
            
            if person.is_adult:
                person_group = "adult_people"
                fallback_name = "Unknown Adult Star"
            else:
                person_group = "people"
                fallback_name = "Unknown Person"

            person_entry = {
                "id": person.id,
                "name": person.localizations[0].name if person.localizations else fallback_name,
                "title": person.localizations[0].name if person.localizations else fallback_name,
                "year": None,
                "poster_path": self.people_service._person_profile_path(person),
                "rating": person.popularity or 0.0,
                "type": "adult_star" if person.is_adult else "person",
                "is_active": person.is_active,
                "is_favorite": person.is_favorite,
                "user_rating": person.user_rating,
                "birthday": person.birthday or "",
                "custom_tags": person.custom_tags or [],
                "gender": person.gender,
                "library_count": 0,
            }

            for tag in tags:
                tag_clean = str(tag).strip()
                if not tag_clean:
                    continue
                tag_entry = _ensure_tag(tag_clean)
                tag_entry[person_group].append(person_entry)
                tag_entry["total_count"] += 1

        media_tag_names = {t.name for t in all_db_tags}
        result = sorted([tag for tag in tags_map.values() if tag["name"] in media_tag_names], key=lambda tag: tag["name"].lower())
        for tag in result:
            tag["movies"] = self.formatter.format_media_cards("movies", tag["movies"])
            tag["series"] = self.formatter.format_media_cards("series", tag["series"])
            tag["adult"] = self.formatter.format_media_cards("adult", tag["adult"])
            tag["adult_series"] = self.formatter.format_media_cards("adult_series", tag["adult_series"])
            tag["people"] = self.formatter.format_media_cards("people", tag["people"])
            tag["adult_people"] = self.formatter.format_media_cards("adult_people", tag["adult_people"])

        preview_pool = []
        for tag in result:
            for group_name in TAG_PREVIEW_GROUP_ORDER:
                for item in tag[group_name]:
                    preview = self._build_tag_preview_entry(item)
                    poster = preview.get("poster") if preview else None
                    if poster and poster not in preview_pool:
                        preview_pool.append(poster)

        for tag in result:
            custom_images = tag.get("custom_images") or []
            # Normalize tag["custom_images"] here as well
            normalized_custom = []
            for img in custom_images:
                if isinstance(img, dict):
                    normalized_custom.append({
                        "path": img.get("path", ""),
                        "position_x": img.get("position_x", 50),
                        "position_y": img.get("position_y", 50)
                    })
                elif isinstance(img, str):
                    normalized_custom.append({
                        "path": img,
                        "position_x": 50,
                        "position_y": 50
                    })
            tag["custom_images"] = normalized_custom

            if normalized_custom:
                tag["sample_previews"] = [
                    {
                        "poster": item["path"],
                        "position_x": item["position_x"],
                        "position_y": item["position_y"],
                        "backdrop": item["path"] if len(normalized_custom) == 1 else None,
                        "kind": "custom"
                    }
                    for item in normalized_custom
                ]
                tag["sample_posters"] = [entry["poster"] for entry in tag["sample_previews"]]
            else:
                tag["sample_previews"] = self._build_tag_sample_previews(
                    tag,
                    fallback_preview=(preview_pool[:3] if preview_pool else TAG_EMPTY_STATE_SAMPLE_POSTERS),
                )
                tag["sample_posters"] = [entry["poster"] for entry in tag["sample_previews"] if entry.get("poster")]
        return result

    def _build_tag_preview_entry(self, item: dict) -> dict | None:
        poster = item.get("displayPoster") or item.get("local_poster_path") or item.get("poster_path")
        backdrop = item.get("local_backdrop_path") or item.get("backdrop_path")
        if not poster and not backdrop:
            return None
        return {
            "poster": poster,
            "backdrop": backdrop,
            "kind": item.get("type"),
        }

    def _build_tag_sample_postviews_fallback(self, fallback_preview: list[str]) -> list[dict]:
        return [{"poster": poster, "backdrop": None} for poster in fallback_preview[:3] if poster]

    def _build_tag_sample_previews(self, tag: dict, fallback_preview: list[str]) -> list[dict]:
        if not tag.get("total_count"):
            return self._build_tag_sample_postviews_fallback(fallback_preview)

        previews: list[dict] = []
        seen: set[str] = set()

        def add_preview(item: dict) -> bool:
            preview = self._build_tag_preview_entry(item)
            poster = preview.get("poster") if preview else None
            if not preview or not poster or poster in seen:
                return False
            previews.append(preview)
            seen.add(poster)
            return len(previews) >= 3

        # First pass: diversify across groups so mixed tags read immediately.
        for group_name in TAG_PREVIEW_GROUP_ORDER:
            for item in tag.get(group_name, []):
                if add_preview(item):
                    return previews
                break

        # Second pass: fill remaining slots from the natural group ordering.
        for group_name in TAG_PREVIEW_GROUP_ORDER:
            for item in tag.get(group_name, []):
                if add_preview(item):
                    return previews

        return previews[:3]

    def _format_size(self, size_bytes: int) -> str:
        if size_bytes >= 1024 ** 4:
            return f"{size_bytes / (1024 ** 4):.1f} TB"
        if size_bytes >= 1024 ** 3:
            return f"{size_bytes / (1024 ** 3):.1f} GB"
        return f"{size_bytes / (1024 ** 2):.0f} MB"
