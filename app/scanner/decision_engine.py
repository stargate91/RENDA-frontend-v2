from typing import Dict, Any, Optional
from ..db.models import ItemType

class DecisionEngine:
    """
    Handles complex decision logic for categorizing media items.
    Resolves conflicts between filename, folder, and NFO data.
    """

    def determine_item_type(self, triple: Dict[str, Any], filename: str, folder_name: str, has_nfo: bool = False) -> ItemType:
        """
        Main decision logic for determining if an item is a MOVIE or an EPISODE.
        """
        # NFO is King
        if has_nfo:
            return ItemType.MOVIE

        fn = triple.get("fn", {})
        fd = triple.get("fd", {})
        
        fn_type = fn.get('type')
        fd_type = fd.get('type')

        # Fix common 1080p -> S10E80 trap
        if fn.get('season') == 10 and fn.get('episode') == 80:
            fn_type = 'movie'

        raw_fn_lower = (filename or "").lower()
        raw_fd_lower = (folder_name or "").lower()
        
        # Check for strong series indicators
        is_forced_series = False
        if (fn.get('season') or fn.get('episode') or fd.get('season') or fd.get('episode')) and fn_type != 'movie':
            is_forced_series = True
            
        # Exception: Movie sequels often have fractions or numbers that Guessit mistakes for episodes (e.g. Naked Gun 2 12 (1991))
        # If we have an episode but absolutely no season info, and we have a valid year, and no standard S/E markers:
        if is_forced_series and fn.get('episode') and not fn.get('season') and not fd.get('season') and (fn.get('year') or fd.get('year')):
            import re
            if not re.search(r'\bs\d+e\d+\b|\bseason\b|\bepizod\b|\bresz\b', raw_fn_lower):
                is_forced_series = False
            
        series_kw = ['mini-series', 'miniseries', 'complete series', 'complete.series']
        if any(kw in raw_fn_lower or kw in raw_fd_lower for kw in series_kw):
            is_forced_series = True

        # Decision Tree
        if is_forced_series:
            return ItemType.EPISODE
        elif fd_type == 'movie' and fd.get('year'):
            return ItemType.MOVIE
        elif fn_type == 'episode' and not fd.get('year'):
            return ItemType.EPISODE
        elif fd_type == 'episode':
            return ItemType.EPISODE
        elif fn_type == 'movie' or fd_type == 'movie':
            return ItemType.MOVIE
        
        return ItemType.MOVIE # Default fallback

    def get_clean_metadata(self, item_type: ItemType, triple: Dict[str, Any]):
        """
        Cleans up metadata based on the decided item type.
        For example, if it's a movie, we should ignore 'episode' data found by mistake.
        """
        fn = triple.get("fn", {})
        fd = triple.get("fd", {})
        
        if item_type == ItemType.MOVIE and fd.get('year'):
            # Clear episode/season filth from filename if folder confirms it's a movie with a year
            return {
                "season": None,
                "episode": None
            }
        return {}
