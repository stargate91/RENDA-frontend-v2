from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import case, func

from app.db.base import Session
from app.db.models import (
    Person,
    MediaPersonLink,
    MediaMatch,
    MediaItem,
    ItemStatus,
    ItemType,
    UserSetting,
)

from app.utils.people_utils import (
    _preferred_metadata_language,
    _pick_person_localization,
    _resolve_person_profile_path,
)

import logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/people")
def get_people(
    search: str = None,
    role: str = None,
    sort_by: str = "library_count",
    include_inactive: bool = False,
    adult_only: bool = False,
    gender: str = "all",
    offset: int = 0,
    limit: int = 20,
):
    """Returns a list of all people associated with organized library items."""
    db = Session()
    try:
        preferred_lang = _preferred_metadata_language(db)
        
        # 1. IDs of matches of the 1st matched
        matched_match_ids = [
            m.id for m in db.query(MediaMatch).join(MediaItem).filter(
                MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED])
            ).filter(MediaMatch.is_active == True).all()
        ]
        
        # 2. People and library occurrence count retrieval using LEFT OUTER JOIN
        if matched_match_ids:
            join_cond = (MediaPersonLink.person_id == Person.id) & (MediaPersonLink.media_match_id.in_(matched_match_ids))
        else:
            join_cond = (MediaPersonLink.person_id == Person.id) & (False)

        library_key = case(
            (
                MediaMatch.item_type.in_([ItemType.SERIES, ItemType.SEASON, ItemType.EPISODE]),
                -func.coalesce(MediaMatch.series_tmdb_id, MediaMatch.tmdb_id, MediaMatch.id)
            ),
            else_=func.coalesce(MediaMatch.tmdb_id, MediaMatch.id)
        )

        query = db.query(
            Person,
            func.count(func.distinct(library_key)).label("library_count"),
            func.max(
                case(
                    (MediaMatch.is_adult == True, 1),
                    else_=0
                )
            ).label("linked_adult_flag")
        ).select_from(Person).outerjoin(
            MediaPersonLink, join_cond
        ).outerjoin(
            MediaMatch, MediaPersonLink.media_match_id == MediaMatch.id
        )
        
        if role == "Actor":
            query = query.filter((MediaPersonLink.job == "Actor") | (Person.known_for_department == "Acting"))
        elif role == "Director":
            query = query.filter((MediaPersonLink.job.in_(["Director", "Creator"])) | (Person.known_for_department.in_(["Directing", "Creator"])))
        elif role == "Writer":
            query = query.filter((MediaPersonLink.job.in_(["Writer", "Screenplay", "Story", "Teleplay"])) | (Person.known_for_department == "Writing"))
            
        if gender == "female":
            query = query.filter(Person.gender == 1)
        elif gender == "male":
            query = query.filter(Person.gender == 2)

        query = query.group_by(Person.id)
        results = query.all()
        
        # Fetch adult gender preference
        adult_pref = "all"
        if adult_only:
            adult_pref_setting = db.query(UserSetting).filter(UserSetting.key == "adult_gender_preference").first()
            if adult_pref_setting and adult_pref_setting.value:
                adult_pref = str(adult_pref_setting.value).strip().lower()

        people_list = []
        for person, library_count, linked_adult_flag in results:
            # Active people only OR people with a library match
            if not include_inactive and not person.is_active:
                continue
            if include_inactive and not person.is_active and library_count == 0:
                continue
            effective_is_adult = bool(getattr(person, "is_adult", False)) or bool(linked_adult_flag)
            if adult_only:
                if not effective_is_adult:
                    continue
                if adult_pref == "female" and person.gender != 1:
                    continue
                if adult_pref == "male" and person.gender != 2:
                    continue
            else:
                if effective_is_adult:
                    continue
            
            loc = _pick_person_localization(person, preferred_lang)
            fallback_loc = next(
                (
                    localization
                    for localization in (person.localizations or [])
                    if getattr(localization, "name", None)
                ),
                None,
            )
            name = (
                (loc.name if loc and getattr(loc, "name", None) else None)
                or (fallback_loc.name if fallback_loc else None)
                or "Unknown"
            )
            
            # Search filtering
            if search and search.lower() not in name.lower():
                continue
                
            people_list.append({
                "id": person.id,
                "name": name,
                "profile_path": _resolve_person_profile_path(person),
                "gender": person.gender,
                "popularity": person.popularity or 0.0,
                "is_adult": effective_is_adult,
                "is_active": person.is_active,
                "is_favorite": person.is_favorite,
                "user_rating": person.user_rating,
                "library_count": library_count,
                "known_for": person.known_for_department
            })
            
        # Sorting logic
        if sort_by in ("library_count", "library_count_desc"):
            people_list.sort(key=lambda x: (-x["library_count"], -x["popularity"]))
        elif sort_by == "library_count_asc":
            people_list.sort(key=lambda x: (x["library_count"], x["popularity"]))
        elif sort_by in ("popularity", "popularity_desc"):
            people_list.sort(key=lambda x: (-x["popularity"], -x["library_count"]))
        elif sort_by == "popularity_asc":
            people_list.sort(key=lambda x: (x["popularity"], x["library_count"]))
        elif sort_by in ("name", "name_asc", "title_asc"):
            people_list.sort(key=lambda x: x["name"].lower())
        elif sort_by in ("name_desc", "title_desc"):
            people_list.sort(key=lambda x: x["name"].lower(), reverse=True)
            
        total = len(people_list)
        sliced_list = people_list[offset:offset+limit]
        has_more = offset + len(sliced_list) < total
        
        return {
            "items": sliced_list,
            "total": total,
            "has_more": has_more,
            "offset": offset,
            "limit": limit
        }
    except Exception as e:
        import traceback
        logger.error(f"Error getting people list: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.get("/people/search-tmdb")
def search_people_tmdb(query: str, language: str = None, adult_only: bool = False, page: int = 1, source: str = "all"):
    """Searches the TMDB API or adult databases for people (actors/directors)."""
    db = Session()
    try:
        from app.api.tmdb_client import TMDBClient
        import hashlib
        
        # Get language settings if not specified
        if not language:
            lang_setting = db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
            language = lang_setting.value if lang_setting else "en-US"
        include_adult_setting = db.query(UserSetting).filter(UserSetting.key == "include_adult").first()
        include_adult = False
        if include_adult_setting:
            value = include_adult_setting.value
            include_adult = value.lower() == "true" if isinstance(value, str) else bool(value)
        page = max(1, int(page or 1))

        adult_results = []

        if adult_only and source != "tmdb":
            from app.api.graphql_clients import AdultGraphQLClient
            
            def get_stable_integer_id(src: str, u_str: str) -> int:
                h = hashlib.sha256(f"{src}:{u_str}".encode()).hexdigest()
                return int(h[:7], 16)
            
            # Select sources to search
            sources_to_search = ["stashdb", "fansdb", "theporndb"] if source == "all" else [source]
            
            for source_name in sources_to_search:
                client = AdultGraphQLClient(db, source_name)
                endpoint, api_key = client._get_config()
                if not endpoint:
                    continue
                try:
                    performers = client.search_performers(query)
                    for perf in performers:
                        uuid_str = perf.get("id")
                        if not uuid_str:
                            continue
                        
                        stable_id = get_stable_integer_id(source_name, uuid_str)
                        
                        # Map gender
                        gender_str = str(perf.get("gender") or "").upper()
                        if "FEMALE" in gender_str:
                            mapped_gender = 1
                        elif "MALE" in gender_str:
                            mapped_gender = 2
                        elif gender_str:
                            mapped_gender = 3
                        else:
                            mapped_gender = 0
                            
                        # Profile path
                        images = perf.get("images") or []
                        profile_url = images[0].get("url") if images else None
                        
                        # Check database for existing person
                        person = db.query(Person).filter(Person.id == stable_id).first()
                        
                        # Check if linked to organized library
                        linked_rows = (
                            db.query(MediaPersonLink.person_id)
                            .join(MediaMatch, MediaMatch.id == MediaPersonLink.media_match_id)
                            .join(MediaItem, MediaItem.id == MediaMatch.media_item_id)
                            .filter(
                                MediaPersonLink.person_id == stable_id,
                                MediaMatch.is_active.is_(True),
                                MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                            )
                            .distinct()
                            .all()
                        )
                        is_linked = len(linked_rows) > 0
                        
                        adult_results.append({
                            "id": f"{source_name}:{uuid_str}",
                            "name": perf.get("name"),
                            "adult": True,
                            "gender": mapped_gender,
                            "profile_path": profile_url,
                            "known_for_department": "Acting",
                            "known_for": [],
                            "is_active": bool(person.is_active) if person else False,
                            "is_pinned": bool(person.is_favorite) if person else False,
                            "is_linked": is_linked
                        })
                except Exception as ex:
                    logger.error(f"Error searching {source_name}: {ex}")
            
            # Apply gender filtering if set
            adult_pref = "all"
            pref_setting = db.query(UserSetting).filter(UserSetting.key == "adult_gender_preference").first()
            if pref_setting and pref_setting.value:
                adult_pref = str(pref_setting.value).strip().lower()
            
            if adult_pref == "female":
                adult_results = [r for r in adult_results if r.get("gender") == 1]
            elif adult_pref == "male":
                adult_results = [r for r in adult_results if r.get("gender") == 2]

            if source != "all":
                return adult_results
                
        # If source is "all" or "tmdb", we query TMDB and merge/deduplicate with adult_results
        seen_names = {r["name"].lower().strip() for r in adult_results}
        
        client = TMDBClient(db)
        results = client.search_person(query=query, language=language, include_adult=include_adult, page=page)
        
        if adult_only:
            results = [r for r in (results or []) if bool(r.get("adult"))]
            
        person_ids = []
        for result in results:
            name = result.get("name")
            if not name or name.lower().strip() in seen_names:
                continue
            try:
                person_ids.append(int(result.get("id")))
            except (TypeError, ValueError):
                continue

        local_people = {}
        linked_person_ids = set()

        if person_ids:
            local_people = {
                person.id: person
                for person in db.query(Person).filter(Person.id.in_(person_ids)).all()
            }

            linked_rows = (
                db.query(MediaPersonLink.person_id)
                .join(MediaMatch, MediaMatch.id == MediaPersonLink.media_match_id)
                .join(MediaItem, MediaItem.id == MediaMatch.media_item_id)
                .filter(
                    MediaPersonLink.person_id.in_(person_ids),
                    MediaMatch.is_active.is_(True),
                    MediaItem.status.in_([ItemStatus.RENAMED, ItemStatus.ORGANIZED]),
                )
                .distinct()
                .all()
            )
            linked_person_ids = {int(person_id) for (person_id,) in linked_rows if person_id is not None}

        for result in results:
            name = result.get("name")
            if not name or name.lower().strip() in seen_names:
                continue
            try:
                person_id = int(result.get("id"))
            except (TypeError, ValueError):
                continue

            local_person = local_people.get(person_id)
            
            # Map gender from TMDB (integer)
            mapped_gender = result.get("gender") or 0
            
            adult_results.append({
                "id": person_id,
                "name": name,
                "adult": bool(result.get("adult")),
                "gender": mapped_gender,
                "profile_path": result.get("profile_path"),
                "known_for_department": result.get("known_for_department") or "Acting",
                "known_for": result.get("known_for") or [],
                "is_active": bool(local_person.is_active) if local_person else False,
                "is_pinned": bool(local_person.is_favorite) if local_person else False,
                "is_linked": person_id in linked_person_ids
            })

        return adult_results
    except Exception as e:
        logger.error(f"Error searching TMDB/adult people: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()
