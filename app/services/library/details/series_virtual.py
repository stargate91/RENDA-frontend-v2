from fastapi.responses import JSONResponse
from app.api.tmdb_client import TMDBClient
from app.api.omdb_client import OMDBClient

from app.utils.library_utils import (
    _download_media_assets_sync,
    _preferred_metadata_language,
    _parse_omdb_float,
    _parse_omdb_int,
    _ensure_person_cached,
    _get_virtual_episode_state,
    _get_virtual_media_state,
    _is_virtual_media_tracked,
    _pick_backdrop_path,
    _pick_logo_path,
    _pick_trailer_key,
    _preferred_metadata_languages,
    _fetch_tv_season_detail,
    _split_genres,
)

from app.services.library.details.series_helpers import (
    _annotate_season_availability,
    _annotate_series_availability,
    _is_special_season,
)

class SeriesVirtualMixin:
    def _get_virtual_series_detail(self, db, series_tmdb_id_int, ui_lang):
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
        raw_writers = [
            c for c in credits.get("crew", [])
            if c.get("job") in ("Writer", "Screenplay", "Story", "Teleplay")
        ][:2]
        for crew in raw_writers:
            if crew.get("profile_path"):
                cast_profiles.append(crew.get("profile_path"))
            
        director_ids = {d["id"] for d in raw_directors}
        writer_ids = {w["id"] for w in raw_writers}
        exclude_ids = director_ids | writer_ids
        raw_cast = [a for a in credits.get("cast", []) if a.get("id") not in exclude_ids][:10]
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

        _annotate_season_availability(seasons_list)

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
                "popularity": crew.get("popularity", 0),
                "gender": crew.get("gender")
            })

        writers = []
        for crew in raw_writers:
            profile_path = _ensure_person_cached(
                db,
                crew.get("id"),
                crew.get("name"),
                crew.get("profile_path"),
                crew.get("popularity", 0),
                ui_lang
            )
            writers.append({
                "id": crew.get("id"),
                "name": crew.get("name"),
                "job": crew.get("job"),
                "profile_path": profile_path,
                "popularity": crew.get("popularity", 0),
                "gender": crew.get("gender")
            })

        director_ids = {d["id"] for d in directors}
        writer_ids = {w["id"] for w in writers}
        exclude_ids = director_ids | writer_ids
        raw_cast = [a for a in credits.get("cast", []) if a.get("id") not in exclude_ids][:10]
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
                "popularity": actor.get("popularity", 0),
                "gender": actor.get("gender")
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
            if not _is_special_season(season)
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
            "writers": writers,
            "seasons": seasons_list,
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
            "in_library": False
        }
        _annotate_series_availability(result)
        return JSONResponse(content=result, media_type="application/json; charset=utf-8")
