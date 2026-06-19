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
            new_pop = person_data.get("popularity")
            if new_pop is not None and (person.popularity is None or person.popularity == 0.0 or person.popularity != new_pop):
                person.popularity = new_pop
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
                    locale="en",
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
        """Fetches full person details from TMDB or adult databases and populates the database with rich details and localizations."""
        person = self.repository.get_by_id(person_id)
        if not person:
            return None

        # Check if this is an adult performer from StashDB, FansDB, or THEPornDB
        external_ids = person.external_ids or {}
        
        # 1. Fetch metadata from any linked adult sources
        for src in ["stashdb", "fansdb", "theporndb"]:
            uuid_str = external_ids.get(f"{src}_id")
            if uuid_str:
                from app.api.graphql_clients import AdultGraphQLClient
                client = AdultGraphQLClient(self.db, src)
                try:
                    data = client.get_performer_details(uuid_str)
                    if data:
                        person.birthday = data.get("birthdate") or person.birthday
                        person.deathday = data.get("death_date") or person.deathday
                        person.place_of_birth = data.get("country") or person.place_of_birth
                        
                        gender_str = str(data.get("gender") or "").upper()
                        if "FEMALE" in gender_str:
                            person.gender = 1
                        elif "MALE" in gender_str:
                            person.gender = 2
                        elif gender_str:
                            person.gender = 3
                            
                        images = data.get("images") or []
                        if images:
                            person.profile_path = person.profile_path or images[0].get("url")
                            existing_imgs = list(person.images or [])
                            new_imgs = [img.get("url") for img in images if img.get("url")]
                            person.images = existing_imgs + [ni for ni in new_imgs if ni not in existing_imgs]
                            
                        new_ext = dict(person.external_ids or {})
                        # Merge aliases
                        existing_aliases = set(new_ext.get("aliases") or [])
                        new_aliases = data.get("aliases") or []
                        new_ext["aliases"] = list(existing_aliases.union(new_aliases))
                        
                        # Merge attributes
                        existing_attrs = dict(new_ext.get("attributes") or {})
                        new_attrs = {
                            "ethnicity": data.get("ethnicity"),
                            "eye_color": data.get("eye_color"),
                            "hair_color": data.get("hair_color"),
                            "height": data.get("height"),
                            "measurements": data.get("measurements"),
                            "tattoos": data.get("tattoos"),
                            "piercings": data.get("piercings"),
                        }
                        for k, v in new_attrs.items():
                            if v:
                                existing_attrs[k] = v
                        new_ext["attributes"] = existing_attrs
                        
                        urls = data.get("urls") or []
                        existing_urls = new_ext.get("urls") or []
                        new_urls_list = [{"url": u.get("url"), "site": u.get("site", {}).get("name") if u.get("site") else None} for u in urls if u.get("url")]
                        # Combine URLs avoiding duplicates
                        url_map = {u["url"]: u for u in existing_urls}
                        for nu in new_urls_list:
                            url_map[nu["url"]] = nu
                        new_ext["urls"] = list(url_map.values())
                        
                        person.external_ids = new_ext
                        
                        for lang in languages:
                            lang_code = lang.split("-")[0]
                            loc = self.db.query(PersonLocalization).filter(
                                PersonLocalization.person_id == person_id,
                                PersonLocalization.locale == lang_code
                            ).first()
                            if not loc:
                                loc = PersonLocalization(person_id=person_id, locale=lang_code)
                                self.db.add(loc)
                            loc.name = data.get("name") or loc.name or "Unknown"
                            loc.biography = data.get("disambiguation") or loc.biography
                            
                        person.fetched_languages = ",".join(list(set((person.fetched_languages or "").split(",") + [l.split("-")[0] for l in languages])))
                        self.db.commit()
                except Exception as ex:
                    logger.error(f"Error enriching adult performer metadata for {src}: {ex}")

        # 2. Fetch metadata from TMDb if it's a TMDb person or has a linked tmdb_id
        has_tmdb = "tmdb_id" in external_ids or not any(external_ids.get(f"{src}_id") for src in ["stashdb", "fansdb", "theporndb"])
        if has_tmdb:
            from ..api.tmdb_client import TMDBClient
            tmdb = TMDBClient(self.db)
            
            fetched_langs = set((person.fetched_languages or "").split(",")) if person.fetched_languages else set()
            
            for lang in languages:
                try:
                    lang_code = lang.split("-")[0]
                    tmdb_id_to_fetch = person_id
                    if "tmdb_id" in external_ids and external_ids["tmdb_id"]:
                        try:
                            tmdb_id_to_fetch = int(external_ids["tmdb_id"])
                        except (ValueError, TypeError):
                            pass
                    
                    # If the ID to fetch is a hash-based stable integer and we don't have tmdb_id, we can't search TMDb.
                    if tmdb_id_to_fetch > 100000000 and "tmdb_id" not in external_ids:
                        continue
                        
                    data = tmdb.get_person_details(tmdb_id_to_fetch, language=lang)
                    if not data:
                        continue
                        
                    # Update global fields
                    person.birthday = data.get("birthday") or person.birthday
                    person.deathday = data.get("deathday") or person.deathday
                    person.place_of_birth = data.get("place_of_birth") or person.place_of_birth
                    person.gender = data.get("gender") if data.get("gender") is not None else person.gender
                    if data.get("popularity") is not None:
                        person.popularity = data.get("popularity")
                    person.known_for_department = data.get("known_for_department") or person.known_for_department
                    person.is_adult = bool(data.get("adult"))
                    
                    # Alternate images if available
                    if "images" in data and "profiles" in data["images"]:
                        existing_imgs = list(person.images or [])
                        new_imgs = [img["file_path"] for img in data["images"]["profiles"]]
                        person.images = existing_imgs + [ni for ni in new_imgs if ni not in existing_imgs]
                    
                    # Merge external IDs from TMDB client if not already present
                    new_ext = dict(person.external_ids or {})
                    if "external_ids" in data:
                        for k, v in data["external_ids"].items():
                            if v and k not in new_ext:
                                new_ext[k] = v
                    person.external_ids = new_ext
                    
                    # Update localization
                    loc = self.db.query(PersonLocalization).filter(
                        PersonLocalization.person_id == person_id,
                        PersonLocalization.locale == lang_code
                    ).first()
                    if not loc:
                        loc = PersonLocalization(person_id=person_id, locale=lang_code)
                        self.db.add(loc)
                    if data.get("name"):
                        loc.name = data["name"]
                    if data.get("biography"):
                        loc.biography = data["biography"]
                        
                    fetched_langs.add(lang_code)
                    self.db.flush()
                except Exception as e:
                    logger.error(f"Error enriching person {person_id} for language {lang}: {e}")
                    if isinstance(e, ValueError) and "API key is missing" in str(e):
                        raise e
                    if hasattr(e, "response") and e.response is not None:
                        if e.response.status_code == 401:
                            raise e
                        elif e.response.status_code == 404:
                            fetched_langs.add(lang_code)
                    
            person.fetched_languages = ",".join(filter(None, fetched_langs))
            
            try:
                self.db.commit()
            except Exception as e:
                self.db.rollback()
                logger.error(f"Failed to commit person enrichment: {e}")
                
        return person
