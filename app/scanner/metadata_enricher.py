import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from ..db.models import MediaItem, MediaMatch, MetadataLocalization, ItemStatus, ItemType, ImageStatus
from ..api.tmdb_client import TMDBClient
from ..api.omdb_client import OMDBClient
from ..utils.logger import logger
from ..services.collection_service import CollectionService
from ..utils.library_utils import _pick_backdrop_path, _pick_logo_path, _pick_trailer_key, _split_genres

class MetadataEnricher:
    """
    TMDB and OMDb metadata enrichment: downloads the entire hierarchy and assessments.
    """

    def __init__(self, db_session: Session):
        self.db = db_session
        self.api = TMDBClient(db_session)
        self.omdb = OMDBClient(db_session)
        self.collection_service = CollectionService(db_session)
        self._details_cache: Dict[tuple[str, int, str], Dict[str, Any]] = {}
        self._episode_cache: Dict[tuple[int, int, int, str], Dict[str, Any]] = {}
        self._omdb_cache: Dict[str, Dict[str, Any]] = {}

    def enrich_matched_item(
        self,
        item: MediaItem,
        language: str = "en",
        fallback_language: str = None,
        include_ratings: bool = True,
        commit: bool = True,
    ):
        """
        Executes the complete metadata download for the active match.
        Forces the correct type based on the API response.
        Downloads localization for primary language, default target language, item target language, and fallback language.
        """
        active_match = self.db.query(MediaMatch).filter(
            MediaMatch.media_item_id == item.id,
            MediaMatch.is_active == True
        ).first()

        if not active_match: return

        # --- TYPE ENFORCEMENT (BASED ON API RESPONSE) ---
        # Only enforce the type if we don't already know the exact type (e.g., auto-match case)
        # If manually set (e.g., to SERIES), don't override to EPISODE.
        if active_match.confidence_score < 1.0 and active_match.item_type not in [ItemType.SERIES, ItemType.SEASON]:
            imdb_id = getattr(active_match, 'imdb_id', None) or item.nfo_imdb_id
            if imdb_id and imdb_id.startswith("tt"):
                find_res = self.api.find_by_imdb(imdb_id, language=language)
                if find_res and "item_type" in find_res:
                    api_type = find_res["item_type"]
                    actual_type = ItemType.MOVIE if api_type == "movie" else ItemType.EPISODE
                    
                    if active_match.item_type != actual_type:
                        logger.info(f"Correcting type for item {item.id} to {actual_type} based on API")
                        active_match.item_type = actual_type
                        item.item_type = actual_type
                        if actual_type == ItemType.EPISODE:
                            if active_match.season_number is None: active_match.season_number = 1
                            if active_match.episode_number is None: active_match.episode_number = 1

        # Load user settings for default languages
        from ..db.models import UserSetting
        pl = self.db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
        tl = self.db.query(UserSetting).filter(UserSetting.key == "default_target_language").first()
        fl = self.db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()

        # Build unique list of languages to enrich
        langs_to_enrich = []
        if language:
            langs_to_enrich.append(language)
        if pl and pl.value:
            langs_to_enrich.append(pl.value)
        if tl and tl.value:
            langs_to_enrich.append(tl.value)
        if item.locale:
            langs_to_enrich.append(item.locale)
        if fallback_language:
            langs_to_enrich.append(fallback_language)
        if fl and fl.value and fl.value != "none":
            langs_to_enrich.append(fl.value)

        # Deduplicate while preserving order
        unique_langs = []
        for l in langs_to_enrich:
            if l not in unique_langs:
                unique_langs.append(l)

        for idx, lang in enumerate(unique_langs):
            # Include ratings only for the first language (primary) to save API/processing time
            inc_rat = include_ratings if idx == 0 else False
            if active_match.item_type == ItemType.MOVIE:
                self._enrich_movie(active_match, lang, include_ratings=inc_rat)
            elif active_match.item_type == ItemType.SERIES or active_match.item_type == ItemType.EPISODE:
                self._enrich_tv(active_match, lang, include_ratings=inc_rat)

        # --- PLANNED PATH UPDATE (WITH OFFICIAL DATA) ---
        try:
            from ..formatter.formatter import Formatter, FormatterConfig
            from ..db.models import UserSetting
            from ..utils.library_utils import _match_language_code
            config = FormatterConfig.from_db(self.db)
            formatter = Formatter(config)
            
            target_lang = self.db.query(UserSetting).filter(UserSetting.key == "default_target_language").first()
            target_lang_val = (item.locale or (target_lang.value if target_lang else None) or "en")
            
            loc = next((l for l in active_match.localizations if _match_language_code(l.locale, target_lang_val)), None)
            if not loc:
                primary_lang = self.db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
                primary_lang_val = primary_lang.value if primary_lang else "en"
                loc = next((l for l in active_match.localizations if _match_language_code(l.locale, primary_lang_val)), None)
            if not loc and active_match.localizations:
                loc = next((l for l in active_match.localizations if l.is_primary), active_match.localizations[0])
                
            if loc:
                preview = formatter.format_item(item, active_match, loc)
                item.planned_path = preview.target_path
        except Exception as e:
            logger.error(f"Failed to update planned_path after enrichment: {e}")

        if commit:
            self.db.commit()

    def _enrich_movie(self, match: MediaMatch, language: str, include_ratings: bool = True):
        """Enrich movies."""
        details = self._get_details_cached(match.tmdb_id, "movie", language)
        if not details: return

        # 1. Global data
        self._update_match_common(match, details, include_ratings=include_ratings)
        match.is_adult = details.get("adult", False)
        match.release_status = details.get("status")  # Released, In Production, stb.
        match.budget = details.get("budget")
        match.revenue = details.get("revenue")
        # Collection
        coll = details.get("belongs_to_collection")
        if coll:
            collection = self.collection_service.upsert_from_tmdb(
                self.api,
                coll,
                language,
                is_primary=(language == ((match.media_item.locale if match.media_item else None) or language)),
            )
            match.collection = coll.get("name")
            match.collection_tmdb_id = collection.tmdb_id if collection else None
        else:
            match.collection = None
            match.collection_tmdb_id = None
        
        match.companies = [{"name": c["name"], "logo_path": c.get("logo_path")} for c in details.get("production_companies", [])]
        
        selected_backdrop_path = _pick_backdrop_path(details, language)
        if details.get("poster_path") or _pick_logo_path(details, language):
            match.image_status = ImageStatus.PENDING
        if selected_backdrop_path:
            match.backdrop_status = ImageStatus.PENDING
            match.backdrop_path = selected_backdrop_path

        # 2. Localization
        loc = self._get_or_create_loc(match, language)
        loc.title = details.get("title")
        loc.overview = details.get("overview")
        loc.tagline = details.get("tagline")
        loc.poster_path = details.get("poster_path")
        loc.logo_path = _pick_logo_path(details, language)
        loc.genres = _split_genres([g["name"] for g in details.get("genres", [])])
        loc.original_title = details.get("original_title")
        loc.original_language = details.get("original_language")

        # 3. Trailer
        loc.trailer_url = _pick_trailer_key(details, language, details.get("original_language"))

    def _enrich_tv(self, match: MediaMatch, language: str, include_ratings: bool = True):
        """Enrich series and episodes (Series -> Season -> Episode chain)."""
        # A. SERIES LEVEL
        series_details = self._get_details_cached(match.tmdb_id, "tv", language)
        if not series_details: return

        self._update_match_common(match, series_details, include_ratings=include_ratings)
        match.is_adult = series_details.get("adult", False)
        match.release_status = series_details.get("status")  # Ended, Returning Series, Canceled
        match.series_type = series_details.get("type")  # Scripted, Documentary, Miniseries, Reality
        match.number_of_seasons = series_details.get("number_of_seasons")
        match.number_of_episodes = series_details.get("number_of_episodes")
        match.networks = [{"name": n.get("name"), "logo_path": n.get("logo_path")} for n in series_details.get("networks", [])]
        match.series_tmdb_id = match.tmdb_id
        series_first_air_date = series_details.get("first_air_date")
        if series_first_air_date:
            try:
                match.first_air_date = datetime.strptime(series_first_air_date, "%Y-%m-%d")
            except Exception:
                pass
        series_last_air_date = series_details.get("last_air_date")
        if series_last_air_date:
            try:
                match.last_air_date = datetime.strptime(series_last_air_date, "%Y-%m-%d")
            except Exception:
                pass
 
        selected_backdrop_path = _pick_backdrop_path(series_details, language)
        if series_details.get("poster_path") or _pick_logo_path(series_details, language):
            match.image_status = ImageStatus.PENDING
        if selected_backdrop_path:
            match.backdrop_status = ImageStatus.PENDING
            match.backdrop_path = selected_backdrop_path
        
        loc = self._get_or_create_loc(match, language)
        loc.title = series_details.get("name")
        loc.original_title = series_details.get("original_name")
        loc.series_title = series_details.get("name")
        loc.original_series_title = series_details.get("original_name")
        loc.overview = series_details.get("overview")
        loc.series_poster_path = series_details.get("poster_path") # Main series poster
        loc.poster_path = series_details.get("poster_path") # Default (ha nincs szezon poszter)
        loc.logo_path = _pick_logo_path(series_details, language)
        loc.genres = _split_genres([g["name"] for g in series_details.get("genres", [])])
        loc.origin_country = series_details.get("origin_country")
        loc.original_language = series_details.get("original_language")

        # Trailer
        loc.trailer_url = _pick_trailer_key(series_details, language, series_details.get("original_language"))

        # B. SEASON LEVEL (If a season number is available)
        if match.season_number is not None:
            seasons = series_details.get("seasons", [])
            season_data = next((s for s in seasons if s.get("season_number") is not None and int(s.get("season_number")) == int(match.season_number)), None)
            
            if season_data:
                loc.season_title = season_data.get("name")
                loc.overview = season_data.get("overview") or loc.overview
                match.season_tmdb_id = season_data.get("id")
                match.episode_count = season_data.get("episode_count")
                # Season air date
                s_date = season_data.get("air_date")
                if s_date:
                    try:
                        from datetime import datetime
                        match.season_air_date = datetime.strptime(s_date, "%Y-%m-%d")
                    except: pass
                
                # If there is a season poster, it will be used as the primary poster
                if season_data.get("poster_path"):
                    loc.poster_path = season_data.get("poster_path")

        # C. EPISODE LEVEL (If an episode number is available)
        if match.season_number is not None and match.episode_number is not None:
            # Handle files that consist of multiple episodes (e.g., S01E01-02)
            ep_nums = []
            raw_ep = match.episode_number
            
            if isinstance(raw_ep, list):
                ep_nums = raw_ep
            elif isinstance(raw_ep, str) and "[" in raw_ep:
                # Handling Guessit string representation: "[1, 2]" -> [1, 2]
                try:
                    import ast
                    parsed = ast.literal_eval(raw_ep)
                    if isinstance(parsed, list):
                        ep_nums = parsed
                    else:
                        ep_nums = [parsed]
                except:
                    ep_nums = [raw_ep]
            else:
                ep_nums = [raw_ep]

            titles = []
            overviews = []
            all_stills = []
            first_still = None
            first_air_date = None
            
            for ename in ep_nums:
                try:
                    ep_details = self._get_episode_details_cached(
                        match.tmdb_id, match.season_number, ename, language=language
                    )
                    if ep_details:
                        titles.append(ep_details.get("name") or f"Episode {ename}")
                        if ep_details.get("overview"):
                            overviews.append(ep_details.get("overview"))
                        
                        s_path = ep_details.get("still_path")
                        if s_path:
                            all_stills.append(s_path)
                            if not first_still:
                                  first_still = s_path
                                
                        if not first_air_date:
                            first_air_date = ep_details.get("air_date")
                            
                        # Set basic data based on the first episode
                        if ename == ep_nums[0]:
                            match.rating_tmdb = ep_details.get("vote_average")
                            match.vote_count_tmdb = ep_details.get("vote_count")
                            match.runtime = ep_details.get("runtime") or match.runtime
                            
                            # IMDb ID for the first
                except Exception as e:
                    logger.warning(f"Failed to fetch metadata for episode {ename}: {e}")

            if titles:
                loc.episode_title = " / ".join(titles)
                match.still_path = first_still
                match.all_stills = all_stills
                if overviews:
                    loc.overview = "\n\n".join(overviews)
                
                if first_air_date:
                    try:
                        from datetime import datetime
                        match.episode_air_date = datetime.strptime(first_air_date, "%Y-%m-%d")
                    except: pass
                
                # Set the number of episodes
                match.episode_count = len(ep_nums)

    def _update_match_common(self, match: MediaMatch, details: Dict[str, Any], include_ratings: bool = True):
        """Update common data (runtime, ratings, people)."""
        runtimes = details.get("episode_run_time", [])
        match.runtime = details.get("runtime") or (runtimes[0] if runtimes else None)
        
        keywords_data = details.get("keywords", {})
        keywords_list = []
        if isinstance(keywords_data, dict):
            kw_list = keywords_data.get("keywords") if match.item_type == ItemType.MOVIE else keywords_data.get("results")
            if isinstance(kw_list, list):
                keywords_list = [kw.get("name") for kw in kw_list if isinstance(kw, dict) and kw.get("name")]
        match.keywords = keywords_list

        match.popularity = details.get("popularity")
        match.rating_tmdb = details.get("vote_average")
        match.vote_count_tmdb = details.get("vote_count")
        release_date = details.get("release_date")
        if release_date:
            try:
                match.release_date = datetime.strptime(release_date, "%Y-%m-%d")
            except Exception:
                pass
        first_air_date = details.get("first_air_date")
        if first_air_date:
            try:
                match.first_air_date = datetime.strptime(first_air_date, "%Y-%m-%d")
            except Exception:
                pass
        
        # IMDb ID (Series/Movie level)
        ext_ids = details.get("external_ids", {})
        imdb_id = ext_ids.get("imdb_id") or match.imdb_id
        match.imdb_id = imdb_id

        # Languages and Countries
        match.original_language = details.get("original_language")
        match.origin_country = details.get("origin_country")
        spoken = details.get("spoken_languages", [])
        if spoken:
            match.spoken_languages = [s["iso_639_1"] for s in spoken]

        # OMDb Ratings
        if include_ratings and imdb_id:
            self._update_omdb_ratings(match, imdb_id)

        # PEOPLE PROCESSING
        self._process_people(match, details)

    def _update_omdb_ratings(self, match: MediaMatch, imdb_id: str):
        """Fetches and updates the OMDb ratings."""
        omdb_data = self._get_omdb_ratings_cached(imdb_id)
        if omdb_data:
            try:
                val = omdb_data["imdb_rating"]
                match.rating_imdb = float(val) if val and val != "N/A" else match.rating_imdb
            except: pass
            
            try:
                votes_str = omdb_data["imdb_votes"].replace(",", "")
                match.vote_count_imdb = int(votes_str) if votes_str and votes_str != "N/A" else match.vote_count_imdb
            except: pass
            
            match.rating_rotten = omdb_data["rotten_tomatoes"] or match.rating_rotten
            try:
                m_val = omdb_data["metascore"]
                match.rating_meta = int(m_val) if m_val and m_val != "N/A" else match.rating_meta
            except: pass

    def _process_people(self, match: MediaMatch, details: Dict[str, Any]):
        """Fetches and links the cast and crew members."""
        from ..db.models import Person, MediaPersonLink
        
        credits = details.get("aggregate_credits", {}) if match.item_type != ItemType.MOVIE else details.get("credits", {})
        if not credits or not credits.get("cast"):
            credits = details.get("credits", {})
            
        cast = credits.get("cast", [])[:20] # Top 20 actors
        crew = credits.get("crew", [])
        
        # 1. Directors / Producers
        creators = []
        if match.item_type == ItemType.MOVIE:
            creators = [p for p in crew if p.get("job") == "Director"][:2]
        else:
            # For series, look for 'created_by'
            creators = details.get("created_by", [])
            # If no created_by, then look for producers or directors in the crew
            if not creators:
                for p in crew:
                    if "jobs" in p:
                        if any(j.get("job") in ["Executive Producer", "Director"] for j in p["jobs"] if isinstance(j, dict)):
                            creators.append(p)
                    elif p.get("job") in ["Executive Producer", "Director"]:
                        creators.append(p)
            creators = creators[:2]

        # Save and Link
        processed_people = [] # IDs to avoid duplication within an element
        
        # A. Directors / Producers processing
        for i, p in enumerate(creators[:2]):
            person = self._get_or_create_person(p)
            self._link_person(match, person, job="Director" if match.item_type == ItemType.MOVIE else "Creator")
            processed_people.append(p.get("id"))
            if i == 0: match.director = p.get("name")

        # B. Actors processing
        for i, p in enumerate(cast):
            if p["id"] in processed_people: continue
            person = self._get_or_create_person(p)
            char = p.get("roles", [{}])[0].get("character") if "roles" in p else p.get("character")
            self._link_person(match, person, job="Actor", character=char, order=i)
            processed_people.append(p["id"])

        # C. Writers processing
        writers = []
        for p in crew:
            if "jobs" in p:
                if any(j.get("job") in ["Writer", "Screenplay", "Story", "Teleplay"] for j in p["jobs"] if isinstance(j, dict)):
                    writers.append(p)
            elif p.get("job") in ["Writer", "Screenplay", "Story", "Teleplay"]:
                writers.append(p)
        for p in writers[:2]:
            if p.get("id") in processed_people: continue
            person = self._get_or_create_person(p)
            self._link_person(match, person, job="Writer")
            processed_people.append(p.get("id"))

    def _get_or_create_person(self, p_data: Dict[str, Any]) -> "Person":
        from ..db.models import Person, PersonLocalization
        from sqlalchemy.exc import IntegrityError
        
        tmdb_id = p_data["id"]
        person = self.db.query(Person).filter(Person.id == tmdb_id).first()
        if person:
            if person.gender is None and p_data.get("gender") is not None:
                person.gender = p_data.get("gender")
            return person
            
        try:
            # Use nested transaction (SAVEPOINT) to handle race conditions gracefully
            with self.db.begin_nested():
                person = Person(
                    id=tmdb_id,
                    popularity=p_data.get("popularity"),
                    profile_path=p_data.get("profile_path"),
                    gender=p_data.get("gender")
                )
                self.db.add(person)
                loc = PersonLocalization(person_id=tmdb_id, locale="en", name=p_data.get("name", "Unknown"))
                self.db.add(loc)
                self.db.flush() # Trigger uniqueness check NOW
            return person
        except IntegrityError:
            # The nested transaction (SAVEPOINT) has already been rolled back by the context manager.
            # We simply fetch the existing person created by another thread.
            return self.db.query(Person).filter(Person.id == tmdb_id).first()

    def _link_person(self, match: MediaMatch, person: "Person", job: str, character: str = None, order: int = 0):
        from ..db.models import MediaPersonLink
        from sqlalchemy.exc import IntegrityError
        
        link = self.db.query(MediaPersonLink).filter(
            MediaPersonLink.media_match_id == match.id,
            MediaPersonLink.person_id == person.id,
            MediaPersonLink.job == job
        ).first()
        
        if not link:
            try:
                with self.db.begin_nested():
                    link = MediaPersonLink(
                        media_match_id=match.id,
                        person_id=person.id,
                        job=job,
                        character_name=character,
                        order=order
                    )
                    self.db.add(link)
                    self.db.flush()
            except IntegrityError:
                # Nested transaction rollback is automatic.
                pass # Already linked by another thread/process

    def _get_or_create_loc(self, match: MediaMatch, language: str) -> MetadataLocalization:
        """Fetch or create a localization object."""
        loc = self.db.query(MetadataLocalization).filter(
            MetadataLocalization.match_id == match.id,
            MetadataLocalization.locale == language
        ).first()
        if not loc:
            loc = MetadataLocalization(match_id=match.id, locale=language)
            self.db.add(loc)
        return loc

    def _get_details_cached(self, tmdb_id: int, item_type: str, language: str) -> Dict[str, Any]:
        cache_key = (item_type, tmdb_id, language)
        if cache_key not in self._details_cache:
            try:
                self._details_cache[cache_key] = self.api.get_details(tmdb_id, item_type=item_type, language=language) or {}
            except Exception as e:
                logger.error(f"Failed to fetch details for {item_type} {tmdb_id}: {e}")
                self._details_cache[cache_key] = {}
        return self._details_cache[cache_key]

    def _get_episode_details_cached(self, series_id: int, season_number: int, episode_number: int, language: str) -> Dict[str, Any]:
        cache_key = (series_id, season_number, episode_number, language)
        if cache_key not in self._episode_cache:
            try:
                self._episode_cache[cache_key] = self.api.get_episode_details(
                    series_id,
                    season_number,
                    episode_number,
                    language=language,
                ) or {}
            except Exception as e:
                logger.error(f"Failed to fetch episode details for TV {series_id} S{season_number}E{episode_number}: {e}")
                self._episode_cache[cache_key] = {}
        return self._episode_cache[cache_key]

    def _get_omdb_ratings_cached(self, imdb_id: str) -> Dict[str, Any]:
        if imdb_id not in self._omdb_cache:
            self._omdb_cache[imdb_id] = self.omdb.get_ratings(imdb_id, queue_on_limit=True) or {}
        return self._omdb_cache[imdb_id]
