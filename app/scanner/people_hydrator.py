import threading
import logging
import time
import concurrent.futures
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
    BATCH_SIZE = 200
    MAX_WORKERS = 6

    def __init__(self):
        self._thread = None
        self._stop_event = threading.Event()
        self._invalid_key = None

    def is_running(self):
        return self._thread and self._thread.is_alive()

    def start(self):
        if self.is_running():
            return

        # Prevent concurrent execution with the main scan task to avoid DB lock and network contention
        from app.scanner.scanner_manager import scan_status
        if scan_status.get("active"):
            return

        # Check TMDB API key to prevent loops on invalid/missing keys
        db = Session()
        try:
            setting = db.query(UserSetting).filter(UserSetting.key == "tmdb_api_key").first()
            current_key = setting.value if setting else ""
            if not current_key:
                return
            if self._invalid_key == current_key:
                return
        except Exception:
            pass
        finally:
            db.close()
            Session.remove()

        self._stop_event.clear()

        self._thread = threading.Thread(target=self._hydrate_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()

    def _scan_is_active(self) -> bool:
        try:
            from app.scanner.status import get_scan_status
            return bool(get_scan_status().get("active"))
        except Exception:
            return False

    def _wait_while_scan_active(self, current_count: int, total: int) -> bool:
        paused = False
        while not self._stop_event.is_set() and self._scan_is_active():
            if not paused:
                hydrate_status_manager.update({
                    "active": True,
                    "phase": "paused_for_scan",
                    "current": current_count,
                    "total": total,
                    "message": "Waiting for scan to finish...",
                })
                paused = True
            time.sleep(0.5)

        if self._stop_event.is_set():
            return False

        if paused:
            hydrate_status_manager.update({
                "active": True,
                "phase": "people_enriching",
                "current": current_count,
                "total": total,
                "message": "",
            })
        return True

    def _load_pending_people_batch(self) -> tuple[list[int], list[str], int]:
        db = Session()
        try:
            query = db.query(Person.id).filter(
                Person.is_active == False,
                (Person.fetched_languages == None) | (Person.fetched_languages == "")
            )
            total_pending = query.count()
            batch_ids = [person_id for (person_id,) in query.limit(self.BATCH_SIZE).all()]
            langs = _preferred_person_languages(db)
            return batch_ids, langs, total_pending
        finally:
            db.close()
            Session.remove()

    def _hydrate_loop(self):
        try:
            current_count = 0
            total = 0
            
            def enrich_single(p_id, langs):
                if self._stop_event.is_set():
                    return
                temp_db = Session()
                try:
                    person_service = PersonService(temp_db)
                    person_service.enrich_person_metadata(p_id, langs)
                except Exception as e:
                    logger.error(f"Error hydrating person {p_id}: {e}")
                    is_auth_error = False
                    if isinstance(e, ValueError) and "API key is missing" in str(e):
                        is_auth_error = True
                    elif hasattr(e, "response") and e.response is not None and e.response.status_code == 401:
                        is_auth_error = True
                    
                    if is_auth_error:
                        setting = temp_db.query(UserSetting).filter(UserSetting.key == "tmdb_api_key").first()
                        failed_key = setting.value if setting else ""
                        self._invalid_key = failed_key
                        logger.warning("Aborting people hydration: TMDB API key is invalid/missing. Will not retry until settings change.")
                        self._stop_event.set()
                finally:
                    temp_db.close()
                    Session.remove()

            while not self._stop_event.is_set():
                if not self._wait_while_scan_active(current_count, total):
                    break

                try:
                    person_ids, langs, total_pending = self._load_pending_people_batch()
                except Exception as e:
                    logger.error(f"Error initializing people hydrator query: {e}")
                    break

                if not person_ids:
                    if total_pending == 0:
                        break
                    time.sleep(0.5)
                    continue

                total = max(total, current_count + total_pending)
                hydrate_status_manager.update({
                    "active": True,
                    "phase": "people_enriching",
                    "total": total,
                    "current": current_count,
                    "message": "",
                })

                max_workers = min(self.MAX_WORKERS, len(person_ids))
                person_iter = iter(person_ids)
                with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                    future_to_person = {}

                    while not self._stop_event.is_set():
                        if not self._wait_while_scan_active(current_count, total):
                            break

                        while len(future_to_person) < max_workers:
                            try:
                                person_id = next(person_iter)
                            except StopIteration:
                                break
                            future = executor.submit(enrich_single, person_id, langs)
                            future_to_person[future] = person_id

                        if not future_to_person:
                            break

                        done, _pending = concurrent.futures.wait(
                            set(future_to_person.keys()),
                            return_when=concurrent.futures.FIRST_COMPLETED,
                        )

                        for future in done:
                            future.result()
                            future_to_person.pop(future, None)
                            current_count += 1
                            hydrate_status_manager.update({
                                "active": True,
                                "phase": "people_enriching",
                                "current": current_count,
                                "total": max(total, current_count),
                                "message": "",
                            })

                    if self._stop_event.is_set():
                        for future in future_to_person:
                            future.cancel()
                        logger.info("People hydrator stopped by request.")

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


people_hydrator = PeopleHydrator()
