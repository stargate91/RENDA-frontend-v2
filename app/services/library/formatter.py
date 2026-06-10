from typing import Optional
from sqlalchemy.orm import Session
from ...db.models import VirtualMediaState, ItemType
from ...utils.library_utils import _split_genres
from ...utils.library_utils import _pick_tmdb_cache, _preferred_metadata_languages
from ...utils.library_helpers import match_language_code as _match_language_code

class LibraryFormatterService:
    def __init__(self, db: Session):
        self.db = db

    def format_media_cards(self, tab: str, items: list[dict]) -> list[dict]:
        if tab == "series":
            return self._build_series_nodes(items)

        folder = "persons" if tab in {"actors", "directors", "people", "adult_people"} else "posters"
        return [
            {
                **item,
                "displayTitle": item.get("title"),
                "displayPoster": item.get("poster_path") if tab in {"actors", "directors", "people", "adult_people"} else (item.get("local_poster_path") if item.get("in_library") is False else (item.get("displayPoster") or item.get("poster_path"))),
                "displayPosterRemote": item.get("displayPosterRemote") or (item.get("poster_path") if tab in {"actors", "directors", "people", "adult_people"} and isinstance(item.get("poster_path"), str) and item.get("poster_path").startswith("http") else None),
                "displayPosterFolder": folder,
            }
            for item in items
        ]

    def _build_series_nodes(self, items: list[dict]) -> list[dict]:
        def _numeric_rating(value):
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                return 0.0
            return numeric if numeric > 0 else 0.0

        series_map = {}
        tmdb_ids = set()
        
        for item in items:
            sid = item.get("series_tmdb_id") or item.get("tmdb_id") or item.get("series_title") or item.get("title") or f"unknown_{item.get('id')}"
            
            if isinstance(sid, int) or (isinstance(sid, str) and sid.isdigit()):
                tmdb_ids.add(int(sid))
                
            existing = series_map.get(sid)
            if not existing:
                series_map[sid] = {
                    **item,
                    "id": f"series_{sid}",
                    "displayTitle": (item.get("title") or item.get("series_title")) if item.get("in_library") is False else (item.get("series_title") or item.get("title")),
                    "displayPoster": item.get("local_poster_path") if item.get("in_library") is False else (item.get("series_poster_path") or item.get("poster_path")),
                    "displayPosterRemote": item.get("displayPosterRemote"),
                    "displayPosterFolder": "posters",
                    "isSeriesNode": True,
                    "series_id_key": sid,
                    "_seriesItems": [item],
                }
                continue

            existing["_seriesItems"].append(item)
            if not existing.get("displayPoster") and (item.get("series_poster_path") or item.get("poster_path")):
                existing["displayPoster"] = item.get("series_poster_path") or item.get("poster_path")
            if not existing.get("displayPosterRemote") and item.get("displayPosterRemote"):
                existing["displayPosterRemote"] = item.get("displayPosterRemote")

        if tmdb_ids:
            state_rows = self.db.query(VirtualMediaState).filter(
                VirtualMediaState.tmdb_id.in_(list(tmdb_ids)),
                VirtualMediaState.media_type.in_(["tv", "series", "episode"])
            ).all()
            state_map = {row.tmdb_id: row for row in state_rows}
            preferred_languages = _preferred_metadata_languages(self.db)
            cached_rating_map = {}
            for tmdb_id in tmdb_ids:
                cached = _pick_tmdb_cache(self.db, tmdb_id, "tv", preferred_languages)
                raw_data = cached.raw_data if cached and isinstance(cached.raw_data, dict) else {}
                cached_rating_map[tmdb_id] = _numeric_rating(raw_data.get("vote_average"))
        else:
            state_map = {}
            cached_rating_map = {}

        nodes = []
        for sid, series in series_map.items():
            series_items = series.get("_seriesItems") or []
            episode_items = [item for item in series_items if item.get("type") == "episode"]
            watched_items = episode_items if episode_items else series_items
            is_series_watched = bool(watched_items) and all(item.get("is_watched") is True for item in watched_items)
            series_years = [item.get("year") for item in series_items if isinstance(item.get("year"), int)]
            total_size = sum(item.get("file_size") or 0 for item in series_items)
            total_duration = sum(item.get("duration") or 0 for item in series_items)
            preferred_series_item = next((item for item in series_items if item.get("type") == "series"), None)
            numeric_sid = int(sid) if isinstance(sid, int) or (isinstance(sid, str) and sid.isdigit()) else None
            best_rating_item = next(
                (
                    item for item in ([preferred_series_item] if preferred_series_item else []) + series_items
                    if _numeric_rating(item.get("rating")) > 0
                ),
                None,
            )
            best_imdb_item = next(
                (
                    item for item in ([preferred_series_item] if preferred_series_item else []) + series_items
                    if _numeric_rating(item.get("rating_imdb")) > 0
                ),
                None,
            )
            cached_tmdb_rating = cached_rating_map.get(numeric_sid, 0.0) if numeric_sid is not None else 0.0
            
            node = {
                **series,
                "year": min(series_years) if series_years else series.get("year"),
                "is_watched": is_series_watched,
                "file_size": total_size,
                "duration": total_duration,
                "rating": best_rating_item.get("rating") if best_rating_item else (cached_tmdb_rating or series.get("rating")),
                "rating_tmdb": best_rating_item.get("rating") if best_rating_item else (cached_tmdb_rating or series.get("rating_tmdb") or series.get("rating")),
                "rating_imdb": best_imdb_item.get("rating_imdb") if best_imdb_item else series.get("rating_imdb"),
            }
            
            if isinstance(sid, int) or (isinstance(sid, str) and sid.isdigit()):
                state = state_map.get(int(sid))
                if state:
                    node["is_favorite"] = bool(state.is_favorite)
                    node["user_rating"] = state.user_rating
                    node["custom_tags"] = state.custom_tags or []
                    node["is_watched"] = bool(state.is_watched) or is_series_watched
                    
            nodes.append(node)
            
        return nodes

    def library_item_to_card(self, item, ui_lang: Optional[str]) -> Optional[tuple[str, dict]]:
        active_match = next((match for match in item.matches if match.is_active), None)
        target_group = None
        if active_match and active_match.is_adult:
            target_group = "adult"
        elif item.item_type == ItemType.MOVIE:
            target_group = "movies"
        elif item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
            target_group = "series"

        if not target_group:
            return None

        loc = None
        if active_match and active_match.localizations:
            if ui_lang:
                loc = next((localization for localization in active_match.localizations if _match_language_code(localization.target_language, ui_lang)), None)
            if not loc:
                loc = next((localization for localization in active_match.localizations if localization.is_primary), active_match.localizations[0])

        def _library_year():
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

        def _release_date():
            if not active_match:
                return ""
            if item.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                return active_match.first_air_date.isoformat() if active_match.first_air_date else ""
            return active_match.release_date.isoformat() if active_match.release_date else ""

        data = {
            "id": item.id,
            "title": loc.title if loc else (item.fn_title or item.fd_title or item.filename),
            "original_title": loc.original_title if loc else None,
            "original_series_title": loc.original_series_title if loc else None,
            "year": _library_year(),
            "poster_path": loc.poster_path if loc else None,
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
            "custom_tags": [tag.name for tag in item.tags] if item.tags else [],
            "genres": _split_genres(loc.genres) if (loc and loc.genres) else [],
            "is_watched": getattr(item, "is_watched", False),
            "resume_position": getattr(item, "resume_position", 0),
            "duration": item.duration or 0,
            "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
            "added_at": item.created_at.isoformat() if hasattr(item, "created_at") and item.created_at else None,
            "file_size": getattr(item, "size", 0),
            "release_date": _release_date(),
        }
        return target_group, data
