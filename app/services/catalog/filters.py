from sqlalchemy import or_
from app.db.models import Person, MediaPersonLink

def _normalize_media_type(media_type):
    value = str(media_type or "movie").strip().lower()
    if value in {"tv", "series", "show"}:
        return "tv"
    return "movie"

def _is_rated_value(value):
    return isinstance(value, (int, float)) and value > 0

def _matches_rating_filter(user_rating, normalized_rating_filter):
    is_rated = _is_rated_value(user_rating)
    if normalized_rating_filter == "rated":
        return is_rated
    if normalized_rating_filter == "unrated":
        return not is_rated
    return True

def _matches_catalog_filters(user_rating, is_favorite, normalized_rating_filter, normalized_exact_rating, favorite_only):
    if not _matches_rating_filter(user_rating, normalized_rating_filter):
        return False
    if normalized_exact_rating is not None and round(float(user_rating or 0) * 2) / 2 != normalized_exact_rating:
        return False
    if favorite_only and not is_favorite:
        return False
    return True

def _apply_rating_filter(query, rating_column, normalized_rating_filter):
    if normalized_rating_filter == "rated":
        return query.filter(rating_column > 0)
    if normalized_rating_filter == "unrated":
        return query.filter(or_(rating_column == None, rating_column <= 0))
    return query

def _apply_exact_rating_filter(query, rating_column, normalized_exact_rating):
    if normalized_exact_rating is not None:
        return query.filter(rating_column == normalized_exact_rating)
    return query

def _apply_favorite_filter(query, favorite_column, favorite_only):
    if favorite_only:
        return query.filter(favorite_column == True)
    return query

def _apply_people_role_filter(query, normalized_people_role):
    if normalized_people_role == "actor":
        return query.filter(
            or_(
                Person.known_for_department == "Acting",
                Person.media_links.any(MediaPersonLink.job == "Actor")
            )
        )
    if normalized_people_role == "writer":
        return query.filter(
            or_(
                Person.known_for_department == "Writing",
                Person.media_links.any(MediaPersonLink.job.in_(["Writer", "Screenplay", "Story", "Teleplay"]))
            )
        )
    if normalized_people_role == "director":
        return query.filter(
            or_(
                Person.known_for_department.in_(["Directing", "Creator"]),
                Person.media_links.any(MediaPersonLink.job.in_(["Director", "Creator"]))
            )
        )
    return query
