import logging
import time
import traceback
from typing import List, Dict, Any
from fastapi import BackgroundTasks
from app.db.base import Session
from app.db.models import UserSetting, MediaMatch, Person, ImageStatus
from app.scanner.scanner_manager import ScannerManager
from app.scanner.status import scan_status

logger = logging.getLogger(__name__)

class ScannerService:
    @staticmethod
    def get_scan_status() -> Dict[str, Any]:
        """Returns the current progress of the background scan."""
        return scan_status

    @staticmethod
    def get_image_status(db: Session) -> Dict[str, Any]:
        """Returns the current progress of background image and profile downloads."""
        from app.scanner.status import image_status_manager
        return image_status_manager.get_status(db)

    @staticmethod
    def reset_image_status(db: Session):
        """Forces all pending and downloading image tasks to FAILED to clear a stuck progress bar."""
        db.query(MediaMatch).filter(MediaMatch.image_status.in_([ImageStatus.PENDING, ImageStatus.DOWNLOADING])).update({"image_status": ImageStatus.FAILED}, synchronize_session=False)
        db.query(MediaMatch).filter(MediaMatch.backdrop_status.in_([ImageStatus.PENDING, ImageStatus.DOWNLOADING])).update({"backdrop_status": ImageStatus.FAILED}, synchronize_session=False)
        db.query(Person).filter(Person.image_status.in_([ImageStatus.PENDING, ImageStatus.DOWNLOADING])).update({"image_status": ImageStatus.FAILED}, synchronize_session=False)
        db.commit()

    @staticmethod
    def start_scan(paths: List[str]):
        """Triggers a library scan in the background using TaskManager."""
        from app.utils.task_manager import task_manager
        from app.scanner.status import update_scan_status

        update_scan_status({
            "active": True,
            "phase": "collecting",
            "current": 0,
            "total": 0,
            "start_time": time.time(),
            "message": None
        })
        
        def run_scan():
            logger.info("Background scan task starting...")
            from app.utils.config_manager import config_manager
            from app.db.base import Session
            db = Session()
            try:
                min_duration = config_manager.get_int("min_video_duration_minutes", 12)
                min_size_mb = config_manager.get_int("min_video_size_mb", 50)
                scanner = ScannerManager(
                    db, 
                    min_video_size_mb=min_size_mb, 
                    min_video_duration_minutes=min_duration
                )
                scanner.scan_and_save(paths)
                logger.info("Background scan task completed successfully.")
            except Exception as e:
                logger.error(f"Background scan task failed: {e}")
                logger.error(traceback.format_exc())
            finally:
                Session.remove()
        
        task_manager.run_task("LibraryScan", run_scan)
