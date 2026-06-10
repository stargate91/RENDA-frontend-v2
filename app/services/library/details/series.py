import ast
import os
from app.services.library.details.base import BaseDetailProvider
from fastapi.responses import JSONResponse
import logging
from sqlalchemy.orm import joinedload
from app.utils.library_utils import (
    _download_media_assets_sync,
    _preferred_metadata_language,
    _parse_omdb_float,
    _parse_omdb_int,
    _serialize_playback_logs,
    _best_series_level_match,
    _ensure_person_cached,
    _get_virtual_episode_state,
    _get_virtual_media_state,
    _is_virtual_media_tracked,
    _match_language_code,
    _pick_backdrop_path,
    _pick_logo_path,
    _pick_trailer_key,
    _pick_tmdb_cache,
    _preferred_metadata_languages,
    _public_image_path,
    _fetch_tv_season_detail,
    _tmdb_image_url,
    _tmdb_size_for_subfolder,
    _resolve_person_profile_path,
    _series_folder_path,
    _split_genres,
)
from app.db.models import *

logger = logging.getLogger(__name__)

class SeriesDetailProvider(BaseDetailProvider):
    def _collect_episode_numbers(self, episode_number):
        if isinstance(episode_number, list):
            values = episode_number
        elif isinstance(episode_number, str):
            raw_value = episode_number.strip()
            if not raw_value:
                values = []
            elif raw_value.startswith("[") and raw_value.endswith("]"):
                try:
                    parsed_value = ast.literal_eval(raw_value)
                except (SyntaxError, ValueError):
                    parsed_value = None
                if isinstance(parsed_value, list):
                    values = parsed_value
                else:
                    values = []
            else:
                values = []
                for chunk in raw_value.replace("&", ",").split(","):
                    part = chunk.strip()
                    if not part:
                        continue
                    if "-" in part:
                        bounds = [segment.strip() for segment in part.split("-", 1)]
                        try:
                            start = int(bounds[0])
                            end = int(bounds[1])
                        except (TypeError, ValueError):
                            values.append(part)
                            continue
                        if start <= end:
                            values.extend(range(start, end + 1))
                        else:
                            values.extend(range(end, start + 1))
                        continue
                    values.append(part)
        else:
            values = [episode_number]

        normalized = set()
        for value in values:
            try:
                if value is None:
                    continue
                normalized.add(int(value))
            except (TypeError, ValueError):
                continue
        return normalized

    def _normalize_episode_number_field(self, episode_number):
        normalized = sorted(self._collect_episode_numbers(episode_number))
        if not normalized:
            return episode_number
        if len(normalized) == 1:
            return normalized[0]
        return normalized

    def _primary_episode_number(self, episode_number):
        normalized = sorted(self._collect_episode_numbers(episode_number))
        if normalized:
            return normalized[0]
        try:
            return int(episode_number)
        except (TypeError, ValueError):
            return episode_number

    def _is_special_season(self, season):
        if not isinstance(season, dict):
            return False
        season_number = season.get("season_number")
        try:
            return int(season_number) == 0
        except (TypeError, ValueError):
            return False

    def get_library_series_detail(self, series_tmdb_id: str):
        """Returns comprehensive detail data for a full series, including seasons and episodes."""
        db = self.db
        try:
            from app.db.models import MediaItem, MediaMatch, TMDBCache
            from sqlalchemy import or_
        
            # Parse virtual/real tmdb_id
            if isinstance(series_tmdb_id, str) and series_tmdb_id.startswith("tmdb_"):
                try:
                    series_tmdb_id_int = int(series_tmdb_id.split("_")[1])
                except (ValueError, IndexError):
                    return JSONResponse(status_code=400, content={"error": "Invalid series TMDB ID"})
            else:
                try:
                    series_tmdb_id_int = int(series_tmdb_id)
                except ValueError:
                    return JSONResponse(status_code=400, content={"error": "Invalid series TMDB ID"})
                
            # Try to fetch full series metadata from cache
            tmdb_cache = _pick_tmdb_cache(
                db,
                series_tmdb_id_int,
                "tv",
                _preferred_metadata_languages(db),
            )
            cached_series = tmdb_cache.raw_data if tmdb_cache else {}
            cached_seasons = {s.get("season_number"): s for s in cached_series.get("seasons", [])}
            ui_lang = _preferred_metadata_language(db)
        
            # Find all episodes for this series
            items = db.query(MediaItem).join(MediaItem.matches).options(
                joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
                joinedload(MediaItem.matches).joinedload(MediaMatch.people).joinedload(MediaPersonLink.person),
                joinedload(MediaItem.extras),
            ).filter(
                or_(
                    MediaMatch.series_tmdb_id == series_tmdb_id_int,
                    MediaMatch.tmdb_id == series_tmdb_id_int
                ),
                MediaMatch.is_active == True,
                MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
            ).all()

            if not items:
                return self._get_virtual_series_detail(db, series_tmdb_id_int, ui_lang)
            else:
                return self._get_physical_series_detail(db, series_tmdb_id, series_tmdb_id_int, ui_lang, items, cached_seasons, cached_series)

        except Exception as e:
            import traceback
            logger.error(f"Error getting series detail: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)

    def _get_virtual_series_detail(self, db, series_tmdb_id_int, ui_lang):
        from app.api.tmdb_client import TMDBClient
        from app.api.omdb_client import OMDBClient
        tmdb_client = TMDBClient(db)
        omdb_client = OMDBClient(db)
    
        tmdb_data = tmdb_client.get_details(series_tmdb_id_int, "series", language=ui_lang)
        if not tmdb_data:
            return JSONResponse(status_code=404, content={"error": "Series not found on TMDB"})
        
        credits = tmdb_data.get("aggregate_credits", {})
        if not credits or not credits.get("cast"):
            credits = tmdb_data.get("credits", {})

        cast_profiles = []
        raw_directors = []
        for creator in tmdb_data.get("created_by", []) or []:
            if creator.get("id") and creator.get("name"):
                raw_directors.append({
                    "id": creator.get("id"),
                    "name": creator.get("name"),
                    "job": "Creator",
                    "profile_path": creator.get("profile_path"),
                    "popularity": creator.get("popularity", 0),
                })
        if not raw_directors:
            raw_directors = [
                c for c in credits.get("crew", [])
                if c.get("job") in ("Director", "Creator", "Executive Producer")
            ][:2]
        for crew in raw_directors:
            if crew.get("profile_path"):
                cast_profiles.append(crew.get("profile_path"))
            
        director_ids = {d["id"] for d in raw_directors}
        raw_cast = [a for a in credits.get("cast", []) if a.get("id") not in director_ids][:10]
        for actor in raw_cast:
            if actor.get("profile_path"):
                cast_profiles.append(actor.get("profile_path"))

        trailer_key = _pick_trailer_key(tmdb_data, ui_lang, tmdb_data.get("original_language"))

        first_air_date = tmdb_data.get("first_air_date")
        year = None
        if first_air_date:
            try:
                year = int(first_air_date.split("-")[0])
            except:
                pass

        seasons_list = []
        still_paths = []
        logo_path = _pick_logo_path(tmdb_data, ui_lang)
        backdrop_path = _pick_backdrop_path(tmdb_data, ui_lang)
        for s in sorted(tmdb_data.get("seasons", []), key=lambda x: x.get("season_number") or 0):
            s_num = s.get("season_number")
            if s_num is None:
                continue
        
            season_detail = _fetch_tv_season_detail(tmdb_client, series_tmdb_id_int, s_num, ui_lang)
            
            episodes_list = []
            for ep in season_detail.get("episodes", []):
                episode_number = ep.get("episode_number")
                episode_state = _get_virtual_episode_state(db, series_tmdb_id_int, s_num, episode_number) if episode_number is not None else None
                if ep.get("still_path"):
                    still_paths.append(ep.get("still_path"))
                episodes_list.append({
                    "id": f"tmdb_{series_tmdb_id_int}_{s_num}_{ep.get('episode_number')}",
                    "episode_number": episode_number,
                    "title": ep.get("name") or f"Episode {ep.get('episode_number')}",
                    "overview": ep.get("overview"),
                    "still_path": ep.get("still_path"),
                    "runtime": ep.get("runtime"),
                    "rating_tmdb": ep.get("vote_average"),
                    "vote_count_tmdb": ep.get("vote_count"),
                    "air_date": ep.get("air_date"),
                    "path": None,
                    "filename": None,
                    "technical": {},
                    "watch_count": 1 if episode_state and episode_state.is_watched else 0,
                    "is_watched": bool(episode_state.is_watched) if episode_state else False,
                    "resume_position": 0,
                    "last_watched_at": None,
                    "playback_logs": [],
                    "in_library": False
                })

            seasons_list.append({
                "season_number": s_num,
                "title": s.get("name") or f"Season {s_num}",
                "overview": s.get("overview") or season_detail.get("overview"),
                "poster_path": season_detail.get("poster_path") or s.get("poster_path"),
                "air_date": s.get("air_date") or season_detail.get("air_date"),
                "episodes": episodes_list
            })

        self._annotate_season_availability(seasons_list)

        season_posters = [
            season["poster_path"]
            for season in seasons_list
            if season.get("poster_path")
        ]
        _download_media_assets_sync(
            poster_path=tmdb_data.get("poster_path"),
            backdrop_path=backdrop_path,
            logo_path=logo_path,
            cast_profiles=cast_profiles,
            season_posters=season_posters,
            stills=still_paths,
        )

        cast = []
        directors = []
        for crew in raw_directors:
            profile_path = _ensure_person_cached(
                db,
                crew.get("id"),
                crew.get("name"),
                crew.get("profile_path"),
                crew.get("popularity", 0),
                ui_lang
            )
            directors.append({
                "id": crew.get("id"),
                "name": crew.get("name"),
                "job": crew.get("job"),
                "profile_path": profile_path,
                "popularity": crew.get("popularity", 0)
            })

        director_ids = {d["id"] for d in directors}
        raw_cast = [a for a in credits.get("cast", []) if a.get("id") not in director_ids][:10]
        for actor in raw_cast:
            profile_path = _ensure_person_cached(
                db,
                actor.get("id"),
                actor.get("name"),
                actor.get("profile_path"),
                actor.get("popularity", 0),
                ui_lang
            )
            char = actor.get("roles", [{}])[0].get("character") if "roles" in actor else actor.get("character")
            cast.append({
                "id": actor.get("id"),
                "name": actor.get("name"),
                "character": char,
                "job": "Actor",
                "profile_path": profile_path,
                "popularity": actor.get("popularity", 0)
            })

        for season in seasons_list:
            season["poster_path"] = self.formatter.resolve_image_response_path(season.get("poster_path"), subfolder="posters")
            for episode in season["episodes"]:
                episode["still_path"] = self.formatter.resolve_image_response_path(episode.get("still_path"), subfolder="stills")
        virtual_state = _get_virtual_media_state(db, series_tmdb_id_int, "tv")
        is_tracked = _is_virtual_media_tracked(db, series_tmdb_id_int, "tv")
        all_virtual_episodes = [
            episode
            for season in seasons_list
            if not self._is_special_season(season)
            for episode in (season.get("episodes") or [])
            if isinstance(episode, dict)
        ]
        derived_series_watched = bool(all_virtual_episodes) and all(
            bool(episode.get("is_watched"))
            for episode in all_virtual_episodes
        )
        imdb_id = tmdb_data.get("external_ids", {}).get("imdb_id")
        omdb_data = omdb_client.get_ratings(imdb_id, queue_on_limit=True) if imdb_id else {}

        result = {
            "id": f"tmdb_{series_tmdb_id_int}",
            "series_tmdb_id": series_tmdb_id_int,
            "imdb_id": imdb_id,
            "title": tmdb_data.get("name") or tmdb_data.get("original_name") or "Unknown Series",
            "logo_path": self.formatter.resolve_logo_response_path(logo_path=logo_path),
            "backdrop_path": self.formatter.resolve_image_response_path(backdrop_path, subfolder="backdrops"),
            "poster_path": self.formatter.resolve_image_response_path(tmdb_data.get("poster_path"), subfolder="posters"),
            "year": year,
            "first_air_date": tmdb_data.get("first_air_date"),
            "last_air_date": tmdb_data.get("last_air_date"),
            "release_status": tmdb_data.get("status"),
            "overview": tmdb_data.get("overview"),
            "rating_tmdb": tmdb_data.get("vote_average"),
            "rating_imdb": _parse_omdb_float(omdb_data.get("imdb_rating")),
            "vote_count_imdb": _parse_omdb_int(omdb_data.get("imdb_votes")),
            "rating_rotten": omdb_data.get("rotten_tomatoes"),
            "rating_meta": _parse_omdb_int(omdb_data.get("metascore")),
            "genres": _split_genres([g["name"] for g in tmdb_data.get("genres", [])]),
            "type": "tv",
            "cast": cast,
            "directors": directors,
            "seasons": seasons_list,
            "is_favorite": bool(virtual_state.is_favorite) if virtual_state else False,
            "user_rating": virtual_state.user_rating if virtual_state else None,
            "custom_tags": (virtual_state.custom_tags or []) if virtual_state else [],
            "is_tracked": is_tracked,
            "watch_count": 1 if ((virtual_state and virtual_state.is_watched) or derived_series_watched) else 0,
            "is_watched": bool(virtual_state.is_watched) if virtual_state else derived_series_watched,
            "resume_position": 0,
            "last_watched_at": None,
            "playback_logs": [],
            "trailer_key": trailer_key,
            "path": None,
            "in_library": False
        }
        self._annotate_series_availability(result)
        return JSONResponse(content=result, media_type="application/json; charset=utf-8")

    def _get_physical_series_detail(self, db, series_tmdb_id, series_tmdb_id_int, ui_lang, items, cached_seasons, cached_series):
        def get_sort_keys(item):
            match = next((m for m in item.matches if m.is_active), None)
            if not match: return (99, 99)
        
            s_num = match.season_number if match.season_number is not None else item.fn_season
            raw_e_num = match.episode_number if match.episode_number is not None else item.fn_episode
            e_num = self._primary_episode_number(raw_e_num)

            if s_num is None: s_num = 99
            if e_num is None: e_num = 99
            try:
                s_num = int(s_num)
                e_num = int(e_num)
            except:
                e_num = 99
            return (s_num, e_num)

        # Filter out the series folder itself
        episodes_only = [i for i in items if i.item_type == ItemType.EPISODE]
        episodes_only.sort(key=get_sort_keys)
    
        if not episodes_only:
            episodes_only = items
            episodes_only.sort(key=get_sort_keys)

        base_item = next((i for i in items if i.item_type == ItemType.SERIES), items[0])
        base_match = _best_series_level_match(items)
        base_loc = None
        if base_match and base_match.localizations:
            if ui_lang:
                base_loc = next((l for l in base_match.localizations if _match_language_code(l.target_language, ui_lang)), None)
            if not base_loc:
                base_loc = next((l for l in base_match.localizations if l.is_primary), base_match.localizations[0])

        tmdb_episode_stills = {}
        self._download_and_update_physical_assets(db, episodes_only, base_match, base_loc, cached_seasons, series_tmdb_id_int, ui_lang, tmdb_episode_stills)

        # Query virtual media state for the series
        virtual_state = db.query(VirtualMediaState).filter(
            VirtualMediaState.tmdb_id == series_tmdb_id_int,
            VirtualMediaState.media_type == "tv"
        ).first()

        preferred_logo_path = _pick_logo_path(cached_series, ui_lang) if cached_series else None
        effective_logo_path = preferred_logo_path or (base_loc.logo_path if base_loc else None)
        effective_local_logo_path = (
            base_loc.local_logo_path
            if base_loc and effective_logo_path and effective_logo_path == base_loc.logo_path
            else None
        )
        preferred_backdrop_path = _pick_backdrop_path(cached_series, ui_lang) if cached_series else None
        effective_backdrop_path = preferred_backdrop_path or (base_loc.backdrop_path if base_loc else None)
        effective_local_backdrop_path = (
            base_loc.local_backdrop_path
            if base_loc and effective_backdrop_path and effective_backdrop_path == base_loc.backdrop_path
            else None
        )

        series_data = {
            "id": base_item.id,
            "series_tmdb_id": series_tmdb_id,
            "imdb_id": base_match.imdb_id if base_match else None,
            "title": base_loc.series_title if base_loc else (base_loc.title if base_loc else "Unknown Series"),
            "logo_path": self.formatter.resolve_logo_response_path(
                logo_path=effective_logo_path,
                local_logo_path=effective_local_logo_path,
            ),
            "backdrop_path": (
                _public_image_path(effective_local_backdrop_path, "backdrops") or effective_backdrop_path
            ) if (base_loc or effective_backdrop_path) else None,
            "poster_path": (
                _public_image_path(base_loc.local_series_poster_path, "posters")
                or _public_image_path(base_loc.local_poster_path, "posters")
                or (base_loc.series_poster_path if base_loc and base_loc.series_poster_path else (base_loc.poster_path if base_loc else None))
            ) if base_loc else None,
            "year": base_item.fn_year,
            "first_air_date": base_match.first_air_date.strftime("%Y-%m-%d") if (base_match and base_match.first_air_date) else cached_series.get("first_air_date"),
            "last_air_date": base_match.last_air_date.strftime("%Y-%m-%d") if (base_match and base_match.last_air_date) else cached_series.get("last_air_date"),
            "release_status": (base_match.release_status if base_match else None) or cached_series.get("status"),
            "overview": (cached_series.get("overview") if cached_series and cached_series.get("overview") else (base_loc.overview if base_loc else None)),
            "rating_tmdb": cached_series.get("vote_average") or (base_match.rating_tmdb if base_match else None),
            "rating_imdb": base_match.rating_imdb if base_match else None,
            "vote_count_imdb": base_match.vote_count_imdb if base_match else None,
            "rating_rotten": base_match.rating_rotten if base_match else None,
            "rating_meta": base_match.rating_meta if base_match else None,
            "genres": _split_genres([g["name"] for g in cached_series.get("genres", [])] if cached_series.get("genres") else (base_loc.genres if base_loc else [])),
            "cast": [],
            "directors": [],
            "seasons": {},
            "is_favorite": virtual_state.is_favorite if virtual_state else (base_item.is_favorite or False),
            "user_rating": virtual_state.user_rating if virtual_state else base_item.user_rating,
            "custom_tags": (virtual_state.custom_tags or []) if virtual_state else ([t.name for t in base_item.tags] if base_item.tags else []),
            "trailer_key": base_loc.trailer_url if base_loc else None,
            "path": _series_folder_path(base_item),
            "extras": [],
        }

        series_extras = []
        for extra in (base_item.extras or []):
            serialized = self.formatter.serialize_extra_file(extra, base_item.filename or base_item.fn_title or base_item.folder_name or base_item.current_path)
            if serialized:
                series_extras.append(serialized)

        series_cast_map = {}

        for item in episodes_only:
            match = next((m for m in item.matches if m.is_active), None)
            if not match: continue
            if item.item_type == ItemType.SERIES:
                continue

            loc = None
            if match.localizations:
                if ui_lang:
                        loc = next((l for l in match.localizations if _match_language_code(l.target_language, ui_lang)), None)
                if not loc:
                    loc = next((l for l in match.localizations if l.is_primary), match.localizations[0])

            s_num = match.season_number if match.season_number is not None else item.fn_season
            raw_e_num = match.episode_number if match.episode_number is not None else item.fn_episode
            e_num = self._normalize_episode_number_field(raw_e_num)
            primary_e_num = self._primary_episode_number(raw_e_num)

            if s_num is None: s_num = 1
            if primary_e_num is None: primary_e_num = 1
            try:
                s_num = int(s_num)
                primary_e_num = int(primary_e_num)
            except:
                s_num = 1
                primary_e_num = 1

            if s_num not in series_data["seasons"]:
                c_season = cached_seasons.get(s_num, {})
                s_poster_raw = c_season.get("poster_path") or (loc.poster_path if loc else None)
                s_poster = self.formatter.resolve_image_response_path(s_poster_raw, subfolder="posters")
                s_overview = c_season.get("overview")
            
                series_data["seasons"][s_num] = {
                    "season_number": s_num,
                    "title": loc.season_title if loc and loc.season_title else f"Season {s_num}",
                    "poster_path": s_poster,
                    "overview": s_overview,
                    "air_date": (match.season_air_date.strftime("%Y-%m-%d") if match.season_air_date else None) or c_season.get("air_date"),
                    "episodes": []
                }

            # Episode technical data
            technical = {
                "resolution": item.resolution,
                "video_codec": item.video_codec,
                "audio_codec": item.audio_codec,
                "audio_channels": item.audio_channels,
                "hdr_type": item.hdr_type,
                "bit_depth": item.bit_depth,
                "framerate": item.framerate,
                "duration": item.duration,
                "size_bytes": item.size,
                "source": item.source.value if item.source else None,
            }

            episode_data = {
                "id": item.id,
                "episode_number": e_num,
                "title": loc.episode_title if loc else (item.fn_title or f"Episode {e_num}"),
                "overview": loc.overview if loc else None,
                "still_path": (
                    self.formatter.resolve_image_response_path(loc.still_path, subfolder="stills")
                    if loc and loc.still_path
                    else self.formatter.resolve_image_response_path(
                        tmdb_episode_stills.get((s_num, primary_e_num)),
                        subfolder="stills",
                    )
                ),
                "runtime": match.runtime,
                "rating_tmdb": match.rating_tmdb,
                "vote_count_tmdb": match.vote_count_tmdb,
                "air_date": match.episode_air_date.isoformat() if match.episode_air_date else None,
                "path": item.current_path,
                "filename": item.filename,
                "technical": technical,
                "watch_count": getattr(item, "watch_count", 0),
                "is_watched": getattr(item, "is_watched", False),
                "resume_position": getattr(item, "resume_position", 0),
                "last_watched_at": getattr(item, "last_watched_at").isoformat() if getattr(item, "last_watched_at", None) else None,
                "playback_logs": _serialize_playback_logs(item)
            }
            series_data["seasons"][s_num]["episodes"].append(episode_data)

            for extra in (item.extras or []):
                parent_label = loc.episode_title if loc and loc.episode_title else (item.fn_title or item.filename or f"S{s_num}E{primary_e_num}")
                serialized = self.formatter.serialize_extra_file(extra, parent_label)
                if serialized:
                    series_extras.append(serialized)

            # Aggregate cast
            for link in match.people:
                person = link.person
                if person.id not in series_cast_map:
                    p_loc = person.localizations[0] if person.localizations else None
                    person_data = {
                        "id": person.id,
                        "name": p_loc.name if p_loc else "Unknown",
                        "character": link.character_name,
                        "job": link.job,
                        "profile_path": _resolve_person_profile_path(person),
                        "popularity": person.popularity or 0,
                        "order": link.order
                    }
                    series_cast_map[person.id] = person_data

        # Sort seasons and episodes
        series_data["seasons"] = [series_data["seasons"][k] for k in sorted(series_data["seasons"].keys())]
        for s in series_data["seasons"]:
            def ep_sort(e):
                val = self._primary_episode_number(e.get("episode_number"))
                try: return int(val)
                except: return 99
            s["episodes"].sort(key=ep_sort)

        self._merge_missing_tmdb_episodes(series_data, cached_series, series_tmdb_id_int, ui_lang)

        # Split cast and directors
        for p in sorted(series_cast_map.values(), key=lambda x: x["order"]):
            if p["job"] in ("Director", "Creator"):
                series_data["directors"].append(p)
            elif p["job"] == "Actor":
                series_data["cast"].append(p)

        series_data["cast"] = series_data["cast"][:10]
        series_data["directors"] = series_data["directors"][:2]
        series_data["extras"] = sorted(series_extras, key=lambda extra: (str(extra.get("parent_label") or "").lower(), str(extra.get("name") or "").lower()))
        self._annotate_series_availability(series_data)

        return JSONResponse(content=series_data, media_type="application/json; charset=utf-8")

    def _merge_missing_tmdb_episodes(self, series_data, cached_series, series_tmdb_id_int, ui_lang):
        from app.api.tmdb_client import TMDBClient

        tmdb_client = TMDBClient(self.db)
        seasons_by_number = {
            season.get("season_number"): season
            for season in (series_data.get("seasons") or [])
            if season.get("season_number") is not None
        }
        season_sources = sorted(
            {
                season.get("season_number")
                for season in (cached_series.get("seasons") or [])
                if season.get("season_number") is not None
            }.union(seasons_by_number.keys())
        )

        for season_number in season_sources:
            season_detail = _fetch_tv_season_detail(tmdb_client, series_tmdb_id_int, season_number, ui_lang)
            if not season_detail:
                continue

            season_entry = seasons_by_number.get(season_number)
            if not season_entry:
                season_entry = {
                    "season_number": season_number,
                    "title": season_detail.get("name") or f"Season {season_number}",
                    "poster_path": self.formatter.resolve_image_response_path(season_detail.get("poster_path"), subfolder="posters"),
                    "overview": season_detail.get("overview"),
                    "air_date": season_detail.get("air_date"),
                    "episodes": [],
                }
                series_data["seasons"].append(season_entry)
                seasons_by_number[season_number] = season_entry

            existing_episode_numbers = set()
            for existing_episode in (season_entry.get("episodes") or []):
                existing_episode_numbers.update(
                    self._collect_episode_numbers(existing_episode.get("episode_number"))
                )

            for episode in season_detail.get("episodes", []):
                episode_number = episode.get("episode_number")
                if episode_number is None:
                    continue
                try:
                    normalized_episode_number = int(episode_number)
                except (TypeError, ValueError):
                    continue
                if normalized_episode_number in existing_episode_numbers:
                    continue

                episode_state = _get_virtual_episode_state(
                    self.db,
                    series_tmdb_id_int,
                    season_number,
                    normalized_episode_number,
                )

                season_entry["episodes"].append({
                    "id": f"tmdb_{series_tmdb_id_int}_{season_number}_{normalized_episode_number}",
                    "episode_number": normalized_episode_number,
                    "title": episode.get("name") or f"Episode {normalized_episode_number}",
                    "overview": episode.get("overview"),
                    "still_path": self.formatter.resolve_image_response_path(episode.get("still_path"), subfolder="stills"),
                    "runtime": episode.get("runtime"),
                    "rating_tmdb": episode.get("vote_average"),
                    "vote_count_tmdb": episode.get("vote_count"),
                    "air_date": episode.get("air_date"),
                    "path": None,
                    "filename": None,
                    "technical": {},
                    "watch_count": 1 if episode_state and episode_state.is_watched else 0,
                    "is_watched": bool(episode_state.is_watched) if episode_state else False,
                    "resume_position": 0,
                    "last_watched_at": None,
                    "playback_logs": [],
                    "in_library": False,
                    "is_missing": True,
                })

        for season in series_data.get("seasons") or []:
            season["episodes"] = sorted(
                season.get("episodes") or [],
                key=lambda episode: int(self._primary_episode_number(episode.get("episode_number")) or 0),
            )
        series_data["seasons"] = sorted(
            series_data.get("seasons") or [],
            key=lambda season: int(season.get("season_number") or 0),
        )
        self._annotate_season_availability(series_data.get("seasons") or [])

    def _annotate_season_availability(self, seasons):
        for season in seasons:
            episodes = season.get("episodes") or []
            available_episode_numbers = set()
            total_episode_numbers = set()
            for episode in episodes:
                episode_numbers = self._collect_episode_numbers(episode.get("episode_number"))
                if not episode_numbers:
                    continue
                total_episode_numbers.update(episode_numbers)
                if episode.get("in_library") is not False and not episode.get("is_missing"):
                    available_episode_numbers.update(episode_numbers)
            available_count = len(available_episode_numbers)
            total_count = len(total_episode_numbers)
            missing_count = 0 if self._is_special_season(season) else max(0, total_count - available_count)
            season["available_episode_count"] = available_count
            season["total_episode_count"] = total_count
            season["missing_episode_count"] = missing_count
            for episode in episodes:
                if "in_library" not in episode:
                    episode["in_library"] = True
                if "is_missing" not in episode:
                    episode["is_missing"] = episode.get("in_library") is False

    def _annotate_series_availability(self, series_data):
        seasons = series_data.get("seasons") or []
        non_special_seasons = [season for season in seasons if not self._is_special_season(season)]
        available_count = sum(int(season.get("available_episode_count") or 0) for season in non_special_seasons)
        total_count = sum(int(season.get("total_episode_count") or 0) for season in non_special_seasons)
        missing_count = max(0, total_count - available_count)
        series_data["available_episode_count"] = available_count
        series_data["total_episode_count"] = total_count
        series_data["missing_episode_count"] = missing_count

    def _download_and_update_physical_assets(self, db, episodes_only, base_match, base_loc, cached_seasons, series_tmdb_id_int, ui_lang, tmdb_episode_stills):
        # Synchronously download missing media assets for local/missing series
        missing_poster = None
        missing_backdrop = None
        missing_logo = None
        missing_season_posters = []
        missing_profiles = []
        missing_stills = []

        if base_match and base_loc:
            poster_p = base_loc.series_poster_path if base_loc.series_poster_path else base_loc.poster_path
            if poster_p and not _public_image_path(base_loc.local_series_poster_path, "posters"):
                local_p = os.path.join("data", "media", "images", "posters", poster_p.lstrip("/"))
                if not os.path.exists(local_p):
                    missing_poster = poster_p
                
            if base_loc.backdrop_path and not _public_image_path(base_loc.local_backdrop_path, "backdrops"):
                local_b = os.path.join("data", "media", "images", "backdrops", base_loc.backdrop_path.lstrip("/"))
                if not os.path.exists(local_b):
                    missing_backdrop = base_loc.backdrop_path
            if base_loc.logo_path and not _public_image_path(base_loc.local_logo_path, "logos"):
                local_logo = os.path.join("data", "media", "images", "logos", base_loc.logo_path.lstrip("/"))
                if not os.path.exists(local_logo):
                    missing_logo = base_loc.logo_path

        # Gather season posters and performer profiles from DB matches
        seen_seasons = set()
        seen_persons = set()
        for item in episodes_only:
            match = next((m for m in item.matches if m.is_active), None)
            if not match: continue

            s_num = match.season_number if match.season_number is not None else item.fn_season
            if s_num is None: s_num = 1
            try: s_num = int(s_num)
            except: s_num = 1

            if s_num not in seen_seasons:
                seen_seasons.add(s_num)
                c_season = cached_seasons.get(s_num, {})
                loc = None
                if match.localizations:
                    if ui_lang:
                        loc = next((l for l in match.localizations if _match_language_code(l.target_language, ui_lang)), None)
                    if not loc:
                        loc = next((l for l in match.localizations if l.is_primary), match.localizations[0])
                s_poster = c_season.get("poster_path") or (loc.poster_path if loc else None)
                if s_poster:
                    local_s_post = os.path.join("data", "media", "images", "posters", s_poster.lstrip("/"))
                    if not os.path.exists(local_s_post):
                        missing_season_posters.append(s_poster)

            loc = None
            if match.localizations:
                if ui_lang:
                    loc = next((l for l in match.localizations if _match_language_code(l.target_language, ui_lang)), None)
                if not loc:
                    loc = next((l for l in match.localizations if l.is_primary), match.localizations[0])
            if loc and loc.still_path:
                local_still = os.path.join("data", "media", "images", "stills", loc.still_path.lstrip("/"))
                if not os.path.exists(local_still):
                    missing_stills.append(loc.still_path)

            for link in match.people:
                person = link.person
                if person.id not in seen_persons:
                    seen_persons.add(person.id)
                    if person.profile_path and not _public_image_path(person.local_profile_path, "persons"):
                        local_p = os.path.join("data", "media", "images", "persons", person.profile_path.lstrip("/"))
                        if not os.path.exists(local_p):
                            missing_profiles.append(person.profile_path)

        seasons_needing_tmdb = set()
        for item in episodes_only:
            match = next((m for m in item.matches if m.is_active), None)
            if not match:
                continue

            s_num = match.season_number if match.season_number is not None else item.fn_season
            if s_num is None:
                s_num = 1
            try:
                s_num = int(s_num)
            except Exception:
                s_num = 1

            loc = None
            if match.localizations:
                if ui_lang:
                    loc = next((l for l in match.localizations if _match_language_code(l.target_language, ui_lang)), None)
                if not loc:
                    loc = next((l for l in match.localizations if l.is_primary), match.localizations[0])

            still_missing = True
            if loc and loc.still_path:
                local_still = os.path.join("data", "media", "images", "stills", loc.still_path.lstrip("/"))
                still_missing = not os.path.exists(local_still)
            if still_missing:
                seasons_needing_tmdb.add(s_num)

        if seasons_needing_tmdb:
            from app.api.tmdb_client import TMDBClient
            tmdb_client = TMDBClient(db)
            for s_num in sorted(seasons_needing_tmdb):
                season_detail = _fetch_tv_season_detail(tmdb_client, series_tmdb_id_int, s_num, ui_lang)
                c_season = cached_seasons.get(s_num, {})
                s_poster = season_detail.get("poster_path") or c_season.get("poster_path")
                if s_poster:
                    local_s_post = os.path.join("data", "media", "images", "posters", s_poster.lstrip("/"))
                    if not os.path.exists(local_s_post) and s_poster not in missing_season_posters:
                        missing_season_posters.append(s_poster)
                for ep in season_detail.get("episodes", []):
                    ep_num = ep.get("episode_number")
                    still = ep.get("still_path")
                    if ep_num is None or not still:
                        continue
                    local_still = os.path.join("data", "media", "images", "stills", still.lstrip("/"))
                    if not os.path.exists(local_still) and still not in missing_stills:
                        missing_stills.append(still)
                    tmdb_episode_stills[(s_num, ep_num)] = still

        if missing_poster or missing_backdrop or missing_logo or missing_season_posters or missing_profiles or missing_stills:
            _download_media_assets_sync(
                poster_path=missing_poster,
                backdrop_path=missing_backdrop,
                logo_path=missing_logo,
                cast_profiles=missing_profiles,
                season_posters=missing_season_posters,
                stills=missing_stills
            )

            # Update DB paths and statuses immediately!
            try:
                updated = False
                if base_loc:
                    if missing_poster:
                        local_p_rel = f"data/media/images/posters/{missing_poster.lstrip('/')}"
                        if os.path.exists(local_p_rel):
                            base_loc.local_series_poster_path = local_p_rel
                            base_loc.local_poster_path = local_p_rel
                            updated = True
                    if missing_backdrop:
                        local_b_rel = f"data/media/images/backdrops/{missing_backdrop.lstrip('/')}"
                        if os.path.exists(local_b_rel):
                            base_loc.local_backdrop_path = local_b_rel
                            updated = True
                    if missing_logo:
                        local_logo_rel = f"data/media/images/logos/{missing_logo.lstrip('/')}"
                        if os.path.exists(local_logo_rel):
                            base_loc.local_logo_path = local_logo_rel
                            updated = True

                for item in episodes_only:
                    match = next((m for m in item.matches if m.is_active), None)
                    if not match: continue
                    for link in match.people:
                        person = link.person
                        if person.profile_path and person.profile_path in missing_profiles:
                            local_p_rel = f"data/media/images/persons/{person.profile_path.lstrip('/')}"
                            if os.path.exists(local_p_rel):
                                person.local_profile_path = local_p_rel
                                person.image_status = ImageStatus.COMPLETED
                                updated = True
                if updated:
                    db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error updating local series image paths: {e}")
