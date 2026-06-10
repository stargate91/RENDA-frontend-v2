from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.db.base import Session
from app.db.models import MediaItem, ItemStatus, ExtraFile
from app.renamer.renamer_engine import RenamerEngine
from app.scanner.scanner_manager import scan_status, scan_status_lock
from app.scanner.status import is_scan_stop_requested, update_scan_status
from app.formatter.formatter import Formatter, FormatterConfig
import time
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class RenameRequest(BaseModel):
    item_ids: Optional[List[int]] = None

def run_organize_task(item_ids: Optional[List[int]] = None):
    """Background task for physical renaming and organization."""
    db = Session()
    global scan_status
    try:
        engine = RenamerEngine(db)
        formatter = Formatter(FormatterConfig.from_db(db))
        
        # Get all identified items that are NOT yet renamed
        query = db.query(MediaItem).filter(
            MediaItem.status == ItemStatus.MATCHED
        )
        if item_ids is not None:
            query = query.filter(MediaItem.id.in_(item_ids))
        items = query.all()
        
        if not items:
            scan_status["active"] = False
            return

        # Create a batch for this operation
        from app.db.models import ActionBatch
        batch = ActionBatch(name=f"Organize {len(items)} items")
        db.add(batch)
        db.commit()

        scan_status.update({
            "active": True,
            "phase": "organizing",
            "current": 0,
            "total": len(items),
            "start_time": time.time(),
            "can_stop": True,
            "stop_requested": False,
        })

        for item in items:
            if is_scan_stop_requested():
                logger.info("Organize stop requested.")
                break
            # Re-calculate planned path to be sure it's up to date
            active_match = next((m for m in item.matches if m.is_active), None)
            if not active_match:
                scan_status["current"] += 1
                continue
            
            import os
            dest_root = formatter.config.library_path if formatter.config.move_to_library and formatter.config.library_path else os.path.dirname(item.current_path)
            preview = formatter.plan_rename(active_match, dest_root)
            
            def progress_cb(pct):
                scan_status["current_file_progress"] = pct
                
            scan_status["current_file_progress"] = 0.0
            
            # Execute physical move
            # execute_single handles the DB update and extras too
            success = engine.execute_single(preview, batch.id, progress_callback=progress_cb)
            
            scan_status["current"] += 1
            scan_status["current_file_progress"] = 0.0
            
            if not success:
                logger.error(f"Failed to organize item: {item.filename}")

        logger.info("Library organization complete.")
    except Exception as e:
        import traceback
        logger.error(f"Organize task failed: {e}")
        logger.error(traceback.format_exc())
    finally:
        scan_status["active"] = False
        scan_status["phase"] = "idle"
        scan_status["can_stop"] = False
        scan_status["stop_requested"] = False
        db.close()

@router.post("/rename/start")
def start_rename(background_tasks: BackgroundTasks, request: Optional[RenameRequest] = None):
    """Triggers the organization process for matched items."""
    db = Session()
    try:
        item_ids = request.item_ids if request else None
        
        query = db.query(MediaItem).filter(MediaItem.status == ItemStatus.MATCHED)
        if item_ids is not None:
            query = query.filter(MediaItem.id.in_(item_ids))
            
        matched_count = query.count()
        if matched_count == 0:
            return {"status": "error", "message": "No matched items to organize"}

        with scan_status_lock:
            if scan_status.get("active"):
                raise HTTPException(status_code=400, detail=f"Task already in progress: {scan_status.get('phase', 'unknown')}")
            scan_status.update({
                "active": True,
                "phase": "organizing",
                "current": 0,
                "total": matched_count,
                "start_time": time.time(),
                "can_stop": True,
                "stop_requested": False,
            })

        background_tasks.add_task(run_organize_task, item_ids)
        return {"status": "success", "message": f"Organizing {matched_count} items"}
    finally:
        db.close()

@router.get("/history")
def get_history():
    """Returns a list of past organization batches and their logs."""
    db = Session()
    try:
        from app.db.models import ActionBatch, ActionLog, ActionStatus
        from sqlalchemy import desc, func
        
        batches = db.query(ActionBatch).order_by(desc(ActionBatch.created_at)).all()
        
        result = []
        for b in batches:
            success_count = db.query(ActionLog).filter(
                ActionLog.batch_id == b.id, 
                ActionLog.status == ActionStatus.SUCCESS
            ).count()
            
            failed_count = db.query(ActionLog).filter(
                ActionLog.batch_id == b.id, 
                ActionLog.status == ActionStatus.FAILED
            ).count()

            result.append({
                "id": b.id,
                "name": b.name or f"Batch #{b.id}",
                "created_at": b.created_at.isoformat() + "Z",
                "success_count": success_count,
                "failed_count": failed_count,
                "status": "undone" if (success_count == 0 and failed_count == 0) else "completed" if failed_count == 0 else "partial"
            })
            
        return result
    finally:
        db.close()

def run_undo_task(batch_id: int):
    db = Session()
    global scan_status
    try:
        scan_status.update({
            "active": True,
            "phase": "undoing", # Changed from wiping to undoing to avoid frontend fake progress conflicts
            "current": 0,
            "total": 1,
            "start_time": time.time(),
            "can_stop": True,
            "stop_requested": False,
        })
        engine = RenamerEngine(db)
        
        def progress_cb(current, total):
            scan_status["current"] = current
            scan_status["total"] = total
            
        undo_count = engine.undo_batch(batch_id, progress_callback=progress_cb, stop_check=is_scan_stop_requested)
        logger.info(f"Undo complete. Reverted {undo_count} items.")
    except Exception as e:
        logger.error(f"Undo task failed: {e}")
    finally:
        scan_status["active"] = False
        scan_status["phase"] = "idle"
        scan_status["can_stop"] = False
        scan_status["stop_requested"] = False
        db.close()

@router.post("/rename/undo/{batch_id}")
def undo_rename(batch_id: int, background_tasks: BackgroundTasks):
    """Reverts a past organization batch in the background."""
    with scan_status_lock:
        if scan_status.get("active"):
            raise HTTPException(status_code=400, detail=f"Task already in progress: {scan_status.get('phase', 'unknown')}")
        scan_status.update({
            "active": True,
            "phase": "undoing",
            "current": 0,
            "total": 1,
            "start_time": time.time(),
            "can_stop": True,
            "stop_requested": False,
        })
        
    background_tasks.add_task(run_undo_task, batch_id)
    return {"status": "success", "message": "Reverting batch in background"}
