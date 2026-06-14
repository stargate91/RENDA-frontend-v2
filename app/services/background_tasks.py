import threading
import time
from app.db.base import Session as DbSession
from app.scanner.image_worker import ImageWorker
from app.services.omdb_queue_service import OMDBQueueService
from app.utils.logger import logger

_image_worker_thread = None
_omdb_worker_thread = None
_stop_event = threading.Event()

def run_image_worker_loop():
    logger.info("Global Background ImageWorker loop starting...")
    while not _stop_event.is_set():
        local_db = DbSession()
        try:
            iw = ImageWorker(local_db, "./data")
            iw.process_all(max_workers=6)
            
            # Auto-trigger people hydrator to enrich details & profiles for new cast members
            try:
                from app.scanner.people_hydrator import people_hydrator
                people_hydrator.start()
            except Exception as hyd_err:
                logger.error(f"Failed to auto-start people hydrator: {hyd_err}")
        except Exception as e:
            logger.error(f"Global ImageWorker loop error: {e}")
        finally:
            local_db.close()
            DbSession.remove()
        
        # Sleep in small increments to allow fast shutdown
        for _ in range(10):
            if _stop_event.is_set():
                break
            time.sleep(0.5)
            
    logger.info("Global Background ImageWorker loop stopped.")


def run_omdb_worker_loop():
    logger.info("Global Background OMDb queue loop starting...")
    while not _stop_event.is_set():
        local_db = DbSession()
        try:
            OMDBQueueService(local_db).process_pending()
        except Exception as e:
            logger.error(f"Global OMDb queue loop error: {e}")
        finally:
            local_db.close()
            DbSession.remove()

        for _ in range(120):
            if _stop_event.is_set():
                break
            time.sleep(0.5)

    logger.info("Global Background OMDb queue loop stopped.")

def start_background_workers():
    global _image_worker_thread, _omdb_worker_thread
    if _image_worker_thread is None or not _image_worker_thread.is_alive():
        _stop_event.clear()
        _image_worker_thread = threading.Thread(target=run_image_worker_loop, daemon=True)
        _image_worker_thread.start()
    if _omdb_worker_thread is None or not _omdb_worker_thread.is_alive():
        _stop_event.clear()
        _omdb_worker_thread = threading.Thread(target=run_omdb_worker_loop, daemon=True)
        _omdb_worker_thread.start()
        
    try:
        from app.services.watchdog_service import start_watchdog
        start_watchdog()
    except Exception as e:
        logger.error(f"Failed to start watchdog: {e}")

def stop_background_workers():
    _stop_event.set()
    if _image_worker_thread:
        _image_worker_thread.join(timeout=5)
    if _omdb_worker_thread:
        _omdb_worker_thread.join(timeout=5)
        
    try:
        from app.services.watchdog_service import stop_watchdog
        stop_watchdog()
    except Exception as e:
        logger.error(f"Failed to stop watchdog: {e}")
