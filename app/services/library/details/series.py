from app.services.library.details.base import BaseDetailProvider
from fastapi.responses import JSONResponse
import logging
from sqlalchemy.orm import joinedload
from app.utils.library_utils import (
    _preferred_metadata_language,
    _pick_tmdb_cache,
    _preferred_metadata_languages,
)
from app.db.models import ItemStatus, MediaItem, MediaMatch, MediaPersonLink

from app.services.library.details.series_virtual import SeriesVirtualMixin
from app.services.library.details.series_physical import SeriesPhysicalMixin

logger = logging.getLogger(__name__)

class SeriesDetailProvider(BaseDetailProvider, SeriesVirtualMixin, SeriesPhysicalMixin):
    def get_library_series_detail(self, series_tmdb_id: str):
        """Returns comprehensive detail data for a full series, including seasons and episodes."""
        db = self.db
        try:
            from sqlalchemy import or_
        
            # Parse virtual/real tmdb_id
            if isinstance(series_tmdb_id, str) and (series_tmdb_id.startswith("tmdb_") or series_tmdb_id.startswith("series_")):
                try:
                    series_tmdb_id_int = int(series_tmdb_id.split("_")[1])
                except (ValueError, IndexError):
                    return JSONResponse(status_code=400, content={"error": "Invalid series TMDB ID"})
            else:
                try:
                    series_tmdb_id_int = int(series_tmdb_id)
                except ValueError:
                    return JSONResponse(status_code=400, content={"error": "Invalid series TMDB ID"})
                
            # Try to fetch full series metadata from cache
            tmdb_cache = _pick_tmdb_cache(
                db,
                series_tmdb_id_int,
                "tv",
                _preferred_metadata_languages(db),
            )
            cached_series = tmdb_cache.raw_data if tmdb_cache else {}
            cached_seasons = {s.get("season_number"): s for s in cached_series.get("seasons", [])}
            ui_lang = _preferred_metadata_language(db)
        
            # Find all episodes for this series
            items = db.query(MediaItem).join(MediaItem.matches).options(
                joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
                joinedload(MediaItem.matches).joinedload(MediaMatch.people).joinedload(MediaPersonLink.person),
                joinedload(MediaItem.extras),
            ).filter(
                or_(
                    MediaMatch.series_tmdb_id == series_tmdb_id_int,
                    MediaMatch.tmdb_id == series_tmdb_id_int
                ),
                MediaMatch.is_active == True,
                MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
            ).all()

            if not items:
                return self._get_virtual_series_detail(db, series_tmdb_id_int, ui_lang)
            else:
                return self._get_physical_series_detail(db, series_tmdb_id, series_tmdb_id_int, ui_lang, items, cached_seasons, cached_series)

        except Exception as e:
            import traceback
            logger.error(f"Error getting series detail: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)
