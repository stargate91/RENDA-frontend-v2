from fastapi import APIRouter, UploadFile, File
import shutil
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, func, case
import logging
import os
import threading
import subprocess
import platform
import time
from pathlib import Path
from typing import Optional, Any
import uuid
import re
import json

from app.db.base import Session
from app.db.models import *
from app.utils.people_utils import *
from app.services.people_service import *
from app.utils.library_utils.image_constants import BACKDROP_SIZE, PERSON_SIZE, POSTER_SIZE

logger = logging.getLogger(__name__)

MEDIA_IMAGE_ROOT = Path("data/media/images")
DATA_DIR = Path("data")
PEOPLE_REPORTS_FILE = DATA_DIR / "bulk_people_import_reports.json"

bulk_people_import_reports: dict[str, dict[str, Any]] = {}
bulk_people_import_reports_lock = threading.Lock()


def _load_bulk_people_reports():
    global bulk_people_import_reports
    try:
        if PEOPLE_REPORTS_FILE.exists():
            with open(PEOPLE_REPORTS_FILE, "r", encoding="utf-8") as f:
                bulk_people_import_reports = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load bulk people reports: {e}")

_load_bulk_people_reports()


def _normalize_user_rating(value):
    if value is None or value == "":
        return None
    try:
        rating = float(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid user_rating")
    rating = max(0.5, min(10.0, rating))
    return round(rating * 2) / 2


def _normalize_person_name(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = re.sub(r"[^a-z0-9]+", " ", str(value).lower())
    return " ".join(normalized.split())


def _bulk_people_report_key(role_key: str, adult_only: bool = False) -> str:
    mode_key = "nsfw" if adult_only else "sfw"
    normalized_role_key = str(role_key or "all").strip().lower() or "all"
    return f"{mode_key}:{normalized_role_key}"


def _person_matches_role(department: Optional[str], role: Optional[str]) -> bool:
    if not role:
        return True
    department_value = str(department or "").strip()
    if role == "Actor":
        return department_value == "Acting"
    if role == "Director":
        return department_value in {"Directing", "Creator"}
    if role == "Writer":
        return department_value == "Writing"
    return True


def _preferred_person_languages(db) -> list[str]:
    primary_lang = db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
    fallback_lang = db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()

    langs = []
    if primary_lang and primary_lang.value:
        langs.append(primary_lang.value)
    if fallback_lang and fallback_lang.value and fallback_lang.value not in langs:
        langs.append(fallback_lang.value)
    return langs or ["en-US"]


def _serialize_person_summary(db, person: Person, preferred_lang: Optional[str] = None) -> dict[str, Any]:
    loc = _pick_person_localization(person, preferred_lang or _preferred_metadata_language(db))
    return {
        "id": person.id,
        "name": loc.name if loc else "Unknown",
        "profile_path": _resolve_person_profile_path(person),
        "popularity": person.popularity or 0.0,
        "is_adult": bool(getattr(person, "is_adult", False)),
        "is_active": person.is_active,
        "is_favorite": person.is_favorite,
        "user_rating": person.user_rating,
        "library_count": 0,
        "known_for": person.known_for_department,
    }


def _add_person_from_tmdb_internal(db, tmdb_id: int) -> tuple[Person, bool]:
    from app.api.tmdb_client import TMDBClient
    from app.services.person_service import PersonService

    client = TMDBClient(db)
    person_service = PersonService(db)
    langs = _preferred_person_languages(db)

    tmdb_data = client.get_person_details(tmdb_id, language=langs[0])
    if not tmdb_data or "id" not in tmdb_data:
        raise ValueError("Person not found on TMDB")

    person = person_service.get_or_create_person(tmdb_data)
    was_active = bool(person.is_active)
    person.is_active = True

    if tmdb_data.get("profile_path"):
        person.profile_path = tmdb_data.get("profile_path")

    if person.profile_path and (not person.local_profile_path or not _public_image_path(person.local_profile_path, "persons")):
        person.image_status = ImageStatus.PENDING
        person.local_profile_path = None

    db.commit()

    # Trigger background enrichment to prevent blocking the request
    def _enrich_bg(p_id):
        bg_db = Session()
        try:
            from app.services.person_service import PersonService
            person_service = PersonService(bg_db)
            langs = _preferred_person_languages(bg_db)
            person_service.enrich_person_metadata(p_id, languages=langs)
        except Exception as e:
            logger.error(f"Background enrichment failed for {p_id}: {e}")
        finally:
            bg_db.close()
    threading.Thread(target=_enrich_bg, args=(person.id,), daemon=True).start()

    person = db.query(Person).options(joinedload(Person.localizations)).filter(Person.id == tmdb_id).first()
    return person, (not was_active)


def _pick_bulk_person_match(results: list[dict[str, Any]], name: str, role: Optional[str]) -> dict[str, Any]:
    wanted = _normalize_person_name(name)
    exact = [
        result for result in results
        if wanted and _normalize_person_name(result.get("name")) == wanted
    ]
    if role and exact:
        role_exact = [result for result in exact if _person_matches_role(result.get("known_for_department"), role)]
        if len(role_exact) == 1:
            return {"status": "matched", "result": role_exact[0]}
        if len(role_exact) > 1:
            return {"status": "multiple", "results": role_exact}

    if len(exact) == 1:
        return {"status": "matched", "result": exact[0]}
    if len(exact) > 1:
        return {"status": "multiple", "results": exact}

    if len(results) == 1:
        return {"status": "matched", "result": results[0]}
    if len(results) > 1:
        return {"status": "multiple", "results": results[:10]}
    return {"status": "no_match"}


def _store_bulk_people_import_report(role_key: str, payload: dict[str, Any], adult_only: bool = False):
    storage_key = _bulk_people_report_key(role_key, adult_only)
    with bulk_people_import_reports_lock:
        bulk_people_import_reports[storage_key] = payload
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            with open(PEOPLE_REPORTS_FILE, "w", encoding="utf-8") as f:
                json.dump(bulk_people_import_reports, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save bulk people reports: {e}")


def _get_bulk_people_import_report(role_key: str, adult_only: bool = False) -> Optional[dict[str, Any]]:
    storage_key = _bulk_people_report_key(role_key, adult_only)
    with bulk_people_import_reports_lock:
        report = bulk_people_import_reports.get(storage_key)
        return dict(report) if report else None


def _run_bulk_people_import_job(raw_text: str, role: str, adult_only: bool = False):
    db = Session()
    role_key = role.lower()
    try:
        from app.api.tmdb_client import TMDBClient
        from app.scanner.scanner_manager import update_scan_status

        tmdb = TMDBClient(db)
        language = _preferred_person_languages(db)[0]
        valid_rows = []
        ignored_rows = []
        for line_number, raw_line in enumerate((raw_text or "").splitlines(), start=1):
            stripped = raw_line.strip()
            if stripped:
                valid_rows.append({"line_number": line_number, "raw": raw_line, "name": stripped})
            elif raw_line:
                ignored_rows.append({"line_number": line_number, "raw": raw_line, "reason": "empty"})

        total_rows = len(valid_rows)
        added = []
        already_in_library = []
        multiple_matches = []
        no_match = []

        # Fetch adult gender preference
        adult_pref = "all"
        if adult_only:
            adult_pref_setting = db.query(UserSetting).filter(UserSetting.key == "adult_gender_preference").first()
            if adult_pref_setting and adult_pref_setting.value:
                adult_pref = str(adult_pref_setting.value).strip().lower()

        for index, row in enumerate(valid_rows, start=1):
            update_scan_status({
                "phase": "people_importing",
                "current": index - 1,
                "total": total_rows,
                "message": f"{index - 1}/{total_rows}",
                "current_item": row["name"],
                "people_role": role_key,
                "people_adult_only": adult_only,
            })

            results = tmdb.search_person(query=row["name"], language=language) or []
            if adult_only:
                results = [result for result in results if bool(result.get("adult"))]
                if adult_pref == "female":
                    results = [r for r in results if r.get("gender") == 1]
                elif adult_pref == "male":
                    results = [r for r in results if r.get("gender") == 2]
            match = _pick_bulk_person_match(results, row["name"], role)
            if match["status"] == "matched":
                person, activated = _add_person_from_tmdb_internal(db, int(match["result"]["id"]))
                serialized = _serialize_person_summary(db, person, language)
                if activated:
                    added.append(serialized)
                else:
                    already_in_library.append({
                        "line_number": row["line_number"],
                        "raw": row["raw"],
                        "person": serialized,
                    })
            elif match["status"] == "multiple":
                multiple_matches.append({
                    "line_number": row["line_number"],
                    "raw": row["raw"],
                    "candidate_count": len(match["results"]),
                    "candidates": [
                        {
                            "id": candidate.get("id"),
                            "name": candidate.get("name"),
                            "profile_path": candidate.get("profile_path"),
                            "known_for_department": candidate.get("known_for_department"),
                            "known_for": [
                                item.get("title") or item.get("name")
                                for item in candidate.get("known_for") or []
                                if item.get("title") or item.get("name")
                            ][:2]
                        }
                        for candidate in match["results"][:10]
                    ],
                })
            else:
                no_match.append({
                    "line_number": row["line_number"],
                    "raw": row["raw"],
                })

            update_scan_status({
                "phase": "people_importing",
                "current": index,
                "total": total_rows,
                "message": f"{index}/{total_rows}",
                "current_item": row["name"],
                "people_role": role_key,
                "people_adult_only": adult_only,
            })

        report = {
            "total_lines": len((raw_text or "").splitlines()),
            "parsed_lines": len(valid_rows),
            "added_count": len(added),
            "already_in_library_count": len(already_in_library),
            "multiple_match_count": len(multiple_matches),
            "no_match_count": len(no_match),
            "ignored_count": len(ignored_rows),
            "added": added,
            "already_in_library": already_in_library,
            "multiple_matches": multiple_matches,
            "no_match": no_match,
            "ignored": ignored_rows,
            "finished_at": time.time(),
        }
        _store_bulk_people_import_report(role_key, {"status": "completed", "role": role_key, "adult_only": adult_only, "report": report}, adult_only=adult_only)
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk importing people: {e}")
        import traceback
        logger.error(traceback.format_exc())
        _store_bulk_people_import_report(role_key, {"status": "failed", "role": role_key, "adult_only": adult_only, "error": str(e), "finished_at": time.time()}, adult_only=adult_only)
    finally:
        from app.scanner.scanner_manager import update_scan_status
        update_scan_status({
            "active": False,
            "phase": "idle",
            "current": 0,
            "total": 0,
            "message": "",
            "current_item": "",
            "people_role": None,
            "people_adult_only": None,
        })
        db.close()


from app.services.language_service import LanguageService
from app.utils.library_utils import _preferred_metadata_language, _match_language_code


def _pick_person_localization(person, preferred_lang: Optional[str]):
    if not person or not person.localizations:
        return None
    locales = [preferred_lang] if preferred_lang else []
    return LanguageService.pick_localization(person.localizations, locales)


def _pick_match_localization(localizations, preferred_lang: Optional[str]):
    if not localizations:
        return None
    locales = [preferred_lang] if preferred_lang else []
    return LanguageService.pick_localization(localizations, locales)


def _is_remote_image_path(path: Optional[str]) -> bool:
    return bool(path and (path.startswith("http://") or path.startswith("https://")))


_IMAGE_EXISTENCE_CACHE = {}

def _public_image_path(path: Optional[str], subfolder: str) -> Optional[str]:
    """Returns the /filename form the frontend expects, if the local file exists."""
    if not path:
        return None
    if _is_remote_image_path(path):
        return path

    import time
    cache_key = (path, subfolder)
    now = time.time()
    if cache_key in _IMAGE_EXISTENCE_CACHE:
        val, expiry = _IMAGE_EXISTENCE_CACHE[cache_key]
        if now < expiry:
            return val

    clean_path = path.replace("\\", "/")
    marker = f"media/images/{subfolder}/"
    filename = clean_path.split(marker, 1)[1] if marker in clean_path else clean_path.lstrip("/")
    local_file = MEDIA_IMAGE_ROOT / subfolder / filename
    
    res = None
    if local_file.exists() and local_file.stat().st_size > 100:
        res = f"/{filename}"
        
    _IMAGE_EXISTENCE_CACHE[cache_key] = (res, now + 15)
    return res


def _has_local_image(path: Optional[str], subfolder: str) -> bool:
    return _public_image_path(path, subfolder) is not None

def _resolve_person_profile_path(person) -> Optional[str]:
    """Resolves the best profile path to return for a person, prioritizing custom and local images."""
    if not person:
        return None
    local_path = _public_image_path(getattr(person, "manual_local_profile_path", None), "persons")
    if local_path:
        return local_path
    manual_path = _public_image_path(getattr(person, "manual_profile_path", None), "persons")
    if manual_path:
        return manual_path
    if getattr(person, "manual_profile_path", None):
        return person.manual_profile_path
    local_path = _public_image_path(person.local_profile_path, "persons")
    if local_path:
        return local_path
    profile_path = _public_image_path(person.profile_path, "persons")
    if profile_path:
        return profile_path
    return person.profile_path

def _get_or_create_person_db(db, person_id: int) -> Optional[Person]:
    """Retrieves a person from the DB, or dynamically fetches and ingests them from TMDB if not present."""
    from app.db.models import Person
    person = db.query(Person).filter(Person.id == person_id).first()
    if person:
        return person
        
    try:
        from app.api.tmdb_client import TMDBClient
        from app.services.person_service import PersonService
        from app.db.models import UserSetting

        primary_lang = db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
        fallback_lang = db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()
        
        langs = []
        if primary_lang and primary_lang.value:
            langs.append(primary_lang.value)
        if fallback_lang and fallback_lang.value and fallback_lang.value not in langs:
            langs.append(fallback_lang.value)
        if not langs:
            langs = ["en-US"]
        
        client = TMDBClient(db)
        person_service = PersonService(db)
        
        tmdb_data = client.get_person_details(person_id, language=langs[0])
        if tmdb_data and "id" in tmdb_data:
            person = person_service.get_or_create_person(tmdb_data)
            person.is_active = True
            db.commit()
            
            person_service.enrich_person_metadata(person.id, languages=langs)
            
            # Re-query
            person = db.query(Person).filter(Person.id == person_id).first()
            return person
    except Exception as e:
        logger.error(f"Failed to auto-ingest person {person_id} from TMDB: {e}")
        db.rollback()
        
    return None


def _download_person_detail_assets(profile_path: Optional[str], images: Optional[list], movies: list, series: list, backdrop_path: Optional[str] = None) -> None:
    """Downloads profile and credit posters in the background."""
    from concurrent.futures import ThreadPoolExecutor
    from app.services.asset_service import AssetService

    tasks = []
    if profile_path and not _is_remote_image_path(profile_path) and not _public_image_path(profile_path, "persons"):
        tasks.append(("persons", profile_path, PERSON_SIZE))

    for img in images or []:
        if img and not _is_remote_image_path(img) and not _public_image_path(img, "persons"):
            tasks.append(("persons", img, PERSON_SIZE))

    for item in [*(movies or []), *(series or [])]:
        poster_path = item.get("poster_path")
        if poster_path and not _is_remote_image_path(poster_path) and not _public_image_path(poster_path, "posters"):
            tasks.append(("posters", poster_path, POSTER_SIZE))

    if backdrop_path and not _is_remote_image_path(backdrop_path) and not _public_image_path(backdrop_path, "backdrops"):
        tasks.append(("backdrops", backdrop_path, BACKDROP_SIZE))

    if not tasks:
        return

    seen = set()
    unique_tasks = []
    for task in tasks:
        key = (task[0], task[1])
        if key in seen:
            continue
        seen.add(key)
        unique_tasks.append(task)

    asset_service = AssetService()

    def _download_task(args):
        subfolder, tmdb_path, size = args
        try:
            asset_service.download_image(tmdb_path, subfolder, size=size)
        except Exception as e:
            logger.error(f"Failed sync person detail asset download ({tmdb_path}): {e}")

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(_download_task, unique_tasks))

