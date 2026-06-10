from typing import Dict, Type, List
from .base import AbstractNamingStrategy
from .standard_strategy import StandardStrategy
from .plex_strategy import PlexNamingStrategy

class StrategyFactory:
    """Registry and factory for naming strategies."""
    
    _strategies: Dict[str, Type[AbstractNamingStrategy]] = {
        "standard": StandardStrategy,
        "plex": PlexNamingStrategy,
        # "kodi": KodiNamingStrategy, # Future expansion
    }

    @classmethod
    def get_strategy(cls, name: str) -> AbstractNamingStrategy:
        """Returns an instance of the requested strategy, or Standard if not found."""
        strategy_class = cls._strategies.get(name.lower(), StandardStrategy)
        return strategy_class()

    @classmethod
    def list_available(cls) -> List[str]:
        """Returns a list of available strategy keys for the UI."""
        return list(cls._strategies.keys())
