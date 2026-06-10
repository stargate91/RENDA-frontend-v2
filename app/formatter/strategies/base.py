from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from ...db.models import MediaMatch, ItemType

class AbstractNamingStrategy(ABC):
    """
    Interface for different naming conventions (Plex, Kodi, Renda Standard, etc.).
    """
    
    @abstractmethod
    def get_movie_path(self, context: Dict[str, Any], config: Any) -> str:
        """Returns the relative subpath for a movie (e.g. 'Movies/Title (Year)')."""
        pass

    @abstractmethod
    def get_movie_filename(self, context: Dict[str, Any], config: Any) -> str:
        """Returns the formatted filename for a movie."""
        pass

    @abstractmethod
    def get_series_path(self, context: Dict[str, Any], config: Any) -> str:
        """Returns the relative subpath for a series/season."""
        pass

    @abstractmethod
    def get_episode_filename(self, context: Dict[str, Any], config: Any) -> str:
        """Returns the formatted filename for an episode."""
        pass

    @abstractmethod
    def get_name(self) -> str:
        """Returns the name of the strategy."""
        pass
