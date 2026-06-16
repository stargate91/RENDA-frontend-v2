import json
import os
import platform
from datetime import datetime, timezone
from pathlib import Path

import requests
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import or_
from app.db.deletion import delete_media_items_by_ids
from app.db.base import Session, engine
from app.db.models import *
from app.utils.logger import logger

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BUG_REPORT_DIR = PROJECT_ROOT / "logs" / "bug-reports"
LOG_FILES = [
    PROJECT_ROOT / "logs" / "renda.log",
    PROJECT_ROOT / "logs" / "electron-main.log",
]


def _tail_log_lines(path: Path, max_lines: int = 200):
    if not path.exists():
        return {"path": str(path), "exists": False, "lines": []}

    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            lines = handle.readlines()
    except Exception as exc:
        return {"path": str(path), "exists": True, "read_error": str(exc), "lines": []}

    return {
        "path": str(path),
        "exists": True,
        "line_count": len(lines),
        "lines": [line.rstrip("\n") for line in lines[-max_lines:]],
    }


def _collect_bug_report_snapshot(payload: dict):
    db = Session()
    try:
        settings = {s.key: s.value for s in db.query(UserSetting).all()}
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "app": {
                "name": "RENDA",
                "frontend_version": payload.get("frontend_version"),
            },
            "reporter": {
                "description": (payload.get("description") or "").strip(),
                "current_view": payload.get("current_view"),
                "ui_language": payload.get("ui_language"),
            },
            "environment": {
                "platform": platform.platform(),
                "python_version": platform.python_version(),
                "cwd": str(PROJECT_ROOT),
            },
            "settings": {
                "ui_language": settings.get("ui_language"),
                "default_scan_dir": settings.get("default_scan_dir"),
                "folder_library_path": settings.get("folder_library_path"),
                "folder_move_to_library": settings.get("folder_move_to_library"),
                "primary_metadata_language": settings.get("primary_metadata_language"),
                "fallback_metadata_language": settings.get("fallback_metadata_language"),
                "watchdog_enabled": settings.get("watchdog_enabled"),
            },
            "logs": [_tail_log_lines(path) for path in LOG_FILES],
        }
    finally:
        db.close()



def _serialize_ignored_item(item: MediaItem):
    detected_title = (
        item.internal_title
        or item.fn_title
        or item.fd_title
        or item.it_title
        or item.filename
    )
    return {
        "id": item.id,
        "filename": item.filename,
        "current_path": item.current_path,
        "original_path": item.original_path,
        "item_type": item.item_type.value if item.item_type else None,
        "status": item.status.value if item.status else None,
        "previous_status": item.ignored_previous_status.value if item.ignored_previous_status else None,
        "ignored_at": item.ignored_at.isoformat() if item.ignored_at else None,
        "detected_title": detected_title,
        "year": item.fn_year or item.fd_year or item.it_year,
    }


def _normalize_path(value: str) -> str:
    return os.path.normcase(os.path.abspath((value or "").strip()))


def _extract_import_settings(payload: dict):
    if not isinstance(payload, dict):
        return None, "Settings payload must be an object."

    if "app" in payload and payload.get("app") != "RENDA":
        return None, "Please import a RENDA settings export."

    if payload.get("app") == "RENDA":
        settings = payload.get("settings")
        if isinstance(settings, dict) and not isinstance(settings, list):
            return settings, None
        return None, "The imported RENDA export is missing its settings object."

    return payload, None


@router.get("/settings/changelog")
def get_changelog():
    candidate_paths = [
        PROJECT_ROOT / "CHANGELOG.md",
        Path.cwd() / "CHANGELOG.md",
        Path(__file__).resolve().parents[2] / "CHANGELOG.md",
    ]
    changelog_path = next((path for path in candidate_paths if path.exists()), None)

    if changelog_path is None:
        return {"status": "error", "message": "CHANGELOG.md not found.", "content": ""}

    try:
        content = changelog_path.read_text(encoding="utf-8")
        return {"status": "success", "content": content}
    except Exception as exc:
        logger.error(f"Failed to read changelog: {exc}", exc_info=True)
        return {"status": "error", "message": str(exc), "content": ""}


@router.post("/settings/validate-folders")
def validate_folders(payload: dict):
    from app.utils.fs_utils import validate_directory

    scan_dir = (payload.get("default_scan_dir") or "").strip()
    library_dir = (payload.get("folder_library_path") or "").strip()
    move_to_library = bool(payload.get("folder_move_to_library"))

    errors = {}

    # Validate default scan folder (readable) if provided
    is_valid_scan = True
    if scan_dir:
        is_valid_scan, scan_err = validate_directory(scan_dir, check_write=False, label="Default Scan Folder")
        if not is_valid_scan:
            if "does not exist" in scan_err:
                errors["scanFolder"] = "scanDirNotExist"
            elif "must point to a folder" in scan_err:
                errors["scanFolder"] = "scanDirNotFolder"
            elif "not readable" in scan_err:
                errors["scanFolder"] = "scanDirNotReadable"
            else:
                errors["scanFolder"] = "scanDirInvalid"

    # In-place organization may legitimately operate inside the same root.
    # We only reject identical source/target folders when the app is in move mode.
    if move_to_library:
        is_valid_lib, lib_err = validate_directory(library_dir, check_write=True, label="Target Library Folder")
        if not is_valid_lib:
            if "is required" in lib_err:
                errors["targetFolder"] = "libraryDirRequired"
            elif "does not exist" in lib_err:
                errors["targetFolder"] = "libraryDirNotExist"
            elif "must point to a folder" in lib_err:
                errors["targetFolder"] = "libraryDirNotFolder"
            elif "not writable" in lib_err:
                errors["targetFolder"] = "libraryDirNotWritable"
            else:
                errors["targetFolder"] = "libraryDirInvalid"
        
        elif is_valid_scan and _normalize_path(scan_dir) == _normalize_path(library_dir):
            errors["targetFolder"] = "foldersCannotBeSame"

    if errors:
        return {"valid": False, "errors": errors}

    return {"valid": True, "message": "foldersVerified"}



@router.post("/settings/validate-api-keys")
def validate_api_keys(payload: dict):
    tmdb_api_key = (payload.get("tmdb_api_key") or "").strip()
    tmdb_bearer_token = (payload.get("tmdb_bearer_token") or "").strip()
    omdb_api_key = (payload.get("omdb_api_key") or "").strip()

    result = {
        "tmdb": {"valid": False, "message": None},
        "omdb": {"valid": False, "message": None},
    }

    if tmdb_api_key or tmdb_bearer_token:
        if not tmdb_api_key or not tmdb_bearer_token:
            result["tmdb"]["message"] = "Both TMDB API Key (v3) and Read Access Token (v4) are required."
        else:
            try:
                key_response = requests.get(
                    "https://api.themoviedb.org/3/configuration",
                    params={"api_key": tmdb_api_key},
                    timeout=15,
                )
                if key_response.status_code == 401:
                    result["tmdb"]["message"] = "The TMDB API Key (v3) is invalid."
                else:
                    key_response.raise_for_status()
                    token_response = requests.get(
                        "https://api.themoviedb.org/3/authentication",
                        headers={"Authorization": f"Bearer {tmdb_bearer_token}"},
                        timeout=15,
                    )
                    if token_response.status_code == 401:
                        result["tmdb"]["message"] = "The TMDB Read Access Token (v4) is invalid."
                    else:
                        token_response.raise_for_status()
                        result["tmdb"] = {"valid": True, "message": "TMDB credentials verified."}
            except requests.Timeout:
                result["tmdb"]["message"] = "TMDB validation timed out. Check your connection and try again."
            except requests.RequestException:
                result["tmdb"]["message"] = "TMDB validation failed. Check your connection and try again."

    if omdb_api_key:
        try:
            omdb_response = requests.get(
                "https://www.omdbapi.com/",
                params={"apikey": omdb_api_key, "i": "tt0111161"},
                timeout=15,
            )
            omdb_response.raise_for_status()
            omdb_data = omdb_response.json()
            if omdb_data.get("Response") == "True":
                result["omdb"] = {"valid": True, "message": "OMDb API key verified."}
            else:
                error_message = omdb_data.get("Error") or "OMDb validation failed."
                result["omdb"]["message"] = error_message
        except requests.Timeout:
            result["omdb"]["message"] = "OMDb validation timed out. Check your connection and try again."
        except requests.RequestException:
            result["omdb"]["message"] = "OMDb validation failed. Check your connection and try again."

    return result


@router.get("/settings")
def get_settings():
    import os
    import shutil
    import platform
    db = Session()
    try:
        # Auto-detect VLC path if not in DB or empty
        vlc_setting = db.query(UserSetting).filter(UserSetting.key == "vlc_path").first()
        if not vlc_setting or not vlc_setting.value:
            vlc_path = ""
            which_vlc = shutil.which("vlc")
            if which_vlc:
                vlc_path = which_vlc
            elif platform.system() == "Windows":
                for p in [r"C:\Program Files\VideoLAN\VLC\vlc.exe", r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"]:
                    if os.path.exists(p):
                        vlc_path = p
                        break
            elif platform.system() == "Darwin":
                p = "/Applications/VLC.app/Contents/MacOS/VLC"
                if os.path.exists(p):
                    vlc_path = p
            if not vlc_setting:
                vlc_setting = UserSetting(key="vlc_path", value=vlc_path)
                db.add(vlc_setting)
            else:
                vlc_setting.value = vlc_path
            db.commit()

        # Auto-detect MPC path if not in DB or empty
        mpc_setting = db.query(UserSetting).filter(UserSetting.key == "mpc_path").first()
        if not mpc_setting or not mpc_setting.value:
            mpc_path = ""
            which_mpc = shutil.which("mpc-hc") or shutil.which("mpc-hc64")
            if which_mpc:
                mpc_path = which_mpc
            elif platform.system() == "Windows":
                for p in [r"C:\Program Files\MPC-HC\mpc-hc64.exe", r"C:\Program Files (x86)\MPC-HC\mpc-hc.exe"]:
                    if os.path.exists(p):
                        mpc_path = p
                        break
            if not mpc_setting:
                mpc_setting = UserSetting(key="mpc_path", value=mpc_path)
                db.add(mpc_setting)
            else:
                mpc_setting.value = mpc_path
            db.commit()

        settings = db.query(UserSetting).all()
        return {s.key: s.value for s in settings}
    finally:
        db.close()


def _apply_settings(db, settings: dict):
    if not isinstance(settings, dict):
        raise ValueError("Settings payload must be an object.")

    # Validate vlc_path
    if "vlc_path" in settings:
        vlc_val = (settings.get("vlc_path") or "").strip()
        if vlc_val:
            from app.utils.fs_utils import to_win_long_path
            long_path = to_win_long_path(vlc_val)
            if not os.path.exists(long_path):
                raise ValueError("vlcNotExist")
            if not os.path.isfile(long_path):
                raise ValueError("vlcNotFile")

    # Validate mpc_path
    if "mpc_path" in settings:
        mpc_val = (settings.get("mpc_path") or "").strip()
        if mpc_val:
            from app.utils.fs_utils import to_win_long_path
            long_path = to_win_long_path(mpc_val)
            if not os.path.exists(long_path):
                raise ValueError("mpcNotExist")
            if not os.path.isfile(long_path):
                raise ValueError("mpcNotFile")

    def _localized_folder_names(lang: str):
        if str(lang or "").lower() == "hu":
            return {
                "folder_movies_name": "Filmek",
                "folder_series_name": "Sorozatok",
                "folder_adult_name": "Felnőtt",
                "extras_subfolder_name": "Extrák",
            }
        return {
            "folder_movies_name": "Movies",
            "folder_series_name": "TV Shows",
            "folder_adult_name": "Adult",
            "extras_subfolder_name": "Extras",
        }

    def _known_folder_aliases():
        return {
            "folder_movies_name": {"Movies", "Filmek"},
            "folder_series_name": {"TV Shows", "Shows", "TV", "Series", "Sorozatok"},
            "folder_adult_name": {"Adult", "Felnőtt"},
            "extras_subfolder_name": {"Extras", "extras", "Extrák", "extrák"},
        }

    current_settings = {setting.key: setting.value for setting in db.query(UserSetting).all()}
    if "ui_language" in settings:
        target_names = _localized_folder_names(settings.get("ui_language"))
        known_aliases = _known_folder_aliases()
        for key, localized_value in target_names.items():
            incoming_value = settings.get(key)
            current_value = current_settings.get(key)
            candidate_value = incoming_value if incoming_value is not None else current_value
            if candidate_value in known_aliases[key]:
                settings[key] = localized_value

    for key, value in settings.items():
        setting = db.query(UserSetting).filter(UserSetting.key == key).first()
        if setting:
            setting.value = value
        else:
            setting = UserSetting(key=key, value=value)
            db.add(setting)
    db.commit()

    # Restart watchdog to apply new paths or status
    if any(k in settings for k in ["watchdog_enabled", "default_scan_dir", "folder_library_path"]):
        try:
            from app.utils.config_manager import config_manager
            config_manager.refresh()
            from app.services.watchdog_service import stop_watchdog, start_watchdog
            stop_watchdog()
            start_watchdog()
        except Exception as w_err:
            print(f"Failed to restart watchdog on settings update: {w_err}")
            

    
    # Update is_primary flags in database if language setting changed
    if "primary_metadata_language" in settings:
        target_lang = settings["primary_metadata_language"]
        db.query(MetadataLocalization).filter(MetadataLocalization.locale == target_lang).update({"is_primary": True})
        db.query(MetadataLocalization).filter(MetadataLocalization.locale != target_lang).update({"is_primary": False})
        db.query(MediaCollectionLocalization).filter(MediaCollectionLocalization.locale == target_lang).update({"is_primary": True})
        db.query(MediaCollectionLocalization).filter(MediaCollectionLocalization.locale != target_lang).update({"is_primary": False})
        db.commit()
    
    # If naming settings OR language settings changed, we should refresh planned paths.
    if any(k.startswith(("naming_", "folder_", "extras_", "collision_")) for k in settings.keys()) or "primary_metadata_language" in settings or "default_target_language" in settings:
        try:
            from app.formatter.formatter import Formatter, FormatterConfig
            from app.db.models import MediaItem, ItemStatus
            
            config = FormatterConfig.from_db(db)
            formatter = Formatter(config)
            
            # Get items in discovery
            items = db.query(MediaItem).filter(MediaItem.status.in_([
                ItemStatus.NEW, ItemStatus.MATCHED, ItemStatus.UNCERTAIN,
                ItemStatus.NO_MATCH, ItemStatus.MULTIPLE, ItemStatus.ERROR
            ])).all()
            
            for item in items:
                # Find active match to format against
                active_match = next((m for m in item.matches if m.is_active), None)
                if active_match:
                    # Fetch freshly committed is_primary localization
                    loc = next((l for l in active_match.localizations if l.is_primary), 
                              active_match.localizations[0] if active_match.localizations else None)
                    if loc:
                        preview = formatter.format_item(item, active_match, loc)
                        if preview.target_subpath:
                            item.planned_path = str(preview.target_path).replace("\\", "/")
                        else:
                            item.planned_path = str(preview.target_path).replace("\\", "/")
            db.commit()
        except Exception as e:
            print(f"Error refreshing planned paths: {e}")


@router.get("/settings/export")
def export_settings():
    settings = get_settings()
    if isinstance(settings, dict):
        settings.pop("imdb_api_key", None)

    return {
        "app": "RENDA",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "settings": settings,
    }


@router.get("/settings/pending")
def get_pending_settings_status():
    return {"has_pending": False, "pending_count": 0}


@router.post("/settings/import")
def import_settings(payload: dict):
    settings, error_message = _extract_import_settings(payload)
    if error_message:
        return JSONResponse(status_code=400, content={"status": "error", "message": error_message})

    db = Session()
    try:
        _apply_settings(db, settings)
        return {"status": "success"}
    except ValueError as val_err:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(val_err)})
    finally:
        db.close()


@router.post("/settings")
def update_settings(settings: dict):
    db = Session()
    try:
        _apply_settings(db, settings)
        return {"status": "success"}
    except ValueError as val_err:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(val_err)})
    finally:
        db.close()


@router.post("/settings/export-bug-report")
def export_bug_report(payload: dict = None):
    payload = payload or {}
    try:
        BUG_REPORT_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        report_path = BUG_REPORT_DIR / f"bug-report-{timestamp}.json"
        report_data = _collect_bug_report_snapshot(payload)

        with report_path.open("w", encoding="utf-8") as handle:
            json.dump(report_data, handle, ensure_ascii=False, indent=2)

        logger.info(f"Bug report exported: {report_path}")
        return {
            "status": "success",
            "path": str(report_path),
            "filename": report_path.name,
        }
    except Exception as exc:
        logger.error(f"Failed to export bug report: {exc}", exc_info=True)
        return {"status": "error", "message": str(exc)}


@router.get("/settings/ignored-items")
def get_ignored_items(search: str = "", offset: int = 0, limit: int = 40):
    db = Session()
    try:
        normalized_limit = max(1, min(int(limit or 40), 40))
        normalized_offset = max(0, int(offset or 0))
        query = db.query(MediaItem).filter(MediaItem.status == ItemStatus.IGNORED)

        raw_search = (search or "").strip()
        if raw_search:
            pattern = f"%{raw_search}%"
            query = query.filter(or_(
                MediaItem.filename.ilike(pattern),
                MediaItem.current_path.ilike(pattern),
                MediaItem.original_path.ilike(pattern),
                MediaItem.internal_title.ilike(pattern),
                MediaItem.fn_title.ilike(pattern),
                MediaItem.fd_title.ilike(pattern),
                MediaItem.it_title.ilike(pattern),
            ))

        total = query.count()
        items = (
            query
            .order_by(MediaItem.ignored_at.desc(), MediaItem.id.desc())
            .offset(normalized_offset)
            .limit(normalized_limit)
            .all()
        )
        return {
            "items": [_serialize_ignored_item(item) for item in items],
            "total": total,
            "offset": normalized_offset,
            "limit": normalized_limit,
            "has_more": normalized_offset + len(items) < total,
        }
    finally:
        db.close()


@router.post("/settings/ignored-items/restore")
def restore_ignored_items(payload: dict):
    db = Session()
    try:
        item_ids = [int(item_id) for item_id in (payload.get("item_ids") or [])]
        if not item_ids:
            return {"status": "success", "restored": 0}

        items = db.query(MediaItem).filter(
            MediaItem.id.in_(item_ids),
            MediaItem.status == ItemStatus.IGNORED,
        ).all()

        restored = 0
        for item in items:
            item.status = item.ignored_previous_status or ItemStatus.NEW
            item.ignored_previous_status = None
            item.ignored_at = None
            restored += 1

        db.commit()
        return {"status": "success", "restored": restored}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


@router.post("/database/clear")
def clear_database(options: dict = None):
    """Wipes selected user media data while preserving settings, caches, and local images."""
    if not options:
        options = {"all": True}
        
    db = Session()
    try:
        import logging
        logger = logging.getLogger(__name__)

        def clear_discovery_data():
            from app.db.models.enums import ItemStatus
            from app.db.models import MediaItem

            disc_statuses = [
                ItemStatus.NEW, ItemStatus.NO_MATCH, ItemStatus.UNCERTAIN,
                ItemStatus.MULTIPLE, ItemStatus.MATCHED, ItemStatus.ERROR, ItemStatus.IGNORED
            ]
            item_ids = [row.id for row in db.query(MediaItem.id).filter(MediaItem.status.in_(disc_statuses)).all()]
            delete_media_items_by_ids(db, item_ids)

        def clear_library_data():
            from app.db.models.enums import ItemStatus
            from app.db.models import (
                MediaItem, Person, PersonLocalization, MediaPersonLink, Tag,
                media_item_tags, VirtualMediaState, VirtualEpisodeState, CustomList, CustomListItem
            )
            from app.db.models.action import ActionBatch, ActionLog
            from app.db.models.media import PlaybackLog

            lib_statuses = [ItemStatus.ORGANIZED, ItemStatus.RENAMED]

            item_ids = [row.id for row in db.query(MediaItem.id).filter(MediaItem.status.in_(lib_statuses)).all()]
            delete_media_items_by_ids(db, item_ids)

            db.query(MediaPersonLink).delete(synchronize_session=False)
            db.query(PersonLocalization).delete(synchronize_session=False)
            db.query(Person).delete(synchronize_session=False)

            db.execute(media_item_tags.delete())
            db.query(Tag).delete(synchronize_session=False)

            db.query(CustomListItem).delete(synchronize_session=False)
            db.query(CustomList).delete(synchronize_session=False)

            db.query(VirtualMediaState).delete(synchronize_session=False)
            db.query(VirtualEpisodeState).delete(synchronize_session=False)

            db.query(ActionLog).delete(synchronize_session=False)
            db.query(ActionBatch).delete(synchronize_session=False)
            db.query(PlaybackLog).delete(synchronize_session=False)

        if options.get("wipe"):
            from sqlalchemy import text
            from app.db.base import Base
            db.execute(text("PRAGMA foreign_keys = OFF"))
            for table in reversed(Base.metadata.sorted_tables):
                if table.name != "user_settings":
                    db.execute(table.delete())
            db.execute(text("PRAGMA foreign_keys = ON"))
        elif options.get("all"):
            clear_discovery_data()
            clear_library_data()
        else:
            if options.get("discovery"):
                clear_discovery_data()

            if options.get("library"):
                clear_library_data()

            if options.get("tags"):
                from app.db.models import Tag, media_item_tags
                from app.db.models.person import Person
                db.execute(media_item_tags.delete())
                db.query(Tag).delete(synchronize_session=False)
                db.query(Person).update({Person.custom_tags: None}, synchronize_session=False)

            if options.get("history"):
                from app.db.models.action import ActionBatch, ActionLog
                from app.db.models.media import PlaybackLog
                db.query(ActionLog).delete(synchronize_session=False)
                db.query(ActionBatch).delete(synchronize_session=False)
                db.query(PlaybackLog).delete(synchronize_session=False)

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).error(f"Database clear failed: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
