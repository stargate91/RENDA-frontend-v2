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

from app.db.base import Session
from app.db.models import *
from app.utils.people_utils import *
from app.utils.people_utils import _run_bulk_people_import_job, _get_bulk_people_import_report
from app.services.people_service import *

logger = logging.getLogger(__name__)

router = APIRouter()


def _normalize_bulk_people_role(value: str | None) -> str | None:
    normalized = str(value or "").strip().lower()
    if normalized in {"all", "all people", "people"}:
        return "all"
    if normalized in {"actor", "actors"}:
        return "actor"
    if normalized in {"director", "directors", "creator", "creators"}:
        return "director"
    if normalized in {"writer", "writers"}:
        return "writer"
    return None

@router.post("/people/bulk-import")
def bulk_import_people(payload: dict):
    from app.scanner.scanner_manager import scan_status, scan_status_lock, update_scan_status

    raw_text = str(payload.get("raw_text") or "")
    normalized_role = _normalize_bulk_people_role(payload.get("role"))
    adult_only = bool(payload.get("adult_only"))
    if normalized_role is None:
        return JSONResponse(status_code=400, content={"error": "Invalid role"})
    role = normalized_role.title() if normalized_role != "all" else "all"
    if not raw_text.strip():
        return JSONResponse(status_code=400, content={"error": "raw_text is required"})

    with scan_status_lock:
        if scan_status.get("active"):
            return JSONResponse(status_code=400, content={"error": f"Task already in progress: {scan_status.get('phase', 'unknown')}"})

    update_scan_status({
        "active": True,
        "phase": "people_importing",
        "current": 0,
        "total": 0,
        "message": "",
        "current_item": "",
        "start_time": time.time(),
        "people_role": role.lower(),
        "people_adult_only": adult_only,
    })

    threading.Thread(target=_run_bulk_people_import_job, args=(raw_text, role, adult_only), daemon=True).start()
    return {"status": "started", "role": role.lower()}


@router.get("/people/bulk-import-report")
def get_bulk_people_import_report(role: str, adult_only: bool = False):
    role_key = _normalize_bulk_people_role(role)
    if role_key is None:
        return JSONResponse(status_code=400, content={"error": "Invalid role"})
    report = _get_bulk_people_import_report(role_key, adult_only=adult_only)
    if not report:
        return {"status": "idle", "role": role_key, "adult_only": adult_only}
    return report

