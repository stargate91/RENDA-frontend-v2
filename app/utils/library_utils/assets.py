import os
import logging
from typing import Optional
from sqlalchemy.exc import IntegrityError

from app.db.models import Person, PersonLocalization, ImageStatus
from app.utils.library_utils.database import _resolve_person_profile_path
from app.utils.library_utils.image_constants import BACKDROP_SIZE, LOGO_SIZE, PERSON_SIZE, POSTER_SIZE, STILL_SIZE

logger = logging.getLogger(__name__)

def _fetch_tv_season_detail(tmdb_client, series_id: int, season_number: int, language: str) -> dict:
    detail = {}
    try:
        detail = tmdb_client.get_season_details(series_id, season_number, language=language) or {}
    except Exception:
        detail = {}

    if not detail.get("episodes"):
        try:
            fallback = tmdb_client.get_season_details(series_id, season_number, language="en-US") or {}
            if fallback.get("episodes"):
                detail = fallback
        except Exception:
            pass

    return detail if isinstance(detail, dict) else {}


def _download_media_assets_sync(
    poster_path: Optional[str] = None,
    backdrop_path: Optional[str] = None,
    logo_path: Optional[str] = None,
    cast_profiles: Optional[list] = None,
    season_posters: Optional[list] = None,
    stills: Optional[list] = None
):
    """
    Downloads media assets in parallel using ThreadPoolExecutor.
    Blocks until all downloads are completed or timed out.
    """
    from concurrent.futures import ThreadPoolExecutor
    from app.services.asset_service import AssetService
    
    asset_service = AssetService()
    tasks = []
    
    # 1. Poster
    if poster_path and not poster_path.startswith("http"):
        tasks.append(("posters", poster_path, POSTER_SIZE))
        
    # 2. Backdrop
    if backdrop_path and not backdrop_path.startswith("http"):
        tasks.append(("backdrops", backdrop_path, BACKDROP_SIZE))

    # 2.5. Logo
    if logo_path and not logo_path.startswith("http"):
        tasks.append(("logos", logo_path, LOGO_SIZE))
        
    # 3. Cast/Crew profiles
    if cast_profiles:
        for profile in cast_profiles:
            if profile and not profile.startswith("http"):
                tasks.append(("persons", profile, PERSON_SIZE))
                
    # 4. Season posters
    if season_posters:
        for sp in season_posters:
            if sp and not sp.startswith("http"):
                tasks.append(("posters", sp, POSTER_SIZE))

    if stills:
        for still in stills:
            if still and not still.startswith("http"):
                tasks.append(("stills", still, STILL_SIZE))

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

    def _download_task(args):
        import time
        subfolder, tmdb_path, size = args
        for attempt in range(3):
            try:
                if asset_service.download_image(tmdb_path, subfolder, size=size):
                    return
            except Exception as e:
                if attempt == 2:
                    logger.warning(f"Failed sync download of {tmdb_path} to {subfolder}: {e}")
            time.sleep(0.35 * (attempt + 1))
        logger.warning(f"Sync download missing after retries: {tmdb_path} -> {subfolder}")

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(_download_task, unique_tasks))


def _ensure_person_cached(db, actor_id: int, actor_name: str, actor_profile_path: Optional[str], actor_popularity: Optional[float], ui_lang: str) -> Optional[str]:
    """
    Checks if a person exists in the database. If not, creates them with ImageStatus.PENDING so they get cached by the ImageWorker.
    Returns the local profile path if already downloaded, or the TMDB URL if pending.
    """
    if not actor_profile_path:
        return None

    lang_code = ui_lang.split("-")[0] if ui_lang else "en"

    person = db.query(Person).filter(Person.id == actor_id).first()
    if not person:
        try:
            person = Person(
                id=actor_id,
                popularity=actor_popularity,
                profile_path=actor_profile_path,
                image_status=ImageStatus.PENDING,
                is_active=False
            )
            
            # If the image was downloaded synchronously, mark as downloaded immediately
            if actor_profile_path:
                local_file_path = os.path.join("data", "media", "images", "persons", actor_profile_path.lstrip("/"))
                if os.path.exists(local_file_path):
                    person.local_profile_path = actor_profile_path
                    person.image_status = ImageStatus.COMPLETED

            db.add(person)
            db.add(PersonLocalization(person_id=actor_id, locale=lang_code, name=actor_name))
            db.commit()
        except IntegrityError:
            db.rollback()
            person = db.query(Person).filter(Person.id == actor_id).first()
            if not person:
                logger.warning(f"Person insert raced but existing row was not found: {actor_id}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating virtual Person: {e}")
            person = db.query(Person).filter(Person.id == actor_id).first()

    if person:
        updated = False
        if not person.profile_path and actor_profile_path:
            person.profile_path = actor_profile_path
            person.image_status = ImageStatus.PENDING
            updated = True
        elif person.image_status == ImageStatus.FAILED and actor_profile_path:
            person.image_status = ImageStatus.PENDING
            updated = True
        
        # If image was downloaded synchronously, update local profile path and status
        if person.profile_path and person.image_status != ImageStatus.COMPLETED:
            local_file_path = os.path.join("data", "media", "images", "persons", person.profile_path.lstrip("/"))
            if os.path.exists(local_file_path):
                person.local_profile_path = person.profile_path
                person.image_status = ImageStatus.COMPLETED
                updated = True

        if actor_name and not db.query(PersonLocalization.id).filter(
            PersonLocalization.person_id == actor_id,
            PersonLocalization.locale == lang_code,
        ).first():
            db.add(PersonLocalization(person_id=actor_id, locale=lang_code, name=actor_name))
            updated = True

        if updated:
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error updating Person profile: {e}")

    # Check if local image is available
    resolved = _resolve_person_profile_path(person)
    if resolved:
        if resolved.startswith("http://") or resolved.startswith("https://") or resolved.startswith("/"):
            return resolved
        return f"/{resolved.lstrip('/')}"
            
    return None
