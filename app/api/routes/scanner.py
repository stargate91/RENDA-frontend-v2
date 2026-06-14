from fastapi import APIRouter
from app.db.base import Session
from app.db.models import *

router = APIRouter()

from pydantic import BaseModel
from typing import List, Optional
from fastapi import BackgroundTasks, HTTPException
from app.scanner.scanner_manager import ScannerManager, scan_status, scan_status_lock
from app.scanner.status import request_scan_stop

class ScanRequest(BaseModel):
    paths: List[str]
    stop_after: Optional[str] = None

@router.get("/scan-status")
def get_scan_status():
    """Returns the current progress of the background scan."""
    return scan_status


@router.get("/hydrate-status")
def get_hydrate_status():
    """Returns the current progress of the background people hydrator."""
    try:
        from app.scanner.people_hydrator import hydrate_status_manager
        return hydrate_status_manager.get_status()
    except Exception as e:
        return {"active": False, "phase": "idle", "error": str(e)}


@router.get("/image-status")
def get_image_status():
    """Returns the current progress of background image and profile downloads."""
    db = Session()
    try:
        from app.scanner.status import image_status_manager
        return image_status_manager.get_status(db)
    except Exception as e:
        return {"active": False, "pending": 0, "downloading": 0, "total": 0, "completed": 0, "progress": 0, "error": str(e)}
    finally:
        db.close()

@router.post("/reset-image-status")
def reset_image_status():
    """Forces all pending image tasks to FAILED to clear a stuck progress bar."""
    db = Session()
    try:
        db.query(MediaMatch).filter(MediaMatch.image_status == ImageStatus.PENDING).update({"image_status": ImageStatus.FAILED})
        db.query(MediaMatch).filter(MediaMatch.backdrop_status == ImageStatus.PENDING).update({"backdrop_status": ImageStatus.FAILED})
        db.query(Person).filter(Person.image_status == ImageStatus.PENDING).update({"image_status": ImageStatus.FAILED})
        db.commit()
        return {"status": "success", "message": "Image status reset"}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


@router.post("/scan")
def start_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    """Triggers a library scan in the background."""
    from app.utils.logger import logger
    logger.info(f"Received scan request for paths: {request.paths}")
    
    import time
    with scan_status_lock:
        if scan_status.get("active"):
            raise HTTPException(status_code=400, detail=f"Task already in progress: {scan_status.get('phase', 'unknown')}")
        scan_status.update({
            "active": True,
            "phase": "collecting",
            "current": 0,
            "total": 0,
            "start_time": time.time(),
            "can_stop": True,
            "stop_requested": False,
        })
    
    def run_scan():
        logger.info("Background scan task starting...")
        db = Session()
        try:
            min_duration = 12
            min_size = 50
            try:
                setting = db.query(UserSetting).filter(UserSetting.key == "min_video_duration_minutes").first()
                if setting and setting.value: min_duration = int(setting.value)
            except: pass
            try:
                setting_size = db.query(UserSetting).filter(UserSetting.key == "min_video_size_mb").first()
                if setting_size and setting_size.value: min_size = int(setting_size.value)
            except: pass
            
            scanner = ScannerManager(db, min_video_size_mb=min_size, min_video_duration_minutes=min_duration)
            scanner.scan_and_save(request.paths, stop_after=request.stop_after)
            logger.info("Background scan task completed successfully.")
        except Exception as e:
            import traceback
            logger.error(f"Background scan task failed: {e}")
            logger.error(traceback.format_exc())
        finally:
            db.close()
    
    background_tasks.add_task(run_scan)
    return {"message": "Scan started in background", "paths": request.paths}


@router.post("/task/stop")
def stop_active_task(background_tasks: BackgroundTasks):
    from app.scanner.people_hydrator import people_hydrator

    stopped_any = False

    # 1. Stop scanner
    with scan_status_lock:
        if scan_status.get("active") and not scan_status.get("stop_requested"):
            request_scan_stop()
            stopped_any = True

    # 2. Stop people hydrator
    if people_hydrator.is_running():
        people_hydrator.stop()
        stopped_any = True

    # 3. Stop image downloader
    image_status_data = get_image_status()
    if image_status_data.get("active"):
        background_tasks.add_task(reset_image_status)
        stopped_any = True

    if not stopped_any:
        return {"status": "success", "message": "No active tasks to stop or stop already requested"}

    return {"status": "success", "message": "Stop requested"}


