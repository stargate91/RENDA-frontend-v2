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
    def _parse_series_tmdb_id(self, series_tmdb_id: str):
        if isinstance(series_tmdb_id, str) and (series_tmdb_id.startswith("tmdb_") or series_tmdb_id.startswith("series_")):
            try:
                return int(series_tmdb_id.split("_")[1])
            except (ValueError, IndexError):
                return None
        try:
            return int(series_tmdb_id)
        except (TypeError, ValueError):
            return None

    def _load_series_context(self, series_tmdb_id: str):
        from sqlalchemy import or_

        db = self.db
        series_tmdb_id_int = self._parse_series_tmdb_id(series_tmdb_id)
        if series_tmdb_id_int is None:
            return None, None, None, None

        tmdb_cache = _pick_tmdb_cache(
            db,
            series_tmdb_id_int,
            "tv",
            _preferred_metadata_languages(db),
        )
        cached_series = tmdb_cache.raw_data if tmdb_cache else {}
        cached_seasons = {s.get("season_number"): s for s in cached_series.get("seasons", [])}
        ui_lang = _preferred_metadata_language(db)

        items = db.query(MediaItem).join(MediaItem.matches).options(
            joinedload(MediaItem.matches).joinedload(MediaMatch.localizations),
            joinedload(MediaItem.matches).joinedload(MediaMatch.people).joinedload(MediaPersonLink.person),
            joinedload(MediaItem.extras),
        ).filter(
            or_(
                MediaMatch.series_tmdb_id == series_tmdb_id_int,
                MediaMatch.tmdb_id == series_tmdb_id_int,
            ),
            MediaMatch.is_active == True,
            MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
        ).all()
        return series_tmdb_id_int, ui_lang, cached_series, cached_seasons, items

    def get_library_series_detail(self, series_tmdb_id: str, seasons_limit: int = 5, initial_episodes_limit: int = 4):
        """Returns comprehensive detail data for a full series, including seasons and episodes."""
        db = self.db
        try:
            loaded = self._load_series_context(series_tmdb_id)
            if not loaded or loaded[0] is None:
                return JSONResponse(status_code=400, content={"error": "Invalid series TMDB ID"})

            series_tmdb_id_int, ui_lang, cached_series, cached_seasons, items = loaded

            if not items:
                return self._get_virtual_series_detail(
                    db,
                    series_tmdb_id_int,
                    ui_lang,
                    seasons_limit=seasons_limit,
                    initial_episodes_limit=initial_episodes_limit,
                )
            return self._get_physical_series_detail(db, series_tmdb_id, series_tmdb_id_int, ui_lang, items, cached_seasons, cached_series)

        except Exception as e:
            import traceback
            logger.error(f"Error getting series detail: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)

    def get_library_series_season_detail(self, series_tmdb_id: str, season_number: int):
        db = self.db
        try:
            loaded = self._load_series_context(series_tmdb_id)
            if not loaded or loaded[0] is None:
                return JSONResponse(status_code=400, content={"error": "Invalid series TMDB ID"})

            series_tmdb_id_int, ui_lang, cached_series, cached_seasons, items = loaded
            if items:
                return self._get_physical_series_season_detail(
                    db,
                    series_tmdb_id,
                    series_tmdb_id_int,
                    ui_lang,
                    items,
                    cached_seasons,
                    cached_series,
                    season_number,
                )
            return self._get_virtual_series_season_detail(db, series_tmdb_id_int, ui_lang, season_number)
        except Exception as e:
            import traceback
            logger.error(f"Error getting series season detail: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)
