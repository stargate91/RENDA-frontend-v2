import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import requests
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db.models import OMDBCache, OMDBRequestQueue, UserSetting

logger = logging.getLogger(__name__)


class OMDBRateLimitError(Exception):
    def __init__(self, message: str, retry_at: Optional[datetime] = None):
        super().__init__(message)
        self.retry_at = retry_at


class OMDBClient:
    """OMDb client for IMDb, Rotten Tomatoes, and Metacritic ratings."""

    BASE_URL = "http://www.omdbapi.com/"
    _auth_failure_until: Optional[datetime] = None
    _auth_failure_key: str = ""
    _auth_failure_logged: bool = False

    def __init__(self, db_session: Session):
        self.db = db_session
        self._api_key = self._get_api_key()

    def _get_api_key(self) -> str:
        setting = self.db.query(UserSetting).filter(UserSetting.key == "omdb_api_key").first()
        return setting.value if setting else ""

    def get_ratings(
        self,
        imdb_id: str,
        queue_on_limit: bool = False,
        raise_on_limit: bool = False,
        allow_stale_fallback: bool = True,
    ) -> Dict[str, Any]:
        if not self._api_key or not imdb_id:
            return {}

        if (
            self.__class__._auth_failure_until
            and self.__class__._auth_failure_key == self._api_key
            and datetime.utcnow() < self.__class__._auth_failure_until
        ):
            return {}

        cache_item = self.db.query(OMDBCache).filter(OMDBCache.imdb_id == imdb_id).first()
        cached_data = cache_item.raw_data if cache_item else None
        if cache_item and datetime.utcnow() - cache_item.updated_at < timedelta(days=30):
            return cache_item.raw_data

        params = {
            "apikey": self._api_key,
            "i": imdb_id,
            "plot": "short",
        }

        try:
            response = requests.get(self.BASE_URL, params=params, timeout=15)
            if response.status_code == 401:
                self._mark_auth_failure()
                if allow_stale_fallback:
                    return cached_data or {}
                return {}
            response.raise_for_status()
            data = response.json()

            if data.get("Response") == "False":
                error_message = data.get("Error") or "Unknown OMDb error"
                if self._is_auth_error(error_message):
                    self._mark_auth_failure(error_message)
                    if allow_stale_fallback:
                        return cached_data or {}
                    return {}
                if self._is_rate_limit_error(error_message):
                    retry_at = self.next_daily_retry_at()
                    if queue_on_limit:
                        self.enqueue_rating_request(imdb_id, status="rate_limited", error=error_message, next_retry_at=retry_at)
                    if raise_on_limit:
                        raise OMDBRateLimitError(error_message, retry_at=retry_at)
                    if allow_stale_fallback:
                        return cached_data or {}
                    return {}

                logger.warning(f"OMDb error for {imdb_id}: {error_message}")
                if allow_stale_fallback:
                    return cached_data or {}
                return {}

            ratings = {
                "imdb_rating": data.get("imdbRating"),
                "imdb_votes": data.get("imdbVotes"),
                "metascore": data.get("Metascore"),
                "rotten_tomatoes": None,
            }

            for rating in data.get("Ratings", []):
                if rating.get("Source") == "Rotten Tomatoes":
                    ratings["rotten_tomatoes"] = rating.get("Value")

            existing_cache = self.db.query(OMDBCache).filter(OMDBCache.imdb_id == imdb_id).first()
            if existing_cache:
                existing_cache.raw_data = ratings
                existing_cache.updated_at = datetime.utcnow()
                self.db.commit()
            else:
                new_cache = OMDBCache(imdb_id=imdb_id, raw_data=ratings)
                self.db.add(new_cache)
                try:
                    self.db.commit()
                except IntegrityError:
                    self.db.rollback()
                    existing_cache = self.db.query(OMDBCache).filter(OMDBCache.imdb_id == imdb_id).first()
                    if existing_cache:
                        existing_cache.raw_data = ratings
                        existing_cache.updated_at = datetime.utcnow()
                        self.db.commit()

            queue_item = self.db.query(OMDBRequestQueue).filter(OMDBRequestQueue.imdb_id == imdb_id).first()
            if queue_item:
                queue_item.status = "completed"
                queue_item.last_error = None
                queue_item.next_retry_at = None
                self.db.commit()

            return ratings
        except Exception as ex:
            self.db.rollback()
            if isinstance(ex, OMDBRateLimitError):
                raise

            err_msg = str(ex)
            if "10054" in err_msg or isinstance(ex, ConnectionResetError):
                err_msg = "Connection reset by peer (WSAECONNRESET / 10054)"

            if queue_on_limit:
                self.enqueue_rating_request(
                    imdb_id,
                    status="pending",
                    error=err_msg,
                    next_retry_at=datetime.utcnow() + timedelta(hours=1),
                )
            logger.error(f"OMDb API error ({imdb_id}): {err_msg}")
            if allow_stale_fallback:
                return cached_data or {}
            return {}

    def _mark_auth_failure(self, error_message: Optional[str] = None) -> None:
        self.__class__._auth_failure_until = datetime.utcnow() + timedelta(minutes=30)
        self.__class__._auth_failure_key = self._api_key
        if self.__class__._auth_failure_logged:
            return
        self.__class__._auth_failure_logged = True
        logger.error(
            "OMDb authentication failed. Disable repeated OMDb calls for 30 minutes. "
            "Check Settings > API keys and replace the OMDb key.%s",
            f" Details: {error_message}" if error_message else "",
        )

    def enqueue_rating_request(
        self,
        imdb_id: str,
        status: str = "pending",
        error: Optional[str] = None,
        next_retry_at: Optional[datetime] = None,
        priority: int = 100,
    ) -> None:
        if not imdb_id:
            return

        queue_item = self.db.query(OMDBRequestQueue).filter(OMDBRequestQueue.imdb_id == imdb_id).first()
        if not queue_item:
            queue_item = OMDBRequestQueue(imdb_id=imdb_id, priority=priority)
            self.db.add(queue_item)

        queue_item.status = status
        queue_item.last_error = error[:500] if error else None
        queue_item.next_retry_at = next_retry_at
        queue_item.priority = max(queue_item.priority or 0, priority)

        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()

    @staticmethod
    def _is_rate_limit_error(error_message: str) -> bool:
        lowered = (error_message or "").lower()
        return "limit" in lowered and ("request" in lowered or "daily" in lowered)

    @staticmethod
    def _is_auth_error(error_message: str) -> bool:
        lowered = (error_message or "").lower()
        return "invalid api key" in lowered or "unauthorized" in lowered

    @staticmethod
    def next_daily_retry_at() -> datetime:
        tomorrow = datetime.utcnow().date() + timedelta(days=1)
        return datetime.combine(tomorrow, datetime.min.time()) + timedelta(minutes=15)
