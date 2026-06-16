import logging
from fastapi.responses import JSONResponse
from app.db.models import ItemType, VirtualMediaState

from app.utils.library_utils import (
    _serialize_playback_logs,
    _best_series_level_match,
    _match_language_code,
    _pick_backdrop_path,
    _pick_logo_path,
    _public_image_path,
    _fetch_tv_season_detail,
    _resolve_person_profile_path,
    _series_folder_path,
    _split_genres,
)

from app.services.library.details.series_helpers import (
    _get_series_keywords,
    _collect_episode_numbers,
    _normalize_episode_number_field,
    _primary_episode_number,
    _annotate_season_availability,
    _annotate_series_availability,
)

from app.services.library.details.series_assets import SeriesAssetsMixin

logger = logging.getLogger(__name__)

class SeriesPhysicalMixin(SeriesAssetsMixin):
    def _get_physical_series_detail(self, db, series_tmdb_id, series_tmdb_id_int, ui_lang, items, cached_seasons, cached_series):
        def get_sort_keys(item):
            match = next((m for m in item.matches if m.is_active), None)
            if not match: return (99, 99)
        
            s_num = match.season_number if match.season_number is not None else item.fn_season
            raw_e_num = match.episode_number if match.episode_number is not None else item.fn_episode
            e_num = _primary_episode_number(raw_e_num)

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
        from app.services.language_service import LanguageService
        base_loc = LanguageService.pick_localization(base_match.localizations, [ui_lang] if ui_lang else []) if base_match else None

        tmdb_episode_stills = {}
        self._download_and_update_physical_assets(db, episodes_only, base_match, base_loc, cached_seasons, series_tmdb_id_int, ui_lang, tmdb_episode_stills)

        # Query virtual media state for the series
        virtual_state = db.query(VirtualMediaState).filter(
            VirtualMediaState.tmdb_id == series_tmdb_id_int,
            VirtualMediaState.media_type == "tv"
        ).first()

        if (not cached_series or not cached_series.get("networks")) and series_tmdb_id_int:
            try:
                from app.api.tmdb_client import TMDBClient
                tmdb_client = TMDBClient(db)
                api_data = tmdb_client.get_details(series_tmdb_id_int, "series", language=ui_lang)
                if api_data:
                    cached_series = api_data
            except Exception as e:
                logger.error(f"Failed to fetch series details from TMDB API on the fly: {e}")

        preferred_logo_path = _pick_logo_path(cached_series, ui_lang) if cached_series else None
        effective_logo_path = preferred_logo_path or (base_loc.logo_path if base_loc else None)
        effective_local_logo_path = (
            base_loc.local_logo_path
            if base_loc and effective_logo_path and effective_logo_path == base_loc.logo_path
            else None
        )
        preferred_backdrop_path = _pick_backdrop_path(cached_series, ui_lang) if cached_series else None
        effective_backdrop_path = (base_match.backdrop_path if base_match and base_match.backdrop_path else None) or preferred_backdrop_path
        effective_local_backdrop_path = (
            base_match.local_backdrop_path
            if base_match and effective_backdrop_path and effective_backdrop_path == base_match.backdrop_path
            else None
        )

        cached_companies = {}
        if cached_series and cached_series.get("production_companies"):
            for cc in cached_series.get("production_companies"):
                if isinstance(cc, dict) and cc.get("name"):
                    cached_companies[cc["name"].lower()] = cc.get("logo_path")

        companies_fallback = []
        raw_companies = base_match.companies if base_match else None
        if not raw_companies and cached_series:
            raw_companies = cached_series.get("production_companies")
        if raw_companies:
            for c in raw_companies:
                if isinstance(c, str):
                    logo = cached_companies.get(c.lower())
                    companies_fallback.append({
                        "name": c,
                        "logo_path": self.formatter.resolve_logo_response_path(logo_path=logo)
                    })
                elif isinstance(c, dict):
                    logo = c.get("logo_path") or cached_companies.get(c.get("name", "").lower())
                    companies_fallback.append({
                        "name": c.get("name"),
                        "logo_path": self.formatter.resolve_logo_response_path(logo_path=logo, local_logo_path=c.get("local_logo_path"))
                    })

        cached_networks = {}
        if cached_series and cached_series.get("networks"):
            for cn in cached_series.get("networks"):
                if isinstance(cn, dict) and cn.get("name"):
                    cached_networks[cn["name"].lower()] = cn.get("logo_path")

        networks_fallback = []
        raw_networks = base_match.networks if base_match else None
        if not raw_networks and cached_series:
            raw_networks = cached_series.get("networks")
        if raw_networks:
            for n in raw_networks:
                if isinstance(n, str):
                    logo = cached_networks.get(n.lower())
                    networks_fallback.append({
                        "name": n,
                        "logo_path": self.formatter.resolve_logo_response_path(logo_path=logo)
                    })
                elif isinstance(n, dict):
                    logo = n.get("logo_path") or cached_networks.get(n.get("name", "").lower())
                    networks_fallback.append({
                        "name": n.get("name"),
                        "logo_path": self.formatter.resolve_logo_response_path(logo_path=logo, local_logo_path=n.get("local_logo_path"))
                    })

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
            "keywords": _get_series_keywords(cached_series, base_match),
            "companies": companies_fallback,
            "networks": networks_fallback,
            "cast": [],
            "directors": [],
            "writers": [],
            "seasons": {},
            "is_adult": base_match.is_adult if base_match else False,
            "is_favorite": virtual_state.is_favorite if virtual_state else (base_item.is_favorite or False),
            "user_rating": virtual_state.user_rating if virtual_state else base_item.user_rating,
            "user_comment": virtual_state.user_comment if virtual_state else base_item.user_comment,
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

            loc = LanguageService.pick_localization(match.localizations, [ui_lang] if ui_lang else [])

            s_num = match.season_number if match.season_number is not None else item.fn_season
            raw_e_num = match.episode_number if match.episode_number is not None else item.fn_episode
            e_num = _normalize_episode_number_field(raw_e_num)
            primary_e_num = _primary_episode_number(raw_e_num)

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
                    self.formatter.resolve_image_response_path(match.still_path, subfolder="stills")
                    if match and match.still_path
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
                        "order": link.order,
                        "gender": person.gender
                    }
                    series_cast_map[person.id] = person_data

        # Sort seasons and episodes
        series_data["seasons"] = [series_data["seasons"][k] for k in sorted(series_data["seasons"].keys())]
        for s in series_data["seasons"]:
            def ep_sort(e):
                val = _primary_episode_number(e.get("episode_number"))
                try: return int(val)
                except: return 99
            s["episodes"].sort(key=ep_sort)

        self._merge_missing_tmdb_episodes(series_data, cached_series, series_tmdb_id_int, ui_lang)

        # Split cast and directors
        for p in sorted(series_cast_map.values(), key=lambda x: x["order"]):
            if p["job"] in ("Director", "Creator"):
                series_data["directors"].append(p)
            elif p["job"] == "Writer":
                series_data["writers"].append(p)
            elif p["job"] == "Actor":
                series_data["cast"].append(p)

        series_data["cast"] = series_data["cast"][:10]
        series_data["directors"] = series_data["directors"][:2]
        series_data["writers"] = series_data["writers"][:2]
        series_data["extras"] = sorted(series_extras, key=lambda extra: (str(extra.get("parent_label") or "").lower(), str(extra.get("name") or "").lower()))
        _annotate_series_availability(series_data)

        return JSONResponse(content=series_data, media_type="application/json; charset=utf-8")

    def _merge_missing_tmdb_episodes(self, series_data, cached_series, series_tmdb_id_int, ui_lang):
        from app.api.tmdb_client import TMDBClient
        from app.utils.library_utils import _get_virtual_episode_state

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
                    _collect_episode_numbers(existing_episode.get("episode_number"))
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
                key=lambda episode: int(_primary_episode_number(episode.get("episode_number")) or 0),
            )
        series_data["seasons"] = sorted(
            series_data.get("seasons") or [],
            key=lambda season: int(season.get("season_number") or 0),
        )
        _annotate_season_availability(series_data.get("seasons") or [])


