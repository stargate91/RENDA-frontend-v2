from typing import Dict, Any
from .base import AbstractNamingStrategy

class PlexNamingStrategy(AbstractNamingStrategy):
    """
    Plex-compatible Naming Strategy.
    Follows official Plex guidelines for folder structure and filenames.
    """

    def get_movie_path(self, context: Dict[str, Any], config: Any) -> str:
        # Plex: Movies/Title (Year)/Title (Year).ext
        title = context.get("Title", "Unknown")
        year = context.get("Year", "")
        folder_name = f"{title} ({year})" if year else title
        
        cat_folder = config.movies_dir_name if config.sort_by_type else ""
        return f"{cat_folder}/{folder_name}".strip("/")

    def get_movie_filename(self, context: Dict[str, Any], config: Any) -> str:
        # Plex prefers Title (Year) as filename too
        title = context.get("Title", "Unknown")
        year = context.get("Year", "")
        return f"{title} ({year})" if year else title

    def get_series_path(self, context: Dict[str, Any], config: Any) -> str:
        # Plex: TV Shows/Show Title (Year)/Season 01/
        show = context.get("SeriesTitle", "Unknown")
        year = context.get("FirstAirYear", "")
        season = context.get("SeasonNumber", "01")
        
        show_folder = f"{show} ({year})" if year else show
        season_folder = f"Season {season}"
        
        cat_folder = config.series_dir_name if config.sort_by_type else ""
        return f"{cat_folder}/{show_folder}/{season_folder}".strip("/")

    def get_episode_filename(self, context: Dict[str, Any], config: Any) -> str:
        # Plex: Show Title (Year) - S01E01 - Episode Title
        show = context.get("SeriesTitle", "Unknown")
        year = context.get("FirstAirYear", "")
        season = context.get("SeasonNumber", "01")
        ep = context.get("EpisodeNumber", "01")
        title = context.get("EpisodeTitle", "")
        
        show_part = f"{show} ({year})" if year else show
        return f"{show_part} - S{season}E{ep} - {title}".strip(" -")

    def get_name(self) -> str:
        return "Plex"
