import logging
import threading
import time
from typing import Any, Optional

from app.db.base import Session as DBSession
from app.db.models import UserSetting
from app.scanner.scanner_manager import update_scan_status
from app.scanner.status import is_scan_stop_requested
from app.utils.lists_utils import _parse_bulk_import_rows, _pick_bulk_search_match
from app.api.tmdb_client import TMDBClient

from app.services.lists.helpers import (
    _add_or_get_list_item,
    _serialize_list_item,
    _enrich_bulk_media_candidates,
    _build_imported_omdb_payload,
    _upsert_imported_omdb_cache
)

logger = logging.getLogger(__name__)

bulk_import_reports: dict[int, dict[str, Any]] = {}
bulk_import_reports_lock = threading.Lock()


def _store_bulk_import_report(list_id: int, payload: dict[str, Any]):
    with bulk_import_reports_lock:
        bulk_import_reports[list_id] = payload


def _get_bulk_import_report(list_id: int) -> Optional[dict[str, Any]]:
    with bulk_import_reports_lock:
        report = bulk_import_reports.get(list_id)
        return dict(report) if report else None


def _run_bulk_import_job(list_id: int, raw_text: str, language: str):
    db = DBSession()
    try:
        valid_rows, ignored_rows = _parse_bulk_import_rows(raw_text)
        total_rows = len(valid_rows)

        adult_setting = db.query(UserSetting).filter(UserSetting.key == "include_adult").first()
        include_adult = False
        if adult_setting:
            val = adult_setting.value
            include_adult = val.lower() == "true" if isinstance(val, str) else bool(val)

        tmdb = TMDBClient(db)
        added_items = []
        already_in_list = []
        no_match = []
        multiple_matches = []

        for index, row in enumerate(valid_rows, start=1):
            if is_scan_stop_requested():
                _store_bulk_import_report(list_id, {
                    "status": "stopped",
                    "list_id": list_id,
                    "added_items": added_items,
                    "report": {
                        "total_lines": len((raw_text or "").splitlines()),
                        "parsed_lines": total_rows,
                        "added_count": len(added_items),
                        "already_in_list_count": len(already_in_list),
                        "ignored_count": len(ignored_rows),
                        "no_match_count": len(no_match),
                        "multiple_match_count": len(multiple_matches),
                        "ignored": ignored_rows,
                        "already_in_list": already_in_list,
                        "no_match": no_match,
                        "multiple_matches": multiple_matches,
                        "finished_at": time.time(),
                    },
                })
                break
            update_scan_status({
                "phase": "importing",
                "current": index - 1,
                "total": total_rows,
                "message": f"{index - 1}/{total_rows}",
                "current_item": row["raw"],
                "list_id": list_id,
            })

            match = _pick_bulk_search_match(
                tmdb,
                row["title"],
                row["year"],
                row["media_type"],
                include_adult,
            )

            if match["status"] == "no_match":
                no_match.append(row)
            elif match["status"] == "multiple":
                multiple_matches.append({
                    **row,
                    "media_type": match["media_type"],
                    "candidate_count": len(match["results"]),
                    "candidates": _enrich_bulk_media_candidates(db, match["results"], match["media_type"]),
                })
            else:
                result = match["result"]
                media_type = match["media_type"]
                item, created = _add_or_get_list_item(
                    db,
                    list_id,
                    result.get("id"),
                    None,
                    media_type,
                    (result.get("title") or result.get("name") or row["title"]).strip(),
                    result.get("poster_path"),
                    language,
                    False,
                )
                serialized = _serialize_list_item(db, item)
                if created:
                    added_items.append(serialized)
                else:
                    already_in_list.append({
                        "line_number": row["line_number"],
                        "raw": row["raw"],
                        "item": serialized,
                    })

            update_scan_status({
                "current": index,
                "message": f"{index}/{total_rows}",
                "current_item": row["raw"],
                "list_id": list_id,
            })

        db.commit()

        if not is_scan_stop_requested():
            report = {
                "total_lines": len((raw_text or "").splitlines()),
                "parsed_lines": len(valid_rows),
                "added_count": len(added_items),
                "already_in_list_count": len(already_in_list),
                "ignored_count": len(ignored_rows),
                "no_match_count": len(no_match),
                "multiple_match_count": len(multiple_matches),
                "ignored": ignored_rows,
                "already_in_list": already_in_list,
                "no_match": no_match,
                "multiple_matches": multiple_matches,
                "finished_at": time.time(),
            }
            _store_bulk_import_report(list_id, {
                "status": "completed",
                "list_id": list_id,
                "added_items": added_items,
                "report": report,
            })
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk importing list items: {e}")
        _store_bulk_import_report(list_id, {
            "status": "failed",
            "list_id": list_id,
            "error": str(e),
            "finished_at": time.time(),
        })
    finally:
        update_scan_status({
            "active": False,
            "phase": "idle",
            "current": 0,
            "total": 0,
            "message": "",
            "current_item": "",
            "list_id": None,
            "can_stop": False,
            "stop_requested": False,
        })
        db.close()


def _run_list_import_job(list_id: int, raw_items: list, language: Optional[str] = None):
    db = DBSession()
    try:
        total_rows = len(raw_items)
        added_items = []
        already_in_list = []
        for index, raw_item in enumerate(raw_items, start=1):
            if is_scan_stop_requested():
                _store_bulk_import_report(list_id, {
                    "status": "stopped",
                    "list_id": list_id,
                    "added_items": added_items,
                    "report": {
                        "total_lines": total_rows,
                        "parsed_lines": total_rows,
                        "added_count": len(added_items),
                        "already_in_list_count": len(already_in_list),
                        "no_match_count": 0,
                        "multiple_match_count": 0,
                        "ignored_count": 0,
                        "already_in_list": already_in_list,
                        "no_match": [],
                        "multiple_matches": [],
                        "ignored": [],
                        "import_source": "file",
                        "finished_at": time.time(),
                    },
                })
                break
            title = (raw_item.get("title") or "").strip()
            
            update_scan_status({
                "phase": "importing",
                "current": index - 1,
                "total": total_rows,
                "message": f"{index - 1}/{total_rows}",
                "current_item": title,
                "list_id": list_id,
            })
            
            tmdb_id = raw_item.get("tmdb_id")
            media_type = (raw_item.get("media_type") or "movie").strip() or "movie"
            poster_path = raw_item.get("poster_path")
            imported_imdb_id = (raw_item.get("imdb_id") or "").strip()
            imported_omdb_payload = _build_imported_omdb_payload(raw_item)

            if not tmdb_id and not title:
                continue

            if imported_imdb_id and imported_omdb_payload:
                _upsert_imported_omdb_cache(db, imported_imdb_id, imported_omdb_payload)

            item, created = _add_or_get_list_item(
                db,
                list_id,
                tmdb_id,
                None,
                media_type,
                title,
                poster_path,
                language,
                False,
            )
            serialized = _serialize_list_item(db, item)
            if created:
                added_items.append(serialized)
            else:
                already_in_list.append({
                    "line_number": index,
                    "raw": title,
                    "item": serialized,
                })

            update_scan_status({
                "current": index,
                "message": f"{index}/{total_rows}",
                "current_item": title,
                "list_id": list_id,
            })
            
        db.commit()
        
        if not is_scan_stop_requested():
            report = {
                "total_lines": total_rows,
                "parsed_lines": total_rows,
                "added_count": len(added_items),
                "already_in_list_count": len(already_in_list),
                "no_match_count": 0,
                "multiple_match_count": 0,
                "ignored_count": 0,
                "already_in_list": already_in_list,
                "no_match": [],
                "multiple_matches": [],
                "ignored": [],
                "import_source": "file",
                "finished_at": time.time(),
            }
            _store_bulk_import_report(list_id, {
                "status": "completed",
                "list_id": list_id,
                "added_items": added_items,
                "report": report,
            })
    except Exception as e:
        db.rollback()
        logger.error(f"Error background importing list: {e}")
        _store_bulk_import_report(list_id, {
            "status": "failed",
            "list_id": list_id,
            "error": str(e),
            "finished_at": time.time(),
        })
    finally:
        update_scan_status({
            "active": False,
            "phase": "idle",
            "current": 0,
            "total": 0,
            "message": "",
            "current_item": "",
            "list_id": None,
            "can_stop": False,
            "stop_requested": False,
        })
        db.close()
