import logging
from pathlib import Path
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from sqlalchemy.orm import Session
from ..db.models import MediaItem, MediaMatch, MetadataLocalization, ItemStatus, ItemType, Person, ImageStatus
from ..resolver.resolver import Resolver
from ..api.omdb_client import OMDBClient
from ..utils.db_utils import with_db_retry
from ..services.person_service import PersonService
from ..services.collection_service import CollectionService
from ..schemas.tmdb import TMDBMovie, TMDBSeries, TMDBEpisode
from ..utils.library_utils import _pick_backdrop_path, _pick_logo_path, _pick_trailer_key, _split_genres

logger = logging.getLogger(__name__)


def _match_language_code(lang_a: Optional[str], lang_b: Optional[str]) -> bool:
    if not lang_a or not lang_b:
        return False
    a = str(lang_a).lower()
    b = str(lang_b).lower()
    return a == b or a.split("-")[0] == b.split("-")[0]

class MetadataEnrichmentService:
    """
    Orchestrates deep metadata gathering from remote sources (TMDB, OMDB).
    Populates local database with rich descriptions, cast members, and localized titles.
    """

    def __init__(self, db_session: Session):
        self.db = db_session
        self.resolver = Resolver(db_session)
        self.omdb = OMDBClient(db_session)
        self.person_service = PersonService(db_session)
        self.collection_service = CollectionService(db_session)

    @with_db_retry()
    def enrich_matched_item(self, item: MediaItem, language: str = "en", fallback_language: str = None):
        """Main entry point for enriching a matched item with all available metadata."""
        active_match = self.db.query(MediaMatch).filter(MediaMatch.media_item_id == item.id, MediaMatch.is_active == True).first()
        if not active_match: return

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

        for lang in unique_langs:
            if active_match.item_type == ItemType.MOVIE:
                self._enrich_movie(active_match, lang)
            elif active_match.item_type in [ItemType.SERIES, ItemType.EPISODE]:
                self._enrich_tv(active_match, lang)

        # Sync physical planned path with new metadata
        self._refresh_planned_path(item, active_match)
        self.db.commit()

    def _enrich_movie(self, match: MediaMatch, language: str):
        raw_data = self.resolver.api.get_details(match.tmdb_id, "movie", language=language)
        if not raw_data: return
        try:
            details = TMDBMovie(**raw_data)
        except Exception as e:
            logger.error(f"Failed to parse TMDBMovie: {e}")
            return

        # Update core match properties
        self._update_match_common(match, details, raw_data)
        match.is_adult = details.adult
        match.release_status = details.status
        match.budget = details.budget
        match.revenue = details.revenue
        if details.belongs_to_collection:
            collection = self.collection_service.upsert_from_tmdb(
                self.resolver.api,
                details.belongs_to_collection,
                language,
                is_primary=(language == (match.media_item.locale or language)),
            )
            match.collection = details.belongs_to_collection.name
            match.collection_tmdb_id = collection.tmdb_id if collection else None
        else:
            match.collection = None
            match.collection_tmdb_id = None
        
        match.companies = [{"name": c.name, "logo_path": c.logo_path} for c in details.production_companies]
        
        # Queue images
        selected_backdrop_path = _pick_backdrop_path(raw_data, language)
        if details.poster_path or _pick_logo_path(raw_data, language): match.image_status = ImageStatus.PENDING
        if selected_backdrop_path:
            match.backdrop_status = ImageStatus.PENDING
            match.backdrop_path = selected_backdrop_path
        
        # Update localization
        loc = self._get_or_create_loc(match, language)
        loc.title = details.title
        loc.overview = details.overview
        loc.tagline = details.tagline
        loc.poster_path = details.poster_path
        loc.logo_path = _pick_logo_path(raw_data, language)
        loc.genres = _split_genres([g.name for g in details.genres])
        loc.original_title = details.original_title
        loc.original_language = details.original_language
        
        # Extract trailer
        loc.trailer_url = _pick_trailer_key(raw_data, language, details.original_language)

    def _enrich_tv(self, match: MediaMatch, language: str):
        raw_data = self.resolver.api.get_details(match.tmdb_id, "tv", language=language)
        if not raw_data: return
        try:
            series = TMDBSeries(**raw_data)
        except Exception as e:
            logger.error(f"Failed to parse TMDBSeries: {e}")
            return

        self._update_match_common(match, series, raw_data)
        match.series_type = series.type
        match.number_of_seasons = series.number_of_seasons
        match.number_of_episodes = series.number_of_episodes
        match.networks = [{"name": n.name, "logo_path": n.logo_path} for n in series.networks]
        match.series_tmdb_id = match.tmdb_id
        match.first_air_date = datetime.combine(series.first_air_date, datetime.min.time()) if series.first_air_date else None
        match.last_air_date = datetime.combine(series.last_air_date, datetime.min.time()) if series.last_air_date else None
        
        # Queue images
        selected_backdrop_path = _pick_backdrop_path(raw_data, language)
        if series.poster_path or _pick_logo_path(raw_data, language): match.image_status = ImageStatus.PENDING
        if selected_backdrop_path:
            match.backdrop_status = ImageStatus.PENDING
            match.backdrop_path = selected_backdrop_path
        
        loc = self._get_or_create_loc(match, language)
        fallback_series_title = (
            series.name
            or series.original_name
            or loc.series_title
            or loc.original_series_title
            or loc.title
            or match.media_item.fn_title
            or match.media_item.fd_title
            or match.media_item.filename
            or f"Series {match.tmdb_id}"
        )
        loc.title = fallback_series_title
        loc.original_title = series.original_name or fallback_series_title
        loc.series_title = series.name or fallback_series_title
        loc.original_series_title = series.original_name
        loc.overview = series.overview
        loc.poster_path = series.poster_path
        loc.series_poster_path = series.poster_path
        loc.logo_path = _pick_logo_path(raw_data, language)
        loc.genres = _split_genres([g.name for g in series.genres])
        loc.origin_country = series.origin_country
        loc.original_language = series.original_language
        
        # Extract trailer
        loc.trailer_url = _pick_trailer_key(raw_data, language, series.original_language)

        effective_season = match.season_number
        effective_episode = match.episode_number
        media_item = match.media_item
        if media_item is not None:
            if effective_season is None:
                effective_season = media_item.fn_season or media_item.fd_season or media_item.it_season
            if effective_episode is None:
                effective_episode = media_item.fn_episode or media_item.fd_episode or media_item.it_episode

        if effective_season is not None:
            if match.season_number is None:
                match.season_number = effective_season
            if match.episode_number is None and effective_episode is not None:
                match.episode_number = effective_episode
            self._enrich_tv_hierarchy(match, series, language)

    def _enrich_tv_hierarchy(self, match: MediaMatch, series: TMDBSeries, language: str):
        """Enriches season and episode specific data."""
        loc = self._get_or_create_loc(match, language)
        
        # Season info
        # Note: raw data from TMDB for 'seasons' list is still used or we extend TMDBSeries DTO
        # For simplicity, we'll assume series DTO might need raw 'seasons' or we fetch via resolver
        # ... assuming we use a more robust series DTO here
        
        if match.episode_number is not None:
            ep_nums = match.episode_number if isinstance(match.episode_number, list) else [match.episode_number]
            titles, overviews, stills = [], [], []
            
            for enum in ep_nums:
                raw_ep = self.resolver.api.get_episode_details(match.tmdb_id, match.season_number, enum, language=language)
                ep = None
                if raw_ep:
                    try:
                        ep = TMDBEpisode(**raw_data) if 'raw_data' in locals() else TMDBEpisode(**raw_ep)
                    except Exception as e:
                        logger.error(f"Failed to parse TMDBEpisode: {e}")

                if ep:
                    titles.append(ep.name or f"Episode {enum}")
                    if ep.overview: overviews.append(ep.overview)
                    if ep.still_path: stills.append(ep.still_path)
                    
                    if enum == ep_nums[0]:
                        match.rating_tmdb = ep.vote_average
                        match.runtime = ep.runtime or match.runtime
                else:
                    titles.append(f"Episode {enum}")
            
            if titles:
                loc.episode_title = " / ".join(titles)
                loc.overview = "\n\n".join(overviews) if overviews else loc.overview
                match.still_path = stills[0] if stills else None
                if not loc.title:
                    loc.title = loc.series_title or loc.original_series_title or loc.episode_title

    def _update_match_common(self, match: MediaMatch, details: Union[TMDBMovie, TMDBSeries], raw_data: Dict[str, Any]):
        """Updates properties shared by both Movies and TV Shows."""
        if isinstance(details, TMDBMovie):
            match.runtime = details.runtime
            keywords_data = raw_data.get("keywords", {})
            keywords_list = []
            if isinstance(keywords_data, dict):
                kw_list = keywords_data.get("keywords")
                if isinstance(kw_list, list):
                    keywords_list = [kw.get("name") for kw in kw_list if isinstance(kw, dict) and kw.get("name")]
            match.keywords = keywords_list
        elif isinstance(details, TMDBSeries):
            match.runtime = details.episode_run_time[0] if details.episode_run_time else None
            keywords_data = raw_data.get("keywords", {})
            keywords_list = []
            if isinstance(keywords_data, dict):
                kw_list = keywords_data.get("results")
                if isinstance(kw_list, list):
                    keywords_list = [kw.get("name") for kw in kw_list if isinstance(kw, dict) and kw.get("name")]
            match.keywords = keywords_list
            
        match.popularity = details.popularity
        match.rating_tmdb = details.vote_average
        match.vote_count_tmdb = details.vote_count
        
        # For TV-derived matches we still sync the series-level OMDb ratings onto the match.
        imdb_id = getattr(details, 'imdb_id', None) or match.imdb_id
        if imdb_id:
            match.imdb_id = imdb_id
            if match.item_type in [ItemType.MOVIE, ItemType.SERIES, ItemType.SEASON, ItemType.EPISODE]:
                self._sync_omdb_ratings(match, imdb_id)
            
        # 3. People (Cast & Crew)
        if details.credits:
            self._process_people(match, details)

    def _process_people(self, match: MediaMatch, details: Union[TMDBMovie, TMDBSeries]):
        """Extracts and persists cast and crew information."""
        from ..schemas.tmdb import TMDBPerson
        
        if isinstance(details, TMDBSeries) and details.aggregate_credits and details.aggregate_credits.cast:
            cast = []
            for p in details.aggregate_credits.cast:
                char = p.roles[0].character if p.roles else None
                cast.append(TMDBPerson(
                    id=p.id,
                    name=p.name,
                    character=char,
                    profile_path=p.profile_path,
                    order=p.order,
                    gender=p.gender
                ))
            cast = cast[:20]
            crew = details.aggregate_credits.crew
        else:
            credits = details.credits
            cast = credits.cast[:20] if credits else []
            crew = credits.crew if credits else []
        
        # Determine directors/creators and writers
        creators = []
        writers = []
        if isinstance(details, TMDBMovie):
            creators = [p for p in crew if p.job == "Director"][:2]
            writers = [p for p in crew if p.job in ["Writer", "Screenplay", "Story", "Teleplay"]][:2]
        else:
            # Handle TV creators from 'created_by' or producers/directors/writers in crew
            creators = [p for p in crew if p.job in ["Executive Producer", "Director"]][:2]
            writers = [p for p in crew if p.job in ["Writer", "Screenplay", "Story", "Teleplay"]][:2]

        processed_ids = set()
        
        # 1. Process Directors/Creators
        for i, p in enumerate(creators):
            person = self.person_service.get_or_create_person(p.dict())
            self.person_service.link_person_to_match(match, person, job="Director" if isinstance(details, TMDBMovie) else "Creator")
            processed_ids.add(p.id)
            if i == 0: match.director = p.name

        # 2. Process Writers
        for p in writers:
            if p.id in processed_ids: continue
            person = self.person_service.get_or_create_person(p.dict())
            self.person_service.link_person_to_match(match, person, job="Writer")
            processed_ids.add(p.id)

        # 3. Process Top Cast
        for i, p in enumerate(cast):
            if p.id in processed_ids: continue
            person = self.person_service.get_or_create_person(p.dict())
            self.person_service.link_person_to_match(match, person, job="Actor", character=p.character, order=i)
            processed_ids.add(p.id)

    def _sync_omdb_ratings(self, match: MediaMatch, imdb_id: str):
        omdb = self.omdb.get_ratings(imdb_id, queue_on_limit=True)
        if not omdb: return
        try:
            match.rating_imdb = float(omdb["imdb_rating"]) if omdb.get("imdb_rating") != "N/A" else match.rating_imdb
            match.rating_rotten = omdb.get("rotten_tomatoes") or match.rating_rotten
            match.rating_meta = int(omdb["metascore"]) if omdb.get("metascore") != "N/A" else match.rating_meta
        except: pass

        loc = self.db.query(MetadataLocalization).filter(MetadataLocalization.match_id == match.id, MetadataLocalization.locale == language).first()
        if not loc:
            loc = MetadataLocalization(match_id=match.id, locale=language)
            self.db.add(loc)
        return loc
    def _refresh_planned_path(self, item: MediaItem, match: MediaMatch):
        from ..formatter.formatter import Formatter, FormatterConfig
        from ..db.models import UserSetting
        config = FormatterConfig.from_db(self.db)
        formatter = Formatter(config)
        
        target_lang = self.db.query(UserSetting).filter(UserSetting.key == "default_target_language").first()
        preferred_language = item.locale or (target_lang.value if target_lang else None)
        
        loc = None
        if preferred_language:
            db_localizations = self.db.query(MetadataLocalization).filter(MetadataLocalization.match_id == match.id).all()
            loc = next((l for l in db_localizations if _match_language_code(l.locale, preferred_language)), None)
        if not loc:
            primary_lang = self.db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
            primary_lang_val = primary_lang.value if primary_lang else "en"
            if match.localizations:
                loc = next((l for l in match.localizations if _match_language_code(l.locale, primary_lang_val)), None)
        if not loc and match.localizations:
            loc = next((l for l in match.localizations if l.is_primary), match.localizations[0])
            
        if loc:
            preview = formatter.format_item(item, match, loc)
            item.planned_path = str(preview.target_path).replace("\\", "/")
