from fastapi.responses import JSONResponse
from app.api.tmdb_client import TMDBClient
from app.api.omdb_client import OMDBClient

from app.utils.library_utils import (
    _preferred_metadata_language,
    _parse_omdb_float,
    _parse_omdb_int,
    _get_virtual_media_state_with_tracking,
    _has_virtual_episode_states,
    _get_virtual_episode_states_map,
    _pick_backdrop_path,
    _pick_logo_path,
    _pick_trailer_key,
    _fetch_tv_season_detail,
    _split_genres,
)

from app.services.library.details.series_helpers import (
    _annotate_series_availability,
    _is_special_season,
)


class SeriesVirtualMixin:
    def _build_virtual_season_payload(self, tmdb_client, db, series_tmdb_id_int, season_meta, ui_lang, episode_states_map, episodes_limit=None):
        season_number = season_meta.get("season_number")
        if season_number is None:
            return None

        season_detail = _fetch_tv_season_detail(tmdb_client, series_tmdb_id_int, season_number, ui_lang)
        all_episodes = season_detail.get("episodes", []) or []
        if episodes_limit is None:
            visible_episodes = all_episodes
            episodes_complete = True
        else:
            visible_episodes = all_episodes[:max(0, int(episodes_limit))]
            episodes_complete = len(visible_episodes) >= len(all_episodes)

        episodes = []
        still_paths = []
        for ep in visible_episodes:
            episode_number = ep.get("episode_number")
            episode_state = episode_states_map.get((season_number, episode_number)) if episode_number is not None else None
            if ep.get("still_path"):
                still_paths.append(ep.get("still_path"))
            episodes.append({
                "id": f"tmdb_{series_tmdb_id_int}_{season_number}_{episode_number}",
                "episode_number": episode_number,
                "title": ep.get("name") or f"Episode {episode_number}",
                "overview": ep.get("overview"),
                "still_path": self.formatter.resolve_image_response_path(ep.get("still_path"), subfolder="stills"),
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
                "peaks_count": 0,
                "peaks_history": [],
                "in_library": False,
                "is_missing": True,
            })

        total_episode_count = int(season_meta.get("episode_count") or len(all_episodes) or 0)
        available_episode_count = 0 if not _is_special_season({"season_number": season_number}) else total_episode_count
        missing_episode_count = 0 if _is_special_season({"season_number": season_number}) else max(0, total_episode_count - available_episode_count)

        return {
            "season_number": season_number,
            "title": season_meta.get("name") or season_detail.get("name") or f"Season {season_number}",
            "overview": season_meta.get("overview") or season_detail.get("overview"),
            "poster_path": self.formatter.resolve_image_response_path(season_detail.get("poster_path") or season_meta.get("poster_path"), subfolder="posters"),
            "air_date": season_meta.get("air_date") or season_detail.get("air_date"),
            "episode_count": total_episode_count,
            "episodes_loaded_count": len(episodes),
            "episodes_complete": episodes_complete,
            "available_episode_count": available_episode_count,
            "total_episode_count": total_episode_count,
            "missing_episode_count": missing_episode_count,
            "episodes": episodes,
        }

    def _build_virtual_season_shell_payload(self, season_meta):
        season_number = season_meta.get("season_number")
        if season_number is None:
            return None

        total_episode_count = int(season_meta.get("episode_count") or 0)
        available_episode_count = 0 if not _is_special_season({"season_number": season_number}) else total_episode_count
        missing_episode_count = 0 if _is_special_season({"season_number": season_number}) else max(0, total_episode_count - available_episode_count)

        return {
            "season_number": season_number,
            "title": season_meta.get("name") or f"Season {season_number}",
            "overview": season_meta.get("overview"),
            "poster_path": self.formatter.resolve_image_response_path(season_meta.get("poster_path"), subfolder="posters"),
            "air_date": season_meta.get("air_date"),
            "episode_count": total_episode_count,
            "episodes_loaded_count": 0,
            "episodes_complete": False,
            "available_episode_count": available_episode_count,
            "total_episode_count": total_episode_count,
            "missing_episode_count": missing_episode_count,
            "episodes": [],
        }


    def _build_virtual_people_payload(self, people):
        built = []
        for person in people:
            char = person.get("roles", [{}])[0].get("character") if "roles" in person else person.get("character")
            built.append({
                "id": person.get("id"),
                "name": person.get("name"),
                "character": char,
                "job": person.get("job"),
                "profile_path": person.get("profile_path"),
                "popularity": person.get("popularity", 0),
                "gender": person.get("gender"),
            })
        return built

    def _build_virtual_series_shell(self, db, series_tmdb_id_int, ui_lang, tmdb_data, seasons_limit=5, initial_episodes_limit=4):
        tmdb_client = TMDBClient(db)
        omdb_client = OMDBClient(db)

        credits = tmdb_data.get("aggregate_credits", {})
        if not credits or not credits.get("cast"):
            credits = tmdb_data.get("credits", {})

        raw_directors = []
        for creator in tmdb_data.get("created_by", []) or []:
            if creator.get("id") and creator.get("name"):
                raw_directors.append({
                    "id": creator.get("id"),
                    "name": creator.get("name"),
                    "job": "Creator",
                    "profile_path": creator.get("profile_path"),
                    "popularity": creator.get("popularity", 0),
                    "gender": creator.get("gender"),
                })
        if not raw_directors:
            raw_directors = [
                c for c in credits.get("crew", [])
                if c.get("job") in ("Director", "Creator", "Executive Producer")
            ][:2]
        raw_writers = [
            c for c in credits.get("crew", [])
            if c.get("job") in ("Writer", "Screenplay", "Story", "Teleplay")
        ][:2]

        director_ids = {d["id"] for d in raw_directors if d.get("id") is not None}
        writer_ids = {w["id"] for w in raw_writers if w.get("id") is not None}
        exclude_ids = director_ids | writer_ids
        raw_cast = [a for a in credits.get("cast", []) if a.get("id") not in exclude_ids][:10]

        trailer_key = _pick_trailer_key(tmdb_data, ui_lang, tmdb_data.get("original_language"))
        first_air_date = tmdb_data.get("first_air_date")
        year = None
        if first_air_date:
            try:
                year = int(first_air_date.split("-")[0])
            except Exception:
                year = None

        all_season_meta = sorted(tmdb_data.get("seasons", []), key=lambda x: x.get("season_number") or 0)
        season_numbers = [s.get("season_number") for s in all_season_meta if s.get("season_number") is not None]
        initial_seasons = [s for s in all_season_meta if s.get("season_number") is not None][:max(1, int(seasons_limit))]
        initial_season_numbers = [s.get("season_number") for s in initial_seasons if s.get("season_number") is not None]
        episode_states_map = _get_virtual_episode_states_map(db, series_tmdb_id_int, initial_season_numbers) if _has_virtual_episode_states(db, series_tmdb_id_int, initial_season_numbers) else {}

        initial_season_number_set = set(initial_season_numbers)
        seasons = []
        for season_meta in all_season_meta:
            season_number = season_meta.get("season_number")
            if season_number is None:
                continue
            if season_number in initial_season_number_set:
                visible_index = initial_season_numbers.index(season_number)
                episodes_limit = initial_episodes_limit if visible_index == 0 else 0
                season_payload = self._build_virtual_season_payload(
                    tmdb_client,
                    db,
                    series_tmdb_id_int,
                    season_meta,
                    ui_lang,
                    episode_states_map,
                    episodes_limit=episodes_limit,
                )
            else:
                season_payload = self._build_virtual_season_shell_payload(season_meta)
            if season_payload:
                seasons.append(season_payload)


        virtual_state, is_tracked = _get_virtual_media_state_with_tracking(db, series_tmdb_id_int, "tv")
        all_virtual_episodes = [
            episode
            for season in seasons
            if not _is_special_season(season)
            for episode in (season.get("episodes") or [])
            if isinstance(episode, dict)
        ]
        derived_series_watched = bool(all_virtual_episodes) and all(bool(episode.get("is_watched")) for episode in all_virtual_episodes)

        imdb_id = tmdb_data.get("external_ids", {}).get("imdb_id")
        omdb_data = omdb_client.get_ratings(imdb_id, queue_on_limit=True) if imdb_id else {}
        logo_path = _pick_logo_path(tmdb_data, ui_lang)
        backdrop_path = _pick_backdrop_path(tmdb_data, ui_lang)
        effective_logo_path = virtual_state.manual_logo_path if virtual_state and virtual_state.manual_logo_path else logo_path
        effective_backdrop_path = virtual_state.manual_backdrop_path if virtual_state and virtual_state.manual_backdrop_path else backdrop_path
        effective_poster_path = virtual_state.manual_poster_path if virtual_state and virtual_state.manual_poster_path else tmdb_data.get("poster_path")

        result = {
            "id": f"tmdb_{series_tmdb_id_int}",
            "series_tmdb_id": series_tmdb_id_int,
            "imdb_id": imdb_id,
            "title": tmdb_data.get("name") or tmdb_data.get("original_name") or "Unknown Series",
            "logo_path": self.formatter.resolve_logo_response_path(logo_path=effective_logo_path),
            "backdrop_path": self.formatter.resolve_image_response_path(effective_backdrop_path, subfolder="backdrops"),
            "poster_path": self.formatter.resolve_image_response_path(effective_poster_path, subfolder="posters"),
            "year": year,
            "first_air_date": tmdb_data.get("first_air_date"),
            "last_air_date": tmdb_data.get("last_air_date"),
            "release_status": tmdb_data.get("status"),
            "number_of_seasons": int(tmdb_data.get("number_of_seasons") or len([s for s in all_season_meta if int(s.get("season_number") or 0) > 0]) or 0),
            "number_of_episodes": int(tmdb_data.get("number_of_episodes") or sum(int(s.get("episode_count") or 0) for s in all_season_meta if int(s.get("season_number") or 0) > 0) or 0),
            "overview": tmdb_data.get("overview"),
            "rating_tmdb": tmdb_data.get("vote_average"),
            "rating_imdb": _parse_omdb_float(omdb_data.get("imdb_rating")),
            "vote_count_imdb": _parse_omdb_int(omdb_data.get("imdb_votes")),
            "rating_rotten": omdb_data.get("rotten_tomatoes"),
            "rating_meta": _parse_omdb_int(omdb_data.get("metascore")),
            "genres": _split_genres([g["name"] for g in tmdb_data.get("genres", [])]),
            "type": "tv",
            "cast": self._build_virtual_people_payload(raw_cast),
            "directors": self._build_virtual_people_payload(raw_directors),
            "writers": self._build_virtual_people_payload(raw_writers),
            "seasons": seasons,
            "season_numbers": season_numbers,
            "progressive_seasons": True,
            "companies": [{"name": c.get("name"), "logo_path": self.formatter.resolve_logo_response_path(logo_path=c.get("logo_path"))} for c in tmdb_data.get("production_companies", [])] if tmdb_data.get("production_companies") else [],
            "networks": [{"name": n.get("name"), "logo_path": self.formatter.resolve_logo_response_path(logo_path=n.get("logo_path"))} for n in tmdb_data.get("networks", [])] if tmdb_data.get("networks") else [],
            "is_adult": tmdb_data.get("adult", False),
            "is_favorite": bool(virtual_state.is_favorite) if virtual_state else False,
            "user_rating": virtual_state.user_rating if virtual_state else None,
            "user_comment": virtual_state.user_comment if virtual_state else None,
            "custom_tags": (virtual_state.custom_tags or []) if virtual_state else [],
            "is_tracked": is_tracked,
            "watch_count": 1 if ((virtual_state and virtual_state.is_watched) or derived_series_watched) else 0,
            "is_watched": bool(virtual_state.is_watched) if virtual_state else derived_series_watched,
            "resume_position": 0,
            "last_watched_at": None,
            "playback_logs": [],
            "trailer_key": trailer_key,
            "path": None,
            "in_library": False,
        }
        _annotate_series_availability(result)
        return result

    def _get_virtual_series_detail(self, db, series_tmdb_id_int, ui_lang, seasons_limit=5, initial_episodes_limit=4):
        tmdb_client = TMDBClient(db)
        tmdb_data = tmdb_client.get_details(series_tmdb_id_int, "series", language=ui_lang)
        if not tmdb_data:
            return JSONResponse(status_code=404, content={"error": "Series not found on TMDB"})
        result = self._build_virtual_series_shell(
            db,
            series_tmdb_id_int,
            ui_lang,
            tmdb_data,
            seasons_limit=seasons_limit,
            initial_episodes_limit=initial_episodes_limit,
        )
        return JSONResponse(content=result, media_type="application/json; charset=utf-8")

    def _get_virtual_series_season_detail(self, db, series_tmdb_id_int, ui_lang, season_number):
        tmdb_client = TMDBClient(db)
        tmdb_data = tmdb_client.get_details(series_tmdb_id_int, "series", language=ui_lang)
        if not tmdb_data:
            return JSONResponse(status_code=404, content={"error": "Series not found on TMDB"})
        season_meta = next((s for s in tmdb_data.get("seasons", []) if int(s.get("season_number") or -1) == int(season_number)), None)
        if not season_meta:
            return JSONResponse(status_code=404, content={"error": "Season not found"})
        episode_states_map = _get_virtual_episode_states_map(db, series_tmdb_id_int, [season_number]) if _has_virtual_episode_states(db, series_tmdb_id_int, [season_number]) else {}
        season_payload = self._build_virtual_season_payload(
            tmdb_client,
            db,
            series_tmdb_id_int,
            season_meta,
            ui_lang,
            episode_states_map,
            episodes_limit=None,
        )
        if not season_payload:
            return JSONResponse(status_code=404, content={"error": "Season not found"})
        return JSONResponse(content=season_payload, media_type="application/json; charset=utf-8")
