from datetime import datetime, timedelta

from app.api.omdb_client import OMDBClient, OMDBRateLimitError
from app.db.models import ItemType, MediaMatch, OMDBRequestQueue
from app.utils.logger import logger


class OMDBQueueService:
    """Processes deferred OMDb rating requests and applies results to local matches."""

    def __init__(self, db):
        self.db = db
        self.omdb = OMDBClient(db)

    def process_pending(self, max_items: int = 25) -> int:
        now = datetime.utcnow()
        jobs = self.db.query(OMDBRequestQueue).filter(
            OMDBRequestQueue.status.in_(["pending", "rate_limited"]),
            ((OMDBRequestQueue.next_retry_at == None) | (OMDBRequestQueue.next_retry_at <= now))
        ).order_by(
            OMDBRequestQueue.priority.desc(),
            OMDBRequestQueue.updated_at.asc()
        ).limit(max_items).all()

        processed = 0
        for job in jobs:
            try:
                job.status = "processing"
                job.last_attempt_at = now
                job.retry_count = (job.retry_count or 0) + 1
                self.db.commit()

                ratings = self.omdb.get_ratings(
                    job.imdb_id,
                    raise_on_limit=True,
                    queue_on_limit=False,
                    allow_stale_fallback=False,
                )
                if not ratings:
                    self._reschedule_job(job.imdb_id, "Empty OMDb response")
                    continue

                self._apply_ratings_to_matches(job.imdb_id, ratings)

                job.status = "completed"
                job.last_error = None
                job.next_retry_at = None
                self.db.commit()
                processed += 1
            except OMDBRateLimitError as rate_limit_ex:
                retry_at = rate_limit_ex.retry_at or self.omdb.next_daily_retry_at()
                self._defer_all_pending(retry_at, str(rate_limit_ex))
                break
            except Exception as ex:
                self.db.rollback()
                self._reschedule_job(job.imdb_id, str(ex))
                logger.error(f"OMDb queue processing failed for {job.imdb_id}: {ex}")

        return processed

    def _apply_ratings_to_matches(self, imdb_id: str, ratings: dict) -> None:
        matches = self.db.query(MediaMatch).filter(
            MediaMatch.imdb_id == imdb_id,
            MediaMatch.item_type.in_([ItemType.MOVIE, ItemType.SERIES, ItemType.SEASON, ItemType.EPISODE])
        ).all()

        imdb_rating = self._parse_float(ratings.get("imdb_rating"))
        imdb_votes = self._parse_int(ratings.get("imdb_votes"))
        meta_rating = self._parse_int(ratings.get("metascore"))
        rotten = ratings.get("rotten_tomatoes")

        updated = False
        for match in matches:
            if imdb_rating is not None:
                match.rating_imdb = imdb_rating
            if imdb_votes is not None:
                match.vote_count_imdb = imdb_votes
            if meta_rating is not None:
                match.rating_meta = meta_rating
            if rotten not in (None, "", "N/A"):
                match.rating_rotten = rotten
            updated = True

        if updated:
            self.db.commit()

    def _defer_all_pending(self, retry_at: datetime, error: str) -> None:
        self.db.rollback()
        self.db.query(OMDBRequestQueue).filter(
            OMDBRequestQueue.status.in_(["pending", "processing", "rate_limited"])
        ).update({
            "status": "rate_limited",
            "last_error": error[:500],
            "next_retry_at": retry_at,
        }, synchronize_session=False)
        self.db.commit()

    def _reschedule_job(self, imdb_id: str, error: str) -> None:
        job = self.db.query(OMDBRequestQueue).filter(OMDBRequestQueue.imdb_id == imdb_id).first()
        if not job:
            return

        backoff_hours = min(12, max(1, 2 ** max(0, (job.retry_count or 1) - 1)))
        job.status = "failed" if (job.retry_count or 0) >= 5 else "pending"
        job.last_error = error[:500]
        job.next_retry_at = None if job.status == "failed" else (datetime.utcnow() + timedelta(hours=backoff_hours))
        self.db.commit()

    @staticmethod
    def _parse_float(value):
        if value in (None, "", "N/A"):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _parse_int(value):
        if value in (None, "", "N/A"):
            return None
        try:
            return int(str(value).replace(",", ""))
        except (TypeError, ValueError):
            return None
