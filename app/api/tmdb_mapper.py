import logging
from typing import Dict, Any, List, Optional, Type, TypeVar, Union
from pydantic import BaseModel, ValidationError
from ..schemas.tmdb import TMDBMovie, TMDBSeries, TMDBEpisode, TMDBPerson

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

class TMDBMapper:
    """
    Handles mapping of raw JSON responses from TMDB API to Pydantic DTOs.
    Provides validation and default values.
    """

    @staticmethod
    def map_to_model(data: Dict[str, Any], model_class: Type[T]) -> Optional[T]:
        """Generic mapper from dict to Pydantic model with error handling."""
        if not data:
            return None
            
        # Clean empty strings for date fields (TMDB often returns "" instead of null)
        cleaned = data.copy()
        for key in ["release_date", "first_air_date", "last_air_date", "air_date"]:
            if cleaned.get(key) == "":
                cleaned[key] = None

        try:
            return model_class(**cleaned)
        except ValidationError as e:
            logger.error(f"Validation error mapping to {model_class.__name__}: {e}")
            # Optional: Return a partially valid model or None
            return None

    @classmethod
    def map_movie(cls, data: Dict[str, Any]) -> Optional[TMDBMovie]:
        return cls.map_to_model(data, TMDBMovie)

    @classmethod
    def map_series(cls, data: Dict[str, Any]) -> Optional[TMDBSeries]:
        return cls.map_to_model(data, TMDBSeries)

    @classmethod
    def map_episode(cls, data: Dict[str, Any]) -> Optional[TMDBEpisode]:
        return cls.map_to_model(data, TMDBEpisode)

    @classmethod
    def map_credits(cls, data: Dict[str, Any]) -> List[TMDBPerson]:
        """Extracts cast members from the credits response."""
        cast_list = data.get("cast", [])
        results = []
        for person_data in cast_list:
            person = cls.map_to_model(person_data, TMDBPerson)
            if person:
                results.append(person)
        return sorted(results, key=lambda p: p.order)

    @classmethod
    def map_search_results(cls, results: List[Dict[str, Any]], item_type: str) -> List[Union[TMDBMovie, TMDBSeries]]:
        """Maps a list of search results to the appropriate models."""
        mapped = []
        model = TMDBMovie if item_type == "movie" else TMDBSeries
        for item in results:
            obj = cls.map_to_model(item, model)
            if obj:
                mapped.append(obj)
        return mapped
