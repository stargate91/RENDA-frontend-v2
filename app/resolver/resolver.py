import re
import unicodedata
from typing import List, Dict, Any, Set
from datetime import datetime
from sqlalchemy.orm import Session, backref
from ..db.models import MediaItem, MediaMatch, MetadataLocalization, ItemStatus, ItemType
from ..api.tmdb_client import TMDBClient
from ..services.resolve_status import determine_resolved_media_shape

class Resolver:
    """
    A "Bíró", aki eldönti, hogy egy MediaItem melyik TMDB találatnak felel meg.
    """

    def __init__(self, db_session: Session):
        self.db = db_session
        self.api = TMDBClient(db_session)

    def propagate_match(self, source_item: MediaItem):
        """
        Átmásolja az aktív találatot az azonos group_hash-el rendelkező többi fájlra.
        """
        if not source_item.group_hash:
            return

        active_match = next((m for m in source_item.matches if m.is_active), None)
        if not active_match:
            return

        # Find other files with the same hash
        siblings = self.db.query(MediaItem).filter(
            MediaItem.group_hash == source_item.group_hash,
            MediaItem.id != source_item.id
        ).all()

        for sib in siblings:
            # Delete old matches for it as well
            self.db.query(MediaMatch).filter(MediaMatch.media_item_id == sib.id).delete()
            
            # Create new match (copy from active)
            new_match = MediaMatch(
                media_item_id=sib.id,
                tmdb_id=active_match.tmdb_id,
                series_tmdb_id=active_match.series_tmdb_id,
                item_type=active_match.item_type,
                # Important: uses its own episode/season numbers if available!
                season_number=sib.fn_season or sib.fd_season or active_match.season_number,
                episode_number=sib.fn_episode or sib.fd_episode or active_match.episode_number,
                release_date=active_match.release_date,
                first_air_date=active_match.first_air_date,
                confidence_score=active_match.confidence_score,
                is_active=True,
                rating_tmdb=active_match.rating_tmdb,
                vote_count_tmdb=active_match.vote_count_tmdb
            )
            self.db.add(new_match)
            self.db.flush()

            # Copy localized data as well
            for loc in active_match.localizations:
                new_loc = MetadataLocalization(
                    match_id=new_match.id,
                    target_language=loc.target_language,
                    title=loc.title,
                    original_title=loc.original_title,
                    series_title=loc.series_title,
                    original_series_title=loc.original_series_title,
                    season_title=loc.season_title,
                    episode_title=loc.episode_title,
                    overview=loc.overview,
                    poster_path=loc.poster_path,
                    backdrop_path=loc.backdrop_path
                )
                self.db.add(new_loc)
            
            _, sib_status = determine_resolved_media_shape(
                ItemType.MOVIE if new_match.item_type == ItemType.MOVIE else "tv",
                new_match.season_number,
                new_match.episode_number
            )
            sib.status = sib_status
        
        self.db.commit()

    def _sanitize_query(self, query: str) -> str:
        """
        Eltávolítja a maradék sallangokat, amiket a Guessit esetleg benne hagyott.
        (Pl. Mini-Series, Complete)
        """
        if not query: return ""
        
        # Only the most essential cleanup
        clean_query = query
        
        # Remove specific keywords
        for word in ["Mini-Series", "Complete", "Season"]:
            clean_query = re.sub(rf"\b{word}\b", "", clean_query, flags=re.IGNORECASE)
            
        # Clean up double spaces
        return " ".join(clean_query.split()).strip()

    @staticmethod
    def _normalize_title(value: str) -> str:
        if not value:
            return ""
        normalized = unicodedata.normalize("NFKD", str(value))
        normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
        return re.sub(r"[^a-z0-9]", "", normalized.lower())

    @staticmethod
    def _normalize_title_words(value: str) -> str:
        if not value:
            return ""
        normalized = unicodedata.normalize("NFKD", str(value))
        normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
        return " ".join(re.findall(r"[a-z0-9]+", normalized.lower()))

    def _collect_candidate_titles(self, candidate: Dict[str, Any], details: Dict[str, Any] | None = None) -> Set[str]:
        titles: Set[str] = set()
        for key in ("title", "name", "original_title", "original_name"):
            value = candidate.get(key)
            if value:
                titles.add(str(value))

        if not details:
            return titles

        alt_titles_data = details.get("alternative_titles", {}).get("results", []) or details.get("alternative_titles", {}).get("titles", [])
        if isinstance(alt_titles_data, list):
            for alt in alt_titles_data:
                if not isinstance(alt, dict):
                    continue
                for key in ("title", "name"):
                    value = alt.get(key)
                    if value:
                        titles.add(str(value))

        translations = details.get("translations", {}).get("translations", [])
        if isinstance(translations, list):
            for trans in translations:
                if not isinstance(trans, dict):
                    continue
                t_data = trans.get("data", {}) or {}
                for key in ("title", "name"):
                    value = t_data.get(key)
                    if value:
                        titles.add(str(value))

        return titles

    def _title_match_rank(self, parsed_title: str, candidate_titles: Set[str]) -> int:
        normalized_query = self._normalize_title(parsed_title)
        normalized_query_words = self._normalize_title_words(parsed_title)
        if not normalized_query:
            return 0

        candidate_norms = {self._normalize_title(title) for title in candidate_titles if title}
        if normalized_query in candidate_norms:
            return 3

        candidate_word_norms = {self._normalize_title_words(title) for title in candidate_titles if title}
        if normalized_query_words and normalized_query_words in candidate_word_norms:
            return 2

        for title in candidate_titles:
            candidate_word_value = self._normalize_title_words(title)
            if normalized_query_words and candidate_word_value.startswith(f"{normalized_query_words} "):
                return 1

        # Fallback for minor variations (e.g. "Hachiko A Dogs Story" vs "Hachi: A Dog's Tale")
        import difflib
        for title in candidate_titles:
            if not title:
                continue
            normalized_candidate = self._normalize_title(title)
            if not normalized_candidate:
                continue
            if difflib.SequenceMatcher(None, normalized_query, normalized_candidate).ratio() >= 0.6:
                return 1

        return 0

    def _candidate_noise_penalty(self, parsed_title: str, candidate_titles: Set[str]) -> int:
        if not candidate_titles:
            return 0

        parsed_words = self._normalize_title_words(parsed_title)
        combined_titles = " ".join(self._normalize_title_words(title) for title in candidate_titles if title)
        if not combined_titles:
            return 0

        if any(keyword in parsed_words for keyword in ("making of", "behind the scenes", "featurette", "special presentation", "documentary")):
            return 0

        noisy_keywords = (
            "making of",
            "behind the scenes",
            "featurette",
            "special presentation",
            "presentation",
            "documentary",
            "interview",
            "retrospective",
        )
        return 1 if any(keyword in combined_titles for keyword in noisy_keywords) else 0

    def resolve_item(self, item: MediaItem, language: str = "en"):
        """
        Végrehajtja a hármas keresést és elmenti a jelölteket.
        """
        candidates: Dict[int, Dict[str, Any]] = {} # tmdb_id -> raw_data

        # Get include_adult setting
        include_adult_setting = self.db.query(UserSetting).filter(UserSetting.key == "include_adult").first()
        include_adult = False
        if include_adult_setting:
            value = include_adult_setting.value
            include_adult = value.lower() == "true" if isinstance(value, str) else bool(value)

        # Validate season-based support for series
        def filter_by_season_support(tv_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            target_season = item.fn_season or item.fd_season or item.it_season
            if not target_season:
                return tv_results
            
            valid = []
            for res in tv_results:
                res_id = res.get("id")
                if not res_id: continue
                # Details TMDB call (cached)
                details = self.api.get_details(res_id, "tv", language=language)
                if details:
                    num_seasons = details.get("number_of_seasons") or 0
                    if num_seasons >= target_season:
                        valid.append(res)
                    else:
                        from ..utils.logger import logger
                        logger.info(f"Skipping TV series candidate '{res.get('name') or res.get('original_name')}' (ID: {res_id}) because it only has {num_seasons} seasons, but file has season {target_season}")
                else:
                    # If no details (e.g. API error), keep for safety reasons
                    valid.append(res)
            return valid

        # 1. Source: IMDb ID (Source of Truth)
        if item.nfo_imdb_id:
            res = self.api.find_by_imdb(item.nfo_imdb_id, language=language)
            if res:
                # Validate that the IMDb result actually matches one of our parsed titles
                tmdb_type = "tv" if res.get("item_type") in ("tv", "series") else "movie"
                details = None
                try:
                    details = self.api.get_details(res["id"], tmdb_type, language=language)
                except Exception:
                    pass
                candidate_titles = self._collect_candidate_titles(res, details)
                
                match_found = False
                for t in [item.fn_title, item.it_title, item.fd_title]:
                    if t and self._title_match_rank(t, candidate_titles) > 0:
                        match_found = True
                        break
                
                if match_found:
                    if res.get("item_type") in ("tv", "series"):
                        res_list = filter_by_season_support([res])
                        if res_list:
                            self._add_candidate(candidates, res, source_priority=100)
                    else:
                        self._add_candidate(candidates, res, source_priority=100)
                else:
                    from ..utils.logger import logger
                    logger.warning(
                        f"NFO IMDb ID {item.nfo_imdb_id} resolved to '{res.get('title') or res.get('name')}', "
                        f"which does not match filename '{item.fn_title}', internal title '{item.it_title}', "
                        f"or folder name '{item.fd_title}'. Discarding NFO ID and falling back to search."
                    )

        # 2. Source: Triple Guessit Search (if we don't have a 100% match yet)
        if not candidates:
            search_tasks = [
                ("fn", item.fn_title, item.fn_year, 30),
                ("fd", item.fd_title, item.fd_year, 20),
                ("it", item.it_title, item.it_year, 10)
            ]
            
            for _source, title, year, source_priority in search_tasks:
                if not title: continue
                
                # If it looks like a movie, but Guessit found an episode/part, 
                # it is probably part of the title (e.g., 28 Weeks Later, Apollo 11)
                # Ideally this should be handled in ScannerManager, 
                # but we give it a chance in Resolver too.
                # Note: we are currently using the already existing title here.
                
                clean_title = self._sanitize_query(title)
                if not clean_title: continue

                tmdb_type = "tv" if item.item_type in (ItemType.SERIES, ItemType.EPISODE) else "movie"
                results = self.api.search(clean_title, item_type=tmdb_type, year=year, language=language, include_adult=include_adult)
                if tmdb_type == "tv":
                    results = filter_by_season_support(results)
                
                # FALLBACK 1: If no match with year, try without it
                if not results and year:
                    results = self.api.search(clean_title, item_type=tmdb_type, year=None, language=language, include_adult=include_adult)
                    if tmdb_type == "tv":
                        results = filter_by_season_support(results)
                
                # FALLBACK 2: If still no match, and there is a suspicious number group derived from a fraction at the end of the title (e.g., '2 12' -> '2')
                if not results:
                    fallback_match = re.search(r'^(.*\b\d+)\s+\d+$', clean_title)
                    if fallback_match:
                        fallback_title = fallback_match.group(1).strip()
                        results = self.api.search(fallback_title, item_type=tmdb_type, year=year, language=language, include_adult=include_adult)
                        if tmdb_type == "tv":
                            results = filter_by_season_support(results)
                        if not results and year:
                            results = self.api.search(fallback_title, item_type=tmdb_type, year=None, language=language, include_adult=include_adult)
                            if tmdb_type == "tv":
                                results = filter_by_season_support(results)
                
                for res in results:
                    res["item_type"] = tmdb_type
                    self._add_candidate(candidates, res, source_priority=source_priority)

        # 3. Save matches to the database
        self._save_matches(item, candidates, language)

    def _add_candidate(self, candidates: Dict[int, Dict[str, Any]], res: Dict[str, Any], source_priority: int = 0):
        """Adds a candidate with deduplication."""
        tmdb_id = res.get("id")
        if not tmdb_id:
            return

        existing = candidates.get(tmdb_id)
        if not existing:
            candidate = dict(res)
            candidate["_source_priority"] = source_priority
            candidates[tmdb_id] = candidate
            return

        existing["_source_priority"] = max(existing.get("_source_priority", 0), source_priority)

    def _save_matches(self, item: MediaItem, candidates: Dict[int, Dict[str, Any]], language: str):
        """Saves candidates (max 15) and updates item status."""
        # Delete old matches
        self.db.query(MediaMatch).filter(MediaMatch.media_item_id == item.id).delete()
        
        if not candidates:
            item.status = ItemStatus.NO_MATCH
            item.planned_path = None
            self.db.commit()
            return

        target_year = item.fn_year or item.fd_year or item.it_year
        parsed_title = item.fn_title or item.fd_title or item.it_title
        details_cache: Dict[int, Dict[str, Any] | None] = {}
        candidate_titles_cache: Dict[int, Set[str]] = {}
        title_rank_cache: Dict[int, int] = {}

        def get_candidate_details(tmdb_id: int, item_type: ItemType):
            if tmdb_id not in details_cache:
                details_cache[tmdb_id] = self.api.get_details(
                    tmdb_id,
                    "tv" if item_type == ItemType.SERIES else "movie",
                    language=language,
                )
            return details_cache[tmdb_id]

        def get_candidate_titles(candidate: Dict[str, Any], item_type: ItemType) -> Set[str]:
            tmdb_id = candidate.get("id")
            if not tmdb_id:
                return set()
            if tmdb_id not in candidate_titles_cache:
                candidate_titles_cache[tmdb_id] = self._collect_candidate_titles(
                    candidate,
                    get_candidate_details(tmdb_id, item_type),
                )
            return candidate_titles_cache[tmdb_id]

        def get_title_rank(candidate: Dict[str, Any], item_type: ItemType) -> int:
            tmdb_id = candidate.get("id")
            if not tmdb_id:
                return 0
            if tmdb_id not in title_rank_cache:
                title_rank_cache[tmdb_id] = self._title_match_rank(parsed_title, get_candidate_titles(candidate, item_type))
            return title_rank_cache[tmdb_id]

        def get_candidate_score(x):
            source_priority = x.get("_source_priority", 0)
            date_str = x.get("release_date") or x.get("first_air_date")
            year_match = 0
            raw_type = x.get("item_type") or x.get("media_type", "movie")
            candidate_type = ItemType.SERIES if raw_type in ["series", "tv"] else ItemType.MOVIE
            title_rank = get_title_rank(x, candidate_type)
            noise_penalty = self._candidate_noise_penalty(parsed_title, get_candidate_titles(x, candidate_type))
            if target_year and date_str:
                try:
                    c_year = int(date_str.split("-")[0])
                    if abs(c_year - target_year) <= 1:
                        year_match = 1
                except:
                    pass
            return (title_rank, source_priority, year_match, -noise_penalty)

        # Sort: only by year match (+-1 year)
        sorted_candidates = sorted(candidates.values(), key=get_candidate_score, reverse=True)
        
        # Limit to 15
        limited_candidates = sorted_candidates[:15]
        match_count = len(limited_candidates)
        
        top_candidate_score = get_candidate_score(limited_candidates[0]) if limited_candidates else None
        top_score_candidates = 0
        if top_candidate_score:
            top_score_candidates = sum(
                1 for candidate in limited_candidates if get_candidate_score(candidate) == top_candidate_score
            )

        for i, data in enumerate(limited_candidates):
            tmdb_id = data.get("id")
            
            # Extract dates
            date_str = data.get("release_date") or data.get("first_air_date")
            release_date = None
            if date_str:
                try:
                    release_date = datetime.strptime(date_str, "%Y-%m-%d")
                except:
                    pass
            last_air_date = None
            last_air_date_str = data.get("last_air_date")
            if last_air_date_str:
                try:
                    last_air_date = datetime.strptime(last_air_date_str, "%Y-%m-%d")
                except:
                    pass

            raw_type = data.get("item_type") or data.get("media_type", "movie")
            itype = ItemType.SERIES if raw_type in ["series", "tv"] else ItemType.MOVIE
            
            match = MediaMatch(
                media_item_id=item.id,
                tmdb_id=tmdb_id,
                series_tmdb_id=tmdb_id if itype == ItemType.SERIES else None,
                item_type=itype,
                season_number=item.fn_season or item.fd_season or item.it_season,
                episode_number=item.fn_episode or item.fd_episode or item.it_episode,
                release_date=release_date if itype == ItemType.MOVIE else None,
                first_air_date=release_date if itype == ItemType.SERIES else None,
                last_air_date=last_air_date if itype == ItemType.SERIES else None,
                confidence_score=1.0,
                rating_tmdb=data.get("vote_average"),
                vote_count_tmdb=data.get("vote_count")
            )
            
            # First match (most popular) becomes active (by default)
            if i == 0:
                target_year = item.fn_year or item.fd_year or item.it_year
                match_year = release_date.year if release_date else None
                source_priority = data.get("_source_priority", 0)
                
                has_season = bool(item.fn_season or item.fd_season or item.it_season)
                has_episode_num = bool(item.fn_episode or item.fd_episode or item.it_episode)
                
                is_exact_title = get_title_rank(data, itype) >= 3
                cleaned_parsed = self._normalize_title(parsed_title)

                ambiguous_exact_candidates = 0
                if cleaned_parsed and target_year:
                    for candidate in limited_candidates:
                        if candidate.get("_source_priority", 0) != source_priority:
                            continue

                        candidate_raw_type = candidate.get("item_type") or candidate.get("media_type", "movie")
                        candidate_item_type = ItemType.SERIES if candidate_raw_type in ["series", "tv"] else ItemType.MOVIE
                        if get_title_rank(candidate, candidate_item_type) < 3:
                            continue

                        candidate_date = candidate.get("release_date") or candidate.get("first_air_date")
                        if not candidate_date:
                            continue

                        try:
                            candidate_year = int(str(candidate_date).split("-")[0])
                        except Exception:
                            continue

                        if abs(candidate_year - target_year) <= 1:
                            ambiguous_exact_candidates += 1
                
                # Criterion 1: If series, but season OR episode number is missing -> UNCERTAIN
                if item.item_type in (ItemType.SERIES, ItemType.EPISODE) and (not has_season or not has_episode_num):
                    item.status = ItemStatus.UNCERTAIN
                    match.is_active = True
                    item.planned_path = None
                    
                # New criterion: If title EXACTLY matches (ignoring punctuation)
                # For series: if S/E is present -> MATCHED (avoids uncertainty due to fake year and multiple matches)
                # For movies: if title exactly matches, it is also MATCHED!
                elif source_priority <= 10 and match_count > 1:
                    item.status = ItemStatus.MULTIPLE
                    match.is_active = False
                    item.planned_path = None

                elif item.item_type == ItemType.MOVIE and top_score_candidates > 1:
                    item.status = ItemStatus.MULTIPLE
                    match.is_active = False
                    item.planned_path = None

                elif ambiguous_exact_candidates > 1:
                    item.status = ItemStatus.MULTIPLE
                    match.is_active = False
                    item.planned_path = None

                elif is_exact_title and (item.item_type not in (ItemType.SERIES, ItemType.EPISODE) or (has_season and has_episode_num)):
                    item.status = ItemStatus.MATCHED
                    match.is_active = True
                    
                # 2. We have a year, and the first match's year also matches (+- 1 year)
                elif target_year and match_year and abs(target_year - match_year) <= 1:
                    item.status = ItemStatus.MATCHED
                    match.is_active = True
                
                # 3. We have a year, but the first match's year differs
                elif target_year and match_year and abs(target_year - match_year) > 1:
                    item.status = ItemStatus.UNCERTAIN
                    match.is_active = True
                    item.planned_path = None
                    
                # 4. We have no year, but TMDB gave multiple matches
                elif not target_year and match_count > 1:
                    item.status = ItemStatus.MULTIPLE
                    match.is_active = False  # NO active match for multiple
                    item.planned_path = None # Clear any planned path
                    
                # 5. No year, but only 1 match returned (clear match)
                else:
                    item.status = ItemStatus.MATCHED
                    match.is_active = True
            
            self.db.add(match)
            self.db.flush()

            # Localized data (from basic search response)
            loc = MetadataLocalization(
                match_id=match.id,
                target_language=language,
                title=data.get("title") or data.get("name"),
                overview=data.get("overview"),
                poster_path=data.get("poster_path"),
                backdrop_path=data.get("backdrop_path")
            )
            self.db.add(loc)

        self.db.commit()
