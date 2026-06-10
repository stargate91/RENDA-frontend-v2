from typing import Dict, Any, Optional
from .base import AbstractNamingStrategy
from pathlib import Path

class StandardStrategy(AbstractNamingStrategy):
    """
    Renda's Standard Naming Strategy.
    Uses user-defined templates and switches from the configuration.
    """

    def get_movie_path(self, context: Dict[str, Any], config: Any) -> str:
        cat_folder = config.movies_dir_name if config.sort_by_type else ""
        
        if not config.create_movie_subdir:
            return cat_folder

        # Collection handling
        coll_val = context.get("Collection") or context.get("collection")
        if config.create_collection_dir and coll_val and str(coll_val).strip():
            # Nesting: Movies/Collection Name/Movie Name
            return f"{cat_folder}/{config.collection_folder}/{config.movie_folder}".strip("/")

        return f"{cat_folder}/{config.movie_folder}".strip("/")

    def get_movie_filename(self, context: Dict[str, Any], config: Any) -> str:
        return config.movie_file

    def get_series_path(self, context: Dict[str, Any], config: Any) -> str:
        cat_folder = config.series_dir_name if config.sort_by_type else ""
        
        parts = [cat_folder]
        if config.create_series_dir:
            parts.append(config.series_folder)
        if config.create_season_dir:
            parts.append(config.season_folder)
            
        return "/".join([p for p in parts if p]).strip("/")

    def get_episode_filename(self, context: Dict[str, Any], config: Any) -> str:
        return config.episode_file

    def get_name(self) -> str:
        return "Standard"
