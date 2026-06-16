from typing import Optional, Any, Set
from urllib.parse import urlsplit, parse_qs
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.services.language_service import LanguageService
from ...db.models import CustomList, CustomListItem, ItemStatus, ItemType, MediaItem, VirtualMediaState, UserSetting, Person, Tag
from ...db.models.metadata import MediaMatch, OMDBCache, TMDBCache
from ...repositories.media_repository import MediaRepository
from ...utils.library_utils import _preferred_metadata_language, _preferred_metadata_languages, _split_genres, _pick_tmdb_cache
from ...utils.library_helpers import match_language_code as _match_language_code, public_image_path as _public_image_path


class LibraryGroupedService:
    def __init__(
        self,
        db: Session,
        repository: MediaRepository,
        collection_service: Any,
        people_service: Any,
        formatter: Any,
    ):
        self.db = db
        self.repository = repository
        self.collection_service = collection_service
        self.people_service = people_service
        self.formatter = formatter

    def _include_adult_enabled(self) -> bool:
        setting = self.db.query(UserSetting).filter(UserSetting.key == "include_adult").first()
        if not setting:
            return False
        value = setting.value
        return value.lower() == "true" if isinstance(value, str) else bool(value)

    def _adult_gender_preference(self) -> str:
        setting = self.db.query(UserSetting).filter(UserSetting.key == "adult_gender_preference").first()
        if not setting or not setting.value:
            return "all"
        return str(setting.value).strip().lower()

    def _build_display_counts(self, library: dict) -> dict:
        return {
            "movies": len(self.formatter.format_media_cards("movies", library.get("movies", []))),
            "series": len(self.formatter.format_media_cards("series", library.get("series", []))),
            "adult": len(self.formatter.format_media_cards("adult", library.get("adult", []))),
            "adult_series": len(self.formatter.format_media_cards("adult_series", library.get("adult_series", []))),
            "adult_people": len(self.formatter.format_media_cards("adult_people", library.get("adult_people", []))),
        }

    def _build_media_tab_counts(self) -> dict:
        counts = {
            **self.repository.get_library_owned_counts(),
            "people": 0,
            "adult_people": 0,
            "tags": self.db.query(func.count(Tag.id)).scalar() or 0,
            "collections": len(self.collection_service._build_movie_collection_rows(tab="movies")),
            "adult_collections": len(self.collection_service._build_movie_collection_rows(tab="adult")),
        }

        include_adult = self._include_adult_enabled()
        adult_pref = self._adult_gender_preference()
        people_rows = self.db.query(Person.is_active, Person.is_adult, Person.gender).all()
        counts["people"] = sum(1 for is_active, is_adult, gender in people_rows if is_active and (not include_adult or not is_adult))
        
        def matches_pref(gender):
            if adult_pref == "female":
                return gender == 1
            if adult_pref == "male":
                return gender == 2
            return True

        counts["adult_people"] = sum(1 for is_active, is_adult, gender in people_rows if include_adult and is_active and is_adult and matches_pref(gender))

        virtual_keys = set()
        list_rows = self.db.query(
            CustomListItem.tmdb_id,
            CustomListItem.media_type,
        ).filter(
            CustomListItem.tmdb_id != None,
        ).all()
        state_rows = self.db.query(
            VirtualMediaState.tmdb_id,
            VirtualMediaState.media_type,
        ).filter(
            VirtualMediaState.is_tracked == True,
        ).all()

        for tmdb_id, media_type in [*list_rows, *state_rows]:
            media_type = (media_type or "movie").lower()
            if tmdb_id and media_type in {"movie", "tv"}:
                virtual_keys.add((media_type, tmdb_id))

        if not virtual_keys:
            return counts

        candidate_ids = {tmdb_id for _, tmdb_id in virtual_keys}
        local_keys = set()
        local_rows = self.db.query(
            MediaMatch.tmdb_id,
            MediaMatch.series_tmdb_id,
            MediaMatch.item_type,
        ).join(
            MediaItem, MediaItem.id == MediaMatch.media_item_id
        ).filter(
            MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED]),
            MediaMatch.is_active == True,
            or_(
                MediaMatch.tmdb_id.in_(candidate_ids),
                MediaMatch.series_tmdb_id.in_(candidate_ids),
            ),
        ).all()

        for tmdb_id, series_tmdb_id, item_type in local_rows:
            item_type_value = item_type.value if getattr(item_type, "value", None) else item_type
            if tmdb_id in candidate_ids and item_type_value == "movie":
                local_keys.add(("movie", tmdb_id))
            series_id = series_tmdb_id or tmdb_id
            if series_id in candidate_ids and item_type_value in {"series", "season", "episode"}:
                local_keys.add(("tv", series_id))

        for media_type, tmdb_id in virtual_keys - local_keys:
            count_key = "series" if media_type == "tv" else "movies"
            counts[count_key] = int(counts.get(count_key) or 0) + 1

        return counts

    def get_grouped_library(self, requested_tabs: Optional[Set[str]] = None) -> dict:
        ui_lang = _preferred_metadata_language(self.db)
        preferred_languages = _preferred_metadata_languages(self.db)

        requested_tabs = {tab.lower() for tab in (requested_tabs or set())}
        include_all_tabs = len(requested_tabs) == 0
        items = self.repository.get_library_items(requested_tabs=requested_tabs)
        library = {
            "movies": [],
            "series": [],
            "adult": [],
            "adult_series": [],
            "adult_people": [],
            "counts": self.repository.get_library_owned_counts(),
        }

        virtual_rows = self.db.query(CustomListItem, CustomList).join(
            CustomList, CustomList.id == CustomListItem.list_id
        ).filter(
            CustomListItem.tmdb_id != None
        ).order_by(CustomListItem.added_at.desc()).all()
        standalone_virtual_rows = self.db.query(VirtualMediaState).order_by(VirtualMediaState.updated_at.desc()).all()

        candidate_tmdb_ids = set()
        for list_item, _custom_list in virtual_rows:
            media_type = (list_item.media_type or "movie").lower()
            if media_type in {"movie", "tv"} and list_item.tmdb_id:
                candidate_tmdb_ids.add(list_item.tmdb_id)
        for state in standalone_virtual_rows:
            media_type = (state.media_type or "movie").lower()
            if media_type in {"movie", "tv"} and state.tmdb_id:
                candidate_tmdb_ids.add(state.tmdb_id)

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

        priority = {
            "tv": {"series": 0, "season": 1, "episode": 2, "movie": 3},
            "movie": {"movie": 0, "series": 1, "season": 2, "episode": 3},
        }

        local_media_lookup = {}
        if candidate_tmdb_ids:
            local_rows = self.db.query(
                MediaMatch.media_item_id,
                MediaMatch.item_type,
                MediaMatch.tmdb_id,
                MediaMatch.series_tmdb_id,
            ).filter(
                MediaMatch.is_active == True,
                or_(
                    MediaMatch.tmdb_id.in_(candidate_tmdb_ids),
                    MediaMatch.series_tmdb_id.in_(candidate_tmdb_ids),
                ),
            ).all()

            for row in local_rows:
                item_type = row.item_type.value if getattr(row, "item_type", None) else ""
                if row.tmdb_id in candidate_tmdb_ids:
                    for media_type in ("movie", "tv"):
                        rank = (priority[media_type].get(item_type, 99), row.media_item_id or 0)
                        key = (media_type, row.tmdb_id)
                        current = local_media_lookup.get(key)
                        if current is None or rank < current["rank"]:
                            local_media_lookup[key] = {"rank": rank, "media_item_id": row.media_item_id}
                if row.series_tmdb_id in candidate_tmdb_ids:
                    rank = (priority["tv"].get(item_type, 99), row.media_item_id or 0)
                    key = ("tv", row.series_tmdb_id)
                    current = local_media_lookup.get(key)
                    if current is None or rank < current["rank"]:
                        local_media_lookup[key] = {"rank": rank, "media_item_id": row.media_item_id}

        def _resolve_local_media_item_id(tmdb_id, media_type):
            if not tmdb_id:
                return None
            return (local_media_lookup.get((media_type or "movie", tmdb_id)) or {}).get("media_item_id")

        virtual_state_map = {}
        if candidate_tmdb_ids:
            state_rows = self.db.query(VirtualMediaState).filter(
                VirtualMediaState.tmdb_id.in_(candidate_tmdb_ids)
            ).all()
            for state in state_rows:
                media_type = (state.media_type or "movie").lower()
                virtual_state_map[(media_type, state.tmdb_id)] = state

        raw_cache_map = {}
        if candidate_tmdb_ids:
            all_caches = self.db.query(TMDBCache).filter(
                TMDBCache.tmdb_id.in_(list(candidate_tmdb_ids))
            ).all()
            
            grouped_by_id = {}
            for c in all_caches:
                grouped_by_id.setdefault(c.tmdb_id, []).append(c)

            def _cache_language(cache) -> str:
                cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
                try:
                    parsed = urlsplit(cache_key)
                    parsed_language = str((parse_qs(parsed.query).get("language") or [""])[0] or "")
                    if parsed_language:
                        return parsed_language
                except Exception:
                    pass
                return str(cache.locale or "")

            def _rank_cache(cache):
                cache_lang = _cache_language(cache)
                for idx, preferred in enumerate(preferred_languages):
                    if _match_language_code(cache_lang, preferred):
                        return idx, -cache.updated_at.timestamp()
                if _match_language_code(cache_lang, "en"):
                    return len(preferred_languages), -cache.updated_at.timestamp()
                return len(preferred_languages) + 1, -cache.updated_at.timestamp()

            for tmdb_id in candidate_tmdb_ids:
                item_caches = grouped_by_id.get(tmdb_id, [])
                if not item_caches:
                    continue
                for media_type in ("movie", "tv"):
                    endpoint_prefix = f"/{media_type}/{tmdb_id}"
                    filtered = []
                    for cache in item_caches:
                        cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
                        if not cache_key.startswith(endpoint_prefix):
                            continue
                        suffix = cache_key[len(endpoint_prefix):]
                        if suffix == "" or suffix.startswith("?"):
                            filtered.append(cache)
                    
                    if filtered:
                        best = sorted(filtered, key=_rank_cache)[0]
                        if best and isinstance(best.raw_data, dict):
                            raw_cache_map[(media_type, tmdb_id)] = best.raw_data

        omdb_map = {}
        imdb_ids = {
            raw_data.get("external_ids", {}).get("imdb_id") or raw_data.get("imdb_id")
            for raw_data in raw_cache_map.values()
            if isinstance(raw_data, dict)
        }
        imdb_ids = {imdb_id for imdb_id in imdb_ids if imdb_id}
        if imdb_ids:
            omdb_rows = self.db.query(OMDBCache).filter(OMDBCache.imdb_id.in_(list(imdb_ids))).all()
            omdb_map = {
                row.imdb_id: row.raw_data
                for row in omdb_rows
                if row.imdb_id and isinstance(row.raw_data, dict)
            }

        def _get_virtual_raw_data(media_type, tmdb_id, fallback_title=None):
            raw_data = raw_cache_map.get((media_type, tmdb_id), {})
            if fallback_title and isinstance(raw_data, dict):
                if media_type == "tv":
                    raw_data["name"] = raw_data.get("name") or fallback_title
                else:
                    raw_data["title"] = raw_data.get("title") or fallback_title
            return raw_data if isinstance(raw_data, dict) else {}

        def _get_virtual_genres(raw_data):
            genres_raw = raw_data.get("genres", [])
            genres_list = []
            if isinstance(genres_raw, list):
                for g in genres_raw:
                    if isinstance(g, dict) and g.get("name"):
                        genres_list.append(g["name"])
                    elif isinstance(g, str):
                        genres_list.append(g)
            return _split_genres(genres_list)

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

        def _get_virtual_keywords(raw_data, media_type):
            keywords_data = raw_data.get("keywords", {})
            keywords_list = []
            if isinstance(keywords_data, dict):
                kw_list = keywords_data.get("keywords") if media_type == "movie" else keywords_data.get("results")
                if isinstance(kw_list, list):
                    keywords_list = [kw.get("name") for kw in kw_list if isinstance(kw, dict) and kw.get("name")]
            return keywords_list

        for item in items:
            active_match = next((match for match in item.matches if match.is_active), None)
            target_group = None
            if active_match and active_match.is_adult:
                if item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                    target_group = "adult_series"
                else:
                    target_group = "adult"
            elif item.item_type == ItemType.MOVIE:
                target_group = "movies"
            elif item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                target_group = "series"

            if not target_group:
                continue

            if not include_all_tabs and target_group not in requested_tabs:
                continue

            loc = LanguageService.pick_localization(active_match.localizations, [ui_lang] if ui_lang else []) if active_match else None

            data = {
                "id": item.id,
                "title": loc.title if loc else (item.fn_title or item.fd_title or item.filename),
                "original_title": loc.original_title if loc else None,
                "original_series_title": loc.original_series_title if loc else None,
                "year": _library_year(item, active_match),
                "release_date": _library_release_date(active_match),
                "poster_path": loc.poster_path if loc else None,
                "series_poster_path": loc.series_poster_path if loc else None,
                "backdrop_path": _public_image_path(active_match.backdrop_path, "backdrops") if active_match else None,
                "still_path": _public_image_path(active_match.still_path, "stills") if active_match else None,
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
                "custom_tags": [tag.name for tag in item.tags] if item.tags else [],
                "genres": _split_genres(loc.genres) if (loc and loc.genres) else [],
                "keywords": active_match.keywords if (active_match and active_match.keywords) else [],
                "is_watched": getattr(item, "is_watched", False),
                "resume_position": getattr(item, "resume_position", 0),
                "duration": item.duration or 0,
                "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
                "size": item.size or 0,
            }

            library[target_group].append(data)

        seen_virtual_keys = set()
        for list_item, custom_list in virtual_rows:
            media_type = (list_item.media_type or "movie").lower()
            if media_type not in {"movie", "tv"}:
                continue

            if _resolve_local_media_item_id(list_item.tmdb_id, media_type):
                continue

            key = f"{media_type}:{list_item.tmdb_id}"
            if key in seen_virtual_keys:
                continue
            seen_virtual_keys.add(key)

            raw_data = _get_virtual_raw_data(media_type, list_item.tmdb_id, list_item.title)
            virtual_state = virtual_state_map.get((media_type, list_item.tmdb_id))
            if virtual_state is not None and not bool(getattr(virtual_state, "is_tracked", True)):
                continue

            raw_poster_path = raw_data.get("poster_path") or list_item.poster_path
            local_poster_path = _public_image_path(raw_poster_path, "posters")
            year_value = None
            if media_type == "tv":
                first_air_date = raw_data.get("first_air_date")
                if first_air_date:
                    try:
                        year_value = int(str(first_air_date).split("-")[0])
                    except (TypeError, ValueError):
                        year_value = None
            else:
                release_date = raw_data.get("release_date")
                if release_date:
                    try:
                        year_value = int(str(release_date).split("-")[0])
                    except (TypeError, ValueError):
                        year_value = None

            virtual_item = {
                "id": f"tmdb_{list_item.tmdb_id}",
                "title": (raw_data.get("name") or raw_data.get("title") or list_item.title) if media_type == "tv" else (raw_data.get("title") or raw_data.get("name") or list_item.title),
                "original_title": raw_data.get("original_title"),
                "original_series_title": raw_data.get("original_name") if media_type == "tv" else None,
                "year": year_value,
                "release_date": raw_data.get("first_air_date") if media_type == "tv" else raw_data.get("release_date"),
                "poster_path": raw_poster_path,
                "local_poster_path": local_poster_path,
                "displayPosterRemote": f"https://image.tmdb.org/t/p/w500{raw_poster_path}" if raw_poster_path else None,
                "rating": raw_data.get("vote_average") or 0,
                "rating_tmdb": raw_data.get("vote_average") or 0,
                "rating_imdb": _get_virtual_imdb_rating(raw_data),
                "type": "series" if media_type == "tv" else "movie",
                "series_tmdb_id": list_item.tmdb_id if media_type == "tv" else None,
                "tmdb_id": list_item.tmdb_id,
                "series_title": (raw_data.get("name") or raw_data.get("title") or list_item.title) if media_type == "tv" else None,
                "is_favorite": virtual_state.is_favorite if virtual_state else False,
                "in_library": False,
                "user_rating": virtual_state.user_rating if virtual_state else None,
                "custom_tags": virtual_state.custom_tags or [] if virtual_state and virtual_state.custom_tags else [],
                "genres": _get_virtual_genres(raw_data),
                "keywords": _get_virtual_keywords(raw_data, media_type),
                "is_watched": bool(virtual_state.is_watched) if virtual_state else False,
                "resume_position": 0,
                "duration": 0,
            }

            target_group = "series" if media_type == "tv" else "movies"
            library["counts"][target_group] += 1
            if include_all_tabs or target_group in requested_tabs:
                library[target_group].append(virtual_item)

        for state in standalone_virtual_rows:
            if not bool(getattr(state, "is_tracked", True)):
                continue
            media_type = (state.media_type or "movie").lower()
            key = f"{media_type}:{state.tmdb_id}"
            if key in seen_virtual_keys:
                continue
            if _resolve_local_media_item_id(state.tmdb_id, media_type):
                continue

            raw_data = _get_virtual_raw_data(media_type, state.tmdb_id)
            raw_poster_path = raw_data.get("poster_path")
            local_poster_path = _public_image_path(raw_poster_path, "posters")
            year_value = None
            date_field = raw_data.get("first_air_date") if media_type == "tv" else raw_data.get("release_date")
            if date_field:
                try:
                    year_value = int(str(date_field).split("-")[0])
                except (TypeError, ValueError):
                    year_value = None

            virtual_item = {
                "id": f"tmdb_{state.tmdb_id}",
                "title": (raw_data.get("name") or raw_data.get("title") or f"TMDB {state.tmdb_id}") if media_type == "tv" else (raw_data.get("title") or raw_data.get("name") or f"TMDB {state.tmdb_id}"),
                "original_title": raw_data.get("original_title"),
                "original_series_title": raw_data.get("original_name") if media_type == "tv" else None,
                "year": year_value,
                "release_date": raw_data.get("first_air_date") if media_type == "tv" else raw_data.get("release_date"),
                "poster_path": raw_poster_path,
                "local_poster_path": local_poster_path,
                "displayPosterRemote": f"https://image.tmdb.org/t/p/w500{raw_poster_path}" if raw_poster_path else None,
                "rating": raw_data.get("vote_average") or 0,
                "rating_tmdb": raw_data.get("vote_average") or 0,
                "rating_imdb": _get_virtual_imdb_rating(raw_data),
                "type": "series" if media_type == "tv" else "movie",
                "series_tmdb_id": state.tmdb_id if media_type == "tv" else None,
                "tmdb_id": state.tmdb_id,
                "series_title": (raw_data.get("name") or raw_data.get("title")) if media_type == "tv" else None,
                "is_favorite": state.is_favorite,
                "in_library": False,
                "user_rating": state.user_rating,
                "custom_tags": state.custom_tags or [],
                "genres": _get_virtual_genres(raw_data),
                "keywords": _get_virtual_keywords(raw_data, media_type),
                "is_watched": bool(state.is_watched),
                "resume_position": 0,
                "duration": 0,
            }
            seen_virtual_keys.add(key)
            target_group = "series" if media_type == "tv" else "movies"
            library["counts"][target_group] += 1
            if include_all_tabs or target_group in requested_tabs:
                library[target_group].append(virtual_item)

        library["people"] = []
        library["adult_people"] = []
        library["tags"] = []
        people_items = self.people_service.get_people_group("all", filter_status="all", tab="people")
        adult_people_items = self.people_service.get_people_group("all", filter_status="all", tab="adult_people")
        if include_all_tabs or "people" in requested_tabs:
            library["people"] = self.formatter.format_media_cards("people", people_items)
        if self._include_adult_enabled() and (include_all_tabs or "adult_people" in requested_tabs):
            library["adult_people"] = self.formatter.format_media_cards("adult_people", adult_people_items)
        library["counts"]["people"] = len(people_items)
        library["counts"]["adult_people"] = len(adult_people_items) if self._include_adult_enabled() else 0
        library["counts"]["tags"] = None
        library["counts"]["collections"] = len(self.collection_service._build_movie_collection_rows(tab="movies"))
        library["counts"]["adult_collections"] = len(self.collection_service._build_movie_collection_rows(tab="adult"))
        if include_all_tabs:
            library["counts"].update(self._build_display_counts(library))
        else:
            partial_counts = self._build_display_counts(library)
            for tab_name in requested_tabs:
                if tab_name in partial_counts:
                    library["counts"][tab_name] = partial_counts[tab_name]

        return library

    def get_library_filter_options(self, tab: str, filter_ownership: str = "owned", filter_status: str = "active") -> dict:
        normalized_tab = (tab or "movies").lower()
        if normalized_tab not in {"movies", "series", "adult", "adult_series"}:
            return {"genres": [], "decades": [], "years": []}

        grouped = self.get_grouped_library(requested_tabs={normalized_tab})
        tab_items = grouped.get(normalized_tab, [])
        
        genres = set()
        decades = set()
        years = set()
        
        for item in tab_items:
            for g in item.get("genres", []):
                if g:
                    genres.add(g)
            
            y = item.get("year")
            if y is not None:
                try:
                    y_int = int(y)
                    if y_int > 0:
                        years.add(y_int)
                        decade = (y_int // 10) * 10
                        decades.add(f"{decade}s")
                except (ValueError, TypeError):
                    pass
                
        return {
            "genres": sorted(list(genres)),
            "decades": sorted(list(decades), key=lambda x: int(x.replace("s", "")), reverse=True),
            "years": sorted(list(years), reverse=True)
        }
