from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..db.models import ItemStatus, MediaItem, MediaPersonLink, Person, UserSetting
from ..db.models.metadata import MediaMatch
from ..utils.library_helpers import public_image_path as _public_image_path

class LibraryPeopleService:
    """
    Service for querying actors, directors, and creators.
    """

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def normalize_role(role: Optional[str]) -> str:
        normalized = str(role or "all").strip().lower()
        if normalized in {"actors", "actor"}:
            return "actor"
        if normalized in {"directors", "director"}:
            return "director"
        if normalized in {"writers", "writer"}:
            return "writer"
        return "all"

    def get_people_group(self, role: str, filter_status: str = "active", tab: str = "people") -> list[dict]:
        normalized_role = self.normalize_role(role)
        include_adult = self._include_adult_enabled()
        target_tab = str(tab or "people").strip().lower()

        # Fetch distinct library counts
        links = self.db.query(
            MediaPersonLink.person_id,
            MediaMatch.id,
            MediaMatch.series_tmdb_id,
        ).join(
            MediaMatch, MediaPersonLink.media_match_id == MediaMatch.id
        ).join(
            MediaItem, MediaMatch.media_item_id == MediaItem.id
        ).filter(
            MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
            MediaMatch.is_active == True
        ).all()

        person_projects = {}
        for person_id, match_id, series_tmdb_id in links:
            if person_id not in person_projects:
                person_projects[person_id] = (set(), set())
            movies_set, series_set = person_projects[person_id]
            if series_tmdb_id:
                series_set.add(series_tmdb_id)
            else:
                movies_set.add(match_id)

        project_counts = {
            pid: len(movies_set) + len(series_set)
            for pid, (movies_set, series_set) in person_projects.items()
        }

        adult_pref = self._adult_gender_preference()

        query = self.db.query(Person)

        if filter_status == "active":
            query = query.filter(Person.is_active == True)
        elif filter_status == "inactive":
            query = query.filter(Person.is_active == False)
        else:
            query = query.filter(Person.is_active.in_([True, False]))

        if include_adult and target_tab == "adult_people":
            query = query.filter(Person.is_adult == True)
            if adult_pref == "female":
                query = query.filter(Person.gender == 1)
            elif adult_pref == "male":
                query = query.filter(Person.gender == 2)
        else:
            query = query.filter(Person.is_adult == False)

        role_filters = []
        if normalized_role == "actor":
            role_filters.append(Person.known_for_department == "Acting")
            fallback_name = "Unknown Actor"
        elif normalized_role == "director":
            role_filters.append(Person.known_for_department.in_(["Directing", "Creator"]))
            fallback_name = "Unknown Director"
        elif normalized_role == "writer":
            role_filters.append(Person.known_for_department == "Writing")
            fallback_name = "Unknown Writer"
        else:
            role_filters.append(True)
            fallback_name = "Unknown Person"

        if normalized_role != "all":
            people = query.filter(or_(*role_filters)).distinct().all()
        else:
            people = query.distinct().all()

        people_list = []
        for person in people:
            is_adult_person = bool(getattr(person, "is_adult", False))
            if include_adult:
                if target_tab == "adult_people" and not is_adult_person:
                    continue
                if target_tab == "adult_people":
                    if adult_pref == "female" and person.gender != 1:
                        continue
                    if adult_pref == "male" and person.gender != 2:
                        continue
                if target_tab != "adult_people" and is_adult_person:
                    continue
            else:
                if is_adult_person:
                    continue
            people_list.append({
                "id": person.id,
                "name": person.localizations[0].name if person.localizations else fallback_name,
                "year": None,
                "poster_path": self._person_profile_path(person),
                "rating": person.popularity or 0.0,
                "type": "person",
                "is_active": person.is_active,
                "is_favorite": person.is_favorite,
                "user_rating": person.user_rating,
                "birthday": person.birthday or "",
                "custom_tags": person.custom_tags or [],
                "gender": person.gender,
                "library_count": project_counts.get(person.id, 0),
                "people_role": self._primary_role(person),
                "is_adult_person": is_adult_person,
                "external_ids": person.external_ids or {},
            })

        return people_list

    @staticmethod
    def _primary_role(person) -> str:
        department = str(getattr(person, "known_for_department", "") or "").strip().lower()
        if department == "acting":
            return "actor"
        if department == "writing":
            return "writer"
        if department in {"directing", "creator"}:
            return "director"
        jobs = {str(getattr(link, "job", "") or "").strip().lower() for link in getattr(person, "media_links", [])}
        if "actor" in jobs:
            return "actor"
        if jobs.intersection({"writer", "screenplay", "story", "teleplay"}):
            return "writer"
        if jobs.intersection({"director", "creator"}):
            return "director"
        return "person"

    def _person_profile_path(self, person) -> Optional[str]:
        manual_local_profile = _public_image_path(getattr(person, "manual_local_profile_path", None), "persons")
        if manual_local_profile:
            return manual_local_profile
        manual_profile = getattr(person, "manual_profile_path", None)
        manual_cached = _public_image_path(manual_profile, "persons")
        if manual_cached:
            return manual_cached
        if manual_profile:
            return manual_profile
        local_profile = _public_image_path(getattr(person, "local_profile_path", None), "persons")
        if local_profile:
            return local_profile
        profile_path = getattr(person, "profile_path", None)
        local_cached = _public_image_path(profile_path, "persons")
        if local_cached:
            return local_cached
        return profile_path

    def _include_adult_enabled(self) -> bool:
        setting = self.db.query(UserSetting).filter(UserSetting.key == "include_adult").first()
        if not setting:
            return False
        value = setting.value
        return value.lower() == "true" if isinstance(value, str) else bool(value)

    def _adult_gender_preference(self) -> str:
        setting = self.db.query(UserSetting).filter(UserSetting.key == "adult_gender_preference").first()
        if not setting or not setting.value:
            return "all"
        return str(setting.value).strip().lower()
