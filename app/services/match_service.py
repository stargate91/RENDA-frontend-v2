import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.db.deletion import delete_media_matches_for_items
from ..db.models import MediaItem, MediaMatch, MetadataLocalization, ItemStatus, ItemType, ImageStatus
from .resolve_status import determine_resolved_media_shape

logger = logging.getLogger(__name__)

class MatchService:
    """
    Handles persistence and synchronization of MediaMatch records.
    Supports match propagation across identical files (hash-based sync).
    """

    def __init__(self, db: Session):
        self.db = db

    def save_candidates(self, item: MediaItem, candidates: List[Dict[str, Any]], language: str):
        """Saves a list of match candidates and updates primary match status."""
        # Clear old matches
        delete_media_matches_for_items(self.db, [item.id])
        
        if not candidates:
            item.status = ItemStatus.NO_MATCH
            return

        # Limit to top 15 results
        for i, data in enumerate(candidates[:15]):
            match = self._create_match(item, data, is_active=(i == 0))
            self.db.add(match)
            self.db.flush() # Ensure match.id for localization

            loc = MetadataLocalization(
                match_id=match.id,
                locale=language,
                title=data.get("title") or data.get("name"),
                overview=data.get("overview"),
                poster_path=data.get("poster_path"),
                backdrop_path=data.get("backdrop_path")
            )
            self.db.add(loc)

    def propagate_active_match(self, source_item: MediaItem):
        """Copies the active match to all siblings with the same group_hash."""
        if not source_item.group_hash: return

        active_match = next((m for m in source_item.matches if m.is_active), None)
        if not active_match: return

        siblings = self.db.query(MediaItem).filter(
            MediaItem.group_hash == source_item.group_hash,
            MediaItem.id != source_item.id
        ).all()

        for sib in siblings:
            delete_media_matches_for_items(self.db, [sib.id])
            
            new_match = self._clone_match(active_match, sib.id)
            # Adjust season/episode from filename if available
            new_match.season_number = sib.fn_season or sib.fd_season or active_match.season_number
            new_match.episode_number = sib.fn_episode or sib.fd_episode or active_match.episode_number
            
            self.db.add(new_match)
            self.db.flush()

            for loc in active_match.localizations:
                self.db.add(self._clone_localization(loc, new_match.id))
            
            _, sib_status = determine_resolved_media_shape(
                ItemType.MOVIE if new_match.item_type == ItemType.MOVIE else "tv",
                new_match.season_number,
                new_match.episode_number
            )
            sib.status = sib_status

    def _create_match(self, item: MediaItem, data: Dict[str, Any], is_active: bool) -> MediaMatch:
        date_str = data.get("release_date") or data.get("first_air_date")
        release_date = None
        if date_str:
            try: release_date = datetime.strptime(date_str, "%Y-%m-%d")
            except: pass
        last_air_date = None
        last_air_date_str = data.get("last_air_date")
        if last_air_date_str:
            try: last_air_date = datetime.strptime(last_air_date_str, "%Y-%m-%d")
            except: pass

        raw_type = data.get("item_type") or data.get("media_type", "movie")
        itype = ItemType.SERIES if raw_type in ["series", "tv"] else ItemType.MOVIE

        return MediaMatch(
            media_item_id=item.id, tmdb_id=data.get("id"), item_type=itype,
            series_tmdb_id=data.get("id") if itype == ItemType.SERIES else None,
            season_number=item.fn_season or item.fd_season or item.it_season,
            episode_number=item.fn_episode or item.fd_episode or item.it_episode,
            release_date=release_date if itype == ItemType.MOVIE else None,
            first_air_date=release_date if itype == ItemType.SERIES else None,
            last_air_date=last_air_date if itype == ItemType.SERIES else None,
            confidence_score=1.0, is_active=is_active,
            rating_tmdb=data.get("vote_average"), vote_count_tmdb=data.get("vote_count"),
            image_status=ImageStatus.PENDING if is_active and data.get("poster_path") else ImageStatus.NONE,
            backdrop_status=ImageStatus.PENDING if is_active and data.get("backdrop_path") else ImageStatus.NONE
        )

    def _clone_match(self, source: MediaMatch, target_item_id: int) -> MediaMatch:
        return MediaMatch(
            media_item_id=target_item_id, tmdb_id=source.tmdb_id, item_type=source.item_type,
            series_tmdb_id=source.series_tmdb_id,
            release_date=source.release_date, first_air_date=source.first_air_date, last_air_date=source.last_air_date,
            confidence_score=source.confidence_score, is_active=True,
            rating_tmdb=source.rating_tmdb, vote_count_tmdb=source.vote_count_tmdb
        )

    def _clone_localization(self, source: MetadataLocalization, target_match_id: int) -> MetadataLocalization:
        return MetadataLocalization(
            match_id=target_match_id, locale=source.locale,
            title=source.title, original_title=source.original_title,
            series_title=source.series_title, original_series_title=source.original_series_title,
            season_title=source.season_title, episode_title=source.episode_title,
            overview=source.overview, poster_path=source.poster_path, backdrop_path=source.backdrop_path
        )
