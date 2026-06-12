import threading
import logging
import time
from typing import Dict, Any, List, Callable
from app.db.base import Session
from app.db.models import Person, UserSetting
from app.services.person_service import PersonService
from app.utils.people_utils import _preferred_person_languages

logger = logging.getLogger(__name__)


class HydrateStatusManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(HydrateStatusManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._status = {
            "active": False,
            "total": 0,
            "current": 0,
            "phase": "idle",
            "message": "",
        }
        self._lock = threading.Lock()
        self._initialized = True

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return self._status.copy()

    def update(self, updates: Dict[str, Any]):
        with self._lock:
            self._status.update(updates)


hydrate_status_manager = HydrateStatusManager()


class PeopleHydrator:
    def __init__(self):
        self._thread = None
        self._stop_event = threading.Event()

    def is_running(self):
        return self._thread and self._thread.is_alive()

    def start(self):
        if self.is_running():
            return
        self._stop_event.clear()

        # Double check setting
        db = Session()
        try:
            setting = db.query(UserSetting).filter(UserSetting.key == "auto_hydrate_inactive_people").first()
            if not setting or str(setting.value).lower() not in ("true", "1"):
                return
        finally:
            db.close()

        self._thread = threading.Thread(target=self._hydrate_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()

    def _hydrate_loop(self):
        db = Session()
        try:
            persons = db.query(Person.id).filter(
                Person.is_active == False,
                (Person.fetched_languages == None) | (Person.fetched_languages == "")
            ).all()

            total = len(persons)
            if total == 0:
                hydrate_status_manager.update({"active": False, "phase": "idle", "current": 0, "total": 0, "message": ""})
                return

            hydrate_status_manager.update({
                "active": True,
                "phase": "people_enriching",
                "total": total,
                "current": 0,
                "message": "",
            })

            person_service = PersonService(db)
            langs = _preferred_person_languages(db)

            for idx, (p_id,) in enumerate(persons):
                if self._stop_event.is_set():
                    logger.info("People hydrator stopped by request.")
                    break
                try:
                    person_service.enrich_person_metadata(p_id, langs)
                except Exception as e:
                    logger.error(f"Error hydrating person {p_id}: {e}")

                hydrate_status_manager.update({
                    "current": idx + 1
                })

                # Check multiple times during sleep for fast abort
                for _ in range(3):
                    if self._stop_event.is_set():
                        break
                    time.sleep(0.1)

        except Exception as e:
            logger.error(f"Error in people hydrator loop: {e}")
        finally:
            hydrate_status_manager.update({
                "active": False,
                "phase": "idle",
                "current": 0,
                "total": 0,
                "message": ""
            })
            db.close()


people_hydrator = PeopleHydrator()
