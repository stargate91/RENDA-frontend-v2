import requests
import re
import time
import logging
from typing import Dict, Any, List, Optional
from time import sleep
from urllib.parse import parse_qs, urlsplit
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session
from ..db.models import TMDBCache, ItemType, UserSetting
from datetime import datetime

class TMDBClient:
    """
    TMDB API Client with built-in cache.
    """
    BASE_URL = "https://api.themoviedb.org/3"

    def __init__(self, db_session: Session):
        self.db = db_session
        self._api_key = self._get_api_key()

    def _get_api_key(self) -> str:
        """Retrieves the API key from the settings."""
        setting = self.db.query(UserSetting).filter(UserSetting.key == "tmdb_api_key").first()
        return setting.value if setting else ""

    def _generate_cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        """Generates a unique key for the request based on endpoint and parameters."""
        # Remove api_key from params to keep cache clean and portable
        p = params.copy()
        p.pop('api_key', None)
        sorted_params = sorted(p.items())
        param_str = "&".join(f"{k}={v}" for k, v in sorted_params)
        return f"{endpoint}?{param_str}"

    def _get_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Retrieves non-expired cache from the database."""
        from datetime import datetime, timedelta
        from ..db.base import CacheSession
        
        # Check cache using dedicated session
        cache_db = CacheSession()
        try:
            cache_item = cache_db.query(TMDBCache).filter(TMDBCache.cache_key == cache_key).first()
            if cache_item:
                # Dynamic cache expiration based on request endpoint
                is_dynamic = "trending" in cache_key or "discover" in cache_key
                expire_days = 1 if is_dynamic else 30
                
                if datetime.utcnow() - cache_item.updated_at < timedelta(days=expire_days):
                    return cache_item.raw_data
        finally:
            CacheSession.remove()
        return None

    def _cache_language_from_request(self, cache_key: str, params: Optional[Dict[str, Any]] = None) -> str:
        requested = None
        if params:
            requested = params.get("language")
        if not requested and isinstance(cache_key, str):
            try:
                parsed = urlsplit(cache_key)
                requested = (parse_qs(parsed.query).get("language") or [None])[0]
            except Exception:
                requested = None
        return str(requested or "en")

    def _set_cache(self, cache_key: str, data: Dict[str, Any], params: Optional[Dict[str, Any]] = None):
        """Stores API response in the persistent cache."""
        from ..db.base import CacheSession
        target_language = self._cache_language_from_request(cache_key, params)
        cache_db = CacheSession()
        try:
            for attempt in range(3):
                try:
                    # Manual upsert so the code keeps working across the app's regular
                    # SQLAlchemy sessions and remains tolerant of parallel resolvers.
                    cache_item = cache_db.query(TMDBCache).filter(TMDBCache.cache_key == cache_key).first()
                    if not cache_item:
                        cache_item = TMDBCache(cache_key=cache_key)
                        cache_db.add(cache_item)

                    cache_item.raw_data = data
                    cache_item.tmdb_id = data.get('id') if isinstance(data, dict) else None
                    cache_item.locale = target_language
                    cache_item.updated_at = datetime.utcnow()
                    cache_db.commit()
                    return
                except IntegrityError:
                    cache_db.rollback()
                    try:
                        cache_item = cache_db.query(TMDBCache).filter(TMDBCache.cache_key == cache_key).first()
                        if cache_item:
                            cache_item.raw_data = data
                            cache_item.tmdb_id = data.get('id') if isinstance(data, dict) else None
                            cache_item.locale = target_language
                            cache_item.updated_at = datetime.utcnow()
                            cache_db.commit()
                            return
                    except Exception:
                        cache_db.rollback()
                except OperationalError:
                    cache_db.rollback()
                    sleep(0.15 * (attempt + 1))
                except Exception:
                    cache_db.rollback()
                    # We don't want cache failures to break the app.
                    return
        finally:
            CacheSession.remove()

    def _call_api(self, endpoint: str, params: Dict[str, Any], max_retries: int = 3) -> Dict[str, Any]:
        """
        Central API caller with Caching and Rate Limit (429) handling.
        """
        logger = logging.getLogger("renda")
        
        # Ensure API key
        if 'api_key' not in params:
            params['api_key'] = self._api_key

        # 1. Check Cache
        cache_key = self._generate_cache_key(endpoint, params)
        cached_data = self._get_cache(cache_key)
        if cached_data:
            return cached_data

        # 2. Network Request
        url = self.BASE_URL + endpoint
        for attempt in range(max_retries):
            try:
                response = requests.get(url, params=params, timeout=15)
                
                if response.status_code == 200:
                    data = response.json()
                    self._set_cache(cache_key, data, params)
                    return data
                
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 1))
                    logger.warning(f"TMDB Rate Limit (429). Waiting {retry_after}s...")
                    time.sleep(retry_after)
                    continue
                
                response.raise_for_status()
                
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"TMDB API Error ({endpoint}): {e}")
                    raise e
                time.sleep(2 ** attempt)
        
        raise RuntimeError(f"TMDB API request failed for {endpoint}")

    def search(self, query: str, item_type: str = "movie", year: Optional[int] = None, language: Optional[str] = None, include_adult: bool = False, page: int = 1) -> List[Dict[str, Any]]:
        """Search TMDB (Movie or TV Show). Language is optional and only affects localized fields in results."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")
        if not query:
            return []

        endpoint = "/search/movie" if item_type == "movie" else "/search/tv"
        params = {
            "api_key": self._api_key,
            "query": query,
            "include_adult": "true" if include_adult else "false",
            "page": max(1, int(page or 1)),
        }
        if language:
            params["language"] = language
        if year:
            key = "primary_release_year" if item_type == "movie" else "first_air_date_year"
            params[key] = year

        data = self._call_api(endpoint, params)
        return data.get("results", [])

    def search_person(self, query: str, language: str = "en-US", include_adult: bool = False, page: int = 1) -> List[Dict[str, Any]]:
        """Search for people (actors/directors) on TMDB."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")
        if not query:
            return []

        endpoint = "/search/person"
        params = {
            "api_key": self._api_key,
            "query": query,
            "language": language,
            "include_adult": "true" if include_adult else "false",
            "page": max(1, int(page or 1)),
        }
        data = self._call_api(endpoint, params)
        return data.get("results", [])

    def find_by_imdb(self, imdb_id: str, language: str = "en-US") -> Optional[Dict[str, Any]]:
        """Find a movie or TV show by its IMDb ID."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")
        if not imdb_id:
            return None

        params = {
            "api_key": self._api_key,
            "external_source": "imdb_id",
            "language": language
        }
        data = self._call_api(f"/find/{imdb_id}", params)
        
        movies = data.get("movie_results", [])
        tv = data.get("tv_results", [])
        
        if movies: return {**movies[0], "item_type": "movie"}
        if tv: return {**tv[0], "item_type": "series"}
        return None

    def get_details(self, tmdb_id: int, item_type: str, language: str = "en-US") -> Dict[str, Any]:
        """Retrieve detailed information about a movie or TV show."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")

        if item_type == "movie":
            endpoint = f"/movie/{tmdb_id}"
            append = "credits,external_ids,images,translations,videos,keywords"
        else:
            endpoint = f"/tv/{tmdb_id}"
            append = "credits,aggregate_credits,external_ids,images,translations,videos,keywords"

        normalized_lang = str(language or "en").split("-", 1)[0].strip() or "en"
        include_image_language = ",".join(dict.fromkeys([normalized_lang, "en", "null"]))
        include_video_language = ",".join(dict.fromkeys([normalized_lang, "en", "null"]))

        params = {
            "api_key": self._api_key,
            "language": language,
            "append_to_response": append,
            "include_image_language": include_image_language,
            "include_video_language": include_video_language,
        }
        return self._call_api(endpoint, params)

    def get_episode_details(self, series_id: int, season_number: int, episode_number: int, language: str = "en-US") -> Dict[str, Any]:
        """Retrieve details for a specific episode."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")

        endpoint = f"/tv/{series_id}/season/{season_number}/episode/{episode_number}"
        params = {
            "api_key": self._api_key,
            "language": language,
            "append_to_response": "credits,external_ids,images,translations,videos"
        }
        return self._call_api(endpoint, params)

    def get_season_details(self, series_id: int, season_number: int, language: str = "en-US") -> Dict[str, Any]:
        """Retrieve details for a specific season."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")

        endpoint = f"/tv/{series_id}/season/{season_number}"
        normalized_lang = str(language or "en").split("-", 1)[0].strip() or "en"
        include_image_language = ",".join(dict.fromkeys([normalized_lang, "en", "null"]))
        params = {
            "api_key": self._api_key,
            "language": language,
            "append_to_response": "external_ids,videos,images",
            "include_image_language": include_image_language,
        }
        return self._call_api(endpoint, params)

    def get_person_images(self, person_id: int) -> Dict[str, Any]:
        """Retrieve all available profile pictures for a person."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")
        
        endpoint = f"/person/{person_id}/images"
        params = {"api_key": self._api_key}
        return self._call_api(endpoint, params)

    def get_person_details(self, person_id: int, language: str = "en-US") -> Dict[str, Any]:
        """Retrieve detailed information about a person."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")
        
        endpoint = f"/person/{person_id}"
        params = {
            "api_key": self._api_key,
            "language": language,
            "append_to_response": "images,translations,external_ids,combined_credits"
        }
        return self._call_api(endpoint, params)

    def get_trending(self, media_type: str = "all", time_window: str = "day", language: str = "en-US") -> List[Dict[str, Any]]:
        """Retrieve the daily/weekly trending movies or TV shows."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")
        
        endpoint = f"/trending/{media_type}/{time_window}"
        params = {
            "api_key": self._api_key,
            "language": language
        }
        data = self._call_api(endpoint, params)
        return data.get("results", [])

    def discover(self, media_type: str = "movie", with_genres: Optional[str] = None, language: str = "en-US", page: int = 1) -> List[Dict[str, Any]]:
        """Retrieve movies or TV shows based on various filters (e.g., genre)."""
        if not self._api_key:
            raise ValueError("TMDB API key is missing")

        endpoint = f"/discover/{media_type}"
        params = {
            "api_key": self._api_key,
            "language": language,
            "page": page,
            "sort_by": "popularity.desc"
        }
        if with_genres:
            params["with_genres"] = with_genres

        data = self._call_api(endpoint, params)
        return data.get("results", [])
