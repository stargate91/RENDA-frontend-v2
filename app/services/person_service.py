import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from ..db.models import Person, PersonLocalization, MediaPersonLink, MediaMatch, ImageStatus
from ..repositories.person_repository import PersonRepository

logger = logging.getLogger(__name__)

class PersonService:
    """
    Service for managing people (cast, crew) and their associated assets (profile images).
    """

    def __init__(self, db: Session):
        self.db = db
        self.repository = PersonRepository(db)

    def get_or_create_person(self, person_data: Dict[str, Any]) -> Person:
        """
        Retrieves an existing person or creates a new one based on TMDB/remote data.
        Ensures thread-safe creation.
        """
        tmdb_id = person_data["id"]
        person = self.repository.get_by_id(tmdb_id)
        if person:
            updated = False
            if person.gender is None and person_data.get("gender") is not None:
                person.gender = person_data.get("gender")
                updated = True
            if person.popularity is None and person_data.get("popularity") is not None:
                person.popularity = person_data.get("popularity")
                updated = True
            if not person.profile_path and person_data.get("profile_path"):
                person.profile_path = person_data.get("profile_path")
                updated = True
            if bool(person.is_adult) != bool(person_data.get("adult")):
                person.is_adult = bool(person_data.get("adult"))
                updated = True
            if updated:
                try:
                    self.db.commit()
                except:
                    self.db.rollback()
            return person

        try:
            # Use nested transaction to handle potential race conditions during parallel enrichment
            with self.db.begin_nested():
                person = Person(
                    id=tmdb_id,
                    popularity=person_data.get("popularity"),
                    profile_path=person_data.get("profile_path"),
                    gender=person_data.get("gender"),
                    is_adult=bool(person_data.get("adult")),
                    image_status=ImageStatus.PENDING if person_data.get("profile_path") else ImageStatus.NONE
                )
                self.db.add(person)
                
                # Default localization (English)
                loc = PersonLocalization(
                    person_id=tmdb_id,
                    language="en",
                    name=person_data.get("name", "Unknown")
                )
                self.db.add(loc)
                self.db.flush()
            return person
        except Exception as e:
            # If creation failed (likely already exists), fetch the existing one
            return self.repository.get_by_id(tmdb_id)

    def link_person_to_match(self, match: MediaMatch, person: Person, job: str, character: str = None, order: int = 0):
        """
        Links a person to a media match (movie/series) with a specific job/role.
        """
        link = self.db.query(MediaPersonLink).filter(
            MediaPersonLink.media_match_id == match.id,
            MediaPersonLink.person_id == person.id,
            MediaPersonLink.job == job
        ).first()
        
        if not link:
            try:
                with self.db.begin_nested():
                    link = MediaPersonLink(
                        media_match_id=match.id,
                        person_id=person.id,
                        job=job,
                        character_name=character,
                        order=order
                    )
                    self.db.add(link)
                    self.db.flush()
            except:
                pass # Already linked

    def get_person_details(self, person_id: int) -> Optional[Dict[str, Any]]:
        """Retrieves formatted details for a person."""
        person = self.repository.get_by_id(person_id)
        if not person: return None
        
        loc = person.localizations[0] if person.localizations else None
        return {
            "id": person.id,
            "name": loc.name if loc else "Unknown",
            "profile_path": person.profile_path,
            "popularity": person.popularity
        }

    def enrich_person_metadata(self, person_id: int, languages: List[str]) -> Optional[Person]:
        """Fetches full person details from TMDB and populates the database with rich details and localizations."""
        from ..api.tmdb_client import TMDBClient
        tmdb = TMDBClient(self.db)
        
        person = self.repository.get_by_id(person_id)
        if not person:
            return None
            
        fetched_langs = set((person.fetched_languages or "").split(",")) if person.fetched_languages else set()
        
        for lang in languages:
            try:
                lang_code = lang.split("-")[0]
                if lang_code in fetched_langs:
                    continue
                    
                data = tmdb.get_person_details(person_id, language=lang)
                if not data:
                    continue
                    
                # Update global fields
                person.birthday = data.get("birthday") or person.birthday
                person.deathday = data.get("deathday") or person.deathday
                person.place_of_birth = data.get("place_of_birth") or person.place_of_birth
                person.gender = data.get("gender") if data.get("gender") is not None else person.gender
                person.popularity = data.get("popularity") or person.popularity
                person.known_for_department = data.get("known_for_department") or person.known_for_department
                person.is_adult = bool(data.get("adult"))
                
                # Alternate images if available
                if "images" in data and "profiles" in data["images"]:
                    person.images = [img["file_path"] for img in data["images"]["profiles"]]
                
                # External IDs
                if "external_ids" in data:
                    person.external_ids = data["external_ids"]
                
                # Update localization
                loc = self.db.query(PersonLocalization).filter(
                    PersonLocalization.person_id == person_id,
                    PersonLocalization.language == lang_code
                ).first()
                
                if not loc:
                    loc = PersonLocalization(person_id=person_id, language=lang_code)
                    self.db.add(loc)
                    
                loc.name = data.get("name") or loc.name or "Unknown"
                loc.biography = data.get("biography") or loc.biography
                
                fetched_langs.add(lang_code)
                self.db.flush()
            except Exception as e:
                logger.error(f"Error enriching person {person_id} for language {lang}: {e}")
                
        person.fetched_languages = ",".join(filter(None, fetched_langs))
        
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to commit person enrichment: {e}")
            
        return person
