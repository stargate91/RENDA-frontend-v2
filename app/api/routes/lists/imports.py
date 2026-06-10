import time
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from app.db.base import Session as DBSession
from app.db.models.media import CustomList
from app.scanner.scanner_manager import scan_status, scan_status_lock
from app.utils.lists_utils import _parse_bulk_import_rows
from app.services.lists_service import _run_bulk_import_job, _get_bulk_import_report, _store_bulk_import_report

router = APIRouter()

@router.post("/lists/{list_id}/items/bulk-import")
def bulk_import_items_to_list(list_id: int, payload: dict, background_tasks: BackgroundTasks):
    db = DBSession()
    try:
        custom_list = db.query(CustomList).filter(CustomList.id == list_id).first()
        if not custom_list:
            return JSONResponse(status_code=404, content={"error": "List not found"})

        raw_text = payload.get("raw_text", "")
        language = (payload.get("language") or "en-US").strip() or "en-US"
        valid_rows, ignored_rows = _parse_bulk_import_rows(raw_text)
        if not valid_rows and ignored_rows:
            _store_bulk_import_report(list_id, {
                "status": "completed",
                "list_id": list_id,
                "added_items": [],
                "report": {
                    "total_lines": len((raw_text or "").splitlines()),
                    "parsed_lines": 0,
                    "added_count": 0,
                    "already_in_list_count": 0,
                    "ignored_count": len(ignored_rows),
                    "no_match_count": 0,
                    "multiple_match_count": 0,
                    "ignored": ignored_rows,
                    "already_in_list": [],
                    "no_match": [],
                    "multiple_matches": [],
                    "finished_at": time.time(),
                }
            })
            return {"status": "completed", "started": False}

        with scan_status_lock:
            if scan_status.get("active"):
                raise HTTPException(status_code=400, detail=f"Task already in progress: {scan_status.get('phase', 'unknown')}")
            scan_status.update({
                "active": True,
                "phase": "importing",
                "current": 0,
                "total": len(valid_rows),
                "start_time": time.time(),
                "message": f"0/{len(valid_rows)}",
                "current_item": "",
                "list_id": list_id,
                "can_stop": True,
                "stop_requested": False,
            })

        _store_bulk_import_report(list_id, {
            "status": "running",
            "list_id": list_id,
            "started_at": time.time(),
        })
        background_tasks.add_task(_run_bulk_import_job, list_id, raw_text, language)
        return {"status": "started", "started": True, "parsed_lines": len(valid_rows), "ignored_count": len(ignored_rows)}
    finally:
        db.close()

@router.get("/lists/{list_id}/items/bulk-import-report")
def get_bulk_import_report(list_id: int):
    report = _get_bulk_import_report(list_id)
    if not report:
        return {"status": "idle", "list_id": list_id}
    return report
