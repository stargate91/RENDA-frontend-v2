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
        
        # 1. MediaMatch tasks (Poster + Backdrop)
        # We only count items that are NOT in NONE state (meaning they have something to download)
        total_posters = db.query(MediaMatch).filter(MediaMatch.image_status != ImageStatus.NONE).count()
        done_posters = db.query(MediaMatch).filter(MediaMatch.image_status.in_([ImageStatus.COMPLETED, ImageStatus.FAILED])).count()
        
        total_backdrops = db.query(MediaMatch).filter(MediaMatch.backdrop_status != ImageStatus.NONE).count()
        done_backdrops = db.query(MediaMatch).filter(MediaMatch.backdrop_status.in_([ImageStatus.COMPLETED, ImageStatus.FAILED])).count()
        
        # 2. Person tasks (Primary Profile + Alternate Images)
        total_profiles = db.query(Person).filter(Person.image_status != ImageStatus.NONE).count()
        done_profiles = db.query(Person).filter(Person.image_status.in_([ImageStatus.COMPLETED, ImageStatus.FAILED])).count()
        
        # Alternates are counted if the person profile is done
        total_alts = done_profiles 
        done_alts = db.query(Person).filter(Person.images != None).count()

        total_tasks = total_posters + total_backdrops + total_profiles + total_alts
        completed_total = done_posters + done_backdrops + done_profiles + done_alts
        
        if total_tasks == 0:
            return {"active": False, "pending": 0, "downloading": 0, "total": 0, "completed": 0, "progress": 0}

        # Ensure completed doesn't exceed total
        completed_total = min(completed_total, total_tasks)
        
        # Active if there are any tasks in PENDING or DOWNLOADING, OR if some alternates haven't started
        active = completed_total < total_tasks
        progress = (completed_total / total_tasks) * 100
        
        # Get the name of the "current" item being processed for the UI
        current_item = None
        if active:
            # Try to find a downloading item first, then a pending one
            current = db.query(MediaMatch).filter(MediaMatch.image_status == ImageStatus.DOWNLOADING).first()
            if not current:
                current = db.query(MediaMatch).filter(MediaMatch.backdrop_status == ImageStatus.DOWNLOADING).first()
            if not current:
                current = db.query(Person).filter(Person.image_status == ImageStatus.DOWNLOADING).first()
            
            if current and hasattr(current, 'media_item') and current.media_item:
                current_item = current.media_item.filename
            elif current and hasattr(current, 'name'):
                current_item = current.name

        return {
            "active": active,
            "pending": total_tasks - completed_total,
            "total": total_tasks,
            "completed": completed_total,
            "progress": progress,
            "current_item": current_item
        }

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
            "start_time": time.time()
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
