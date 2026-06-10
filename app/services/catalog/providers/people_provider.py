from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_
from app.db.models import Person, MediaPersonLink, MediaMatch, MediaItem, ItemStatus
from app.services.catalog.filters import (
    _apply_people_role_filter,
    _apply_rating_filter,
    _apply_exact_rating_filter,
    _apply_favorite_filter
)
from app.services.catalog.helpers import (
    _serialize_person,
)

def _library_visible_people_query(db: Session):
    query = db.query(Person).filter(
        or_(
            Person.is_active == True,
            Person.user_rating > 0,
            Person.is_favorite == True,
        )
    )
    return query

def fetch_people(db: Session, catalog: dict, preferred_language, 
                  normalized_rating_filter, normalized_exact_rating, favorite_only, normalized_people_role):
    people_query = _library_visible_people_query(db).options(
        joinedload(Person.localizations),
        joinedload(Person.media_links)
    )
    people_query = _apply_people_role_filter(people_query, normalized_people_role)
    people_query = _apply_rating_filter(people_query, Person.user_rating, normalized_rating_filter)
    people_query = _apply_exact_rating_filter(people_query, Person.user_rating, normalized_exact_rating)
    people_query = _apply_favorite_filter(people_query, Person.is_favorite, favorite_only)
    
    people = people_query.all()
    
    catalog["people"] = [_serialize_person(p, preferred_language) for p in people]
