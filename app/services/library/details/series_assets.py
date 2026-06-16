import os
import logging
from app.db.models import ImageStatus

from app.utils.library_utils import (
    _download_media_assets_sync,
    _match_language_code,
    _public_image_path,
    _fetch_tv_season_detail,
)

logger = logging.getLogger(__name__)

class SeriesAssetsMixin:
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
