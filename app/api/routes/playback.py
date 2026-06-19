from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, func
import logging
import os
import threading
import subprocess
import platform
from pathlib import Path
from typing import Optional

from app.db.base import Session
from app.db.models import *

logger = logging.getLogger(__name__)
router = APIRouter()


def _parse_watched_at(value) -> datetime:
    if not value:
        return datetime.utcnow()
    if isinstance(value, datetime):
        return value
    try:
        normalized = str(value).strip().replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except Exception as exc:
        raise ValueError("Invalid watched_at datetime format") from exc


def _serialize_playback_logs(item) -> list[dict]:
    logs = sorted(getattr(item, "playback_logs", []) or [], key=lambda x: x.watched_at, reverse=True)
    return [
        {
            "id": log.id,
            "watched_at": log.watched_at.isoformat(),
        }
        for log in logs
        if getattr(log, "watched_at", None)
    ]


def _recalculate_watch_state(item) -> None:
    logs = sorted(
        [log for log in (getattr(item, "playback_logs", []) or []) if getattr(log, "watched_at", None)],
        key=lambda x: x.watched_at,
        reverse=True,
    )
    item.watch_count = len(logs)
    item.last_watched_at = logs[0].watched_at if logs else None
    item.is_watched = bool(logs)
    if logs:
        item.resume_position = 0


def _watch_history_response(item) -> dict:
    return {
        "status": "success",
        "watch_count": getattr(item, "watch_count", 0),
        "is_watched": getattr(item, "is_watched", False),
        "resume_position": getattr(item, "resume_position", 0),
        "last_watched_at": getattr(item, "last_watched_at").isoformat() if getattr(item, "last_watched_at", None) else None,
        "playback_logs": _serialize_playback_logs(item),
    }


@router.get("/trailer/{trailer_key}")
def get_trailer(trailer_key: str):
    """
    Stream a locally cached trailer. If not yet downloaded, returns 202 with status.
    If ready, returns the video file for direct <video> playback.
    """
    from app.services.trailer_service import get_trailer_path, is_downloading

    path = get_trailer_path(trailer_key)
    if path:
        return FileResponse(
            path=str(path),
            media_type="video/mp4",
            filename=f"{trailer_key}.mp4"
        )
    
    if is_downloading(trailer_key):
        return JSONResponse(
            status_code=202,
            content={"status": "downloading", "message": "Trailer is being downloaded..."}
        )
    
    return JSONResponse(
        status_code=404,
        content={"status": "not_found", "message": "Trailer not cached. Call POST /api/trailer/{key} to start download."}
    )

@router.get("/trailer/{trailer_key}/status")
def check_trailer_status(trailer_key: str):
    """
    Lightweight status check for a trailer to see if it is cached, downloading, or not found.
    Used by the frontend polling mechanism to avoid downloading the video file.
    """
    from app.services.trailer_service import get_trailer_path, is_downloading
    
    path = get_trailer_path(trailer_key)
    if path:
        return {"status": "ready"}
    if is_downloading(trailer_key):
        return {"status": "downloading"}
    return {"status": "not_found"}

@router.post("/trailer/{trailer_key}")
def request_trailer_download(trailer_key: str):
    """
    Trigger an on-demand trailer download via yt-dlp.
    Returns immediately; the download happens in a background thread.
    """
    from app.services.trailer_service import get_trailer_path, download_trailer, is_downloading

    # Already downloaded?
    path = get_trailer_path(trailer_key)
    if path:
        return {"status": "ready", "url": f"/api/trailer/{trailer_key}"}
    
    # Already downloading?
    if is_downloading(trailer_key):
        return JSONResponse(
            status_code=202,
            content={"status": "downloading", "message": "Download already in progress."}
        )
    
    # Start background download
    def _bg_download():
        download_trailer(trailer_key)
    
    thread = threading.Thread(target=_bg_download, daemon=True)
    thread.start()
    
    return JSONResponse(
        status_code=202,
        content={"status": "downloading", "message": "Trailer download started."}
    )

@router.post("/reveal")
def reveal_in_explorer(payload: dict):
    """Opens the file's parent folder and selects the file in the OS file explorer."""
    path = payload.get("path")
    if not path or not os.path.exists(path):
        return {"status": "error", "message": f"Path does not exist: {path}"}
    
    path = os.path.abspath(path)
    try:
        if platform.system() == "Windows":
            # /select highlights the file and usually brings explorer to front
            subprocess.Popen(f'explorer /select,"{os.path.normpath(path)}"')
        elif platform.system() == "Darwin":
            # -R reveals the file in Finder
            subprocess.Popen(["open", "-R", path])
        else:
            # For Linux, we still just open the folder as xdg-open doesn't have a universal select
            folder = os.path.dirname(path)
            subprocess.Popen(["xdg-open", folder])
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Reveal failed: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/open-path")
def open_path(payload: dict):
    """Opens a file or folder with the OS default handler."""
    path = payload.get("path")
    if not path or not os.path.exists(path):
        return {"status": "error", "message": f"Path does not exist: {path}"}

    path = os.path.abspath(path)
    try:
        if platform.system() == "Windows":
            os.startfile(os.path.normpath(path))
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Open path failed: {e}")
        return {"status": "error", "message": str(e)}

def find_media_player(db_session=None):
    """
    Looks for VLC or MPC-HC in database settings, otherwise falls back to
    auto-detection (shutil.which) and standard fallback locations.
    Saves auto-detected paths to settings.
    """
    import shutil
    from app.db.base import Session
    from app.db.models import UserSetting

    local_db = db_session or Session()
    vlc_path_setting = None
    mpc_path_setting = None
    try:
        vlc_path_setting = local_db.query(UserSetting).filter(UserSetting.key == "vlc_path").first()
        mpc_path_setting = local_db.query(UserSetting).filter(UserSetting.key == "mpc_path").first()
    except Exception as e:
        logger.warning(f"Failed to query player settings: {e}")

    vlc_path = vlc_path_setting.value if vlc_path_setting else None
    mpc_path = mpc_path_setting.value if mpc_path_setting else None

    def save_setting(key, val):
        try:
            setting = local_db.query(UserSetting).filter(UserSetting.key == key).first()
            if setting:
                setting.value = val
            else:
                local_db.add(UserSetting(key=key, value=val))
            local_db.commit()
        except Exception as e:
            local_db.rollback()
            logger.error(f"Failed to save player setting {key}: {e}")

    # VLC Resolution
    vlc_valid = False
    if vlc_path and os.path.exists(vlc_path):
        vlc_valid = True
    else:
        # Detect VLC
        which_vlc = shutil.which("vlc")
        if which_vlc:
            vlc_path = which_vlc
            vlc_valid = True
        elif platform.system() == "Windows":
            vlc_paths = [
                r"C:\Program Files\VideoLAN\VLC\vlc.exe",
                r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"
            ]
            for p in vlc_paths:
                if os.path.exists(p):
                    vlc_path = p
                    vlc_valid = True
                    break
        elif platform.system() == "Darwin":
            p = "/Applications/VLC.app/Contents/MacOS/VLC"
            if os.path.exists(p):
                vlc_path = p
                vlc_valid = True

        if vlc_valid and vlc_path:
            save_setting("vlc_path", vlc_path)

    # MPC-HC Resolution
    mpc_valid = False
    if mpc_path and os.path.exists(mpc_path):
        mpc_valid = True
    else:
        # Detect MPC-HC
        which_mpc = shutil.which("mpc-hc") or shutil.which("mpc-hc64")
        if which_mpc:
            mpc_path = which_mpc
            mpc_valid = True
        elif platform.system() == "Windows":
            mpc_paths = [
                r"C:\Program Files\MPC-HC\mpc-hc64.exe",
                r"C:\Program Files (x86)\MPC-HC\mpc-hc.exe"
            ]
            for p in mpc_paths:
                if os.path.exists(p):
                    mpc_path = p
                    mpc_valid = True
                    break

        if mpc_valid and mpc_path:
            save_setting("mpc_path", mpc_path)

    if not db_session:
        local_db.close()

    if vlc_valid and vlc_path:
        return vlc_path, "vlc"
    if mpc_valid and mpc_path:
        return mpc_path, "mpc"

    return None, None

def monitor_playback(item_id: int, player_type: str, proc: subprocess.Popen, port: int):
    """
    Background worker thread to monitor external media player.
    Saves last watched date, play count, resume position, and marks watched.
    """
    import time
    import requests
    import re
    from app.db.base import Session
    from app.db.models import MediaItem
    
    logger.info(f"Started playback monitoring thread for item_id={item_id}, player={player_type}, port={port}")
    
    last_saved_time = 0
    total_length = 0
    current_time = 0
    
    # Wait a moment for the player to initialize
    time.sleep(3)
    
    try:
        while proc.poll() is None:
            time.sleep(2)
            try:
                if player_type == "vlc":
                    r = requests.get(
                        f"http://127.0.0.1:{port}/requests/status.json", 
                        auth=("", "renda"), 
                        timeout=1.5
                    )
                    if r.status_code == 200:
                        data = r.json()
                        current_time = int(data.get("time", 0))
                        total_length = int(data.get("length", 0))
                elif player_type == "mpc":
                    r = requests.get(
                        f"http://127.0.0.1:{port}/variables.html", 
                        timeout=1.5
                    )
                    if r.status_code == 200:
                        pos_match = re.search(r'id="position">(\d+)</p>', r.text)
                        dur_match = re.search(r'id="duration">(\d+)</p>', r.text)
                        if pos_match:
                            current_time = int(pos_match.group(1)) // 1000
                        if dur_match:
                            total_length = int(dur_match.group(1)) // 1000
                
                # If position changed and is significantly different, update db periodically
                if current_time > 0 and abs(current_time - last_saved_time) >= 10:
                    last_saved_time = current_time
                    db = Session()
                    try:
                        item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
                        if item:
                            item.resume_position = current_time
                            
                            # If watched over 90% of the video, mark as watched/completed and reset resume
                            if total_length > 0:
                                item.duration = total_length
                                progress = current_time / total_length
                                if progress > 0.90:
                                    item.is_watched = True
                                    item.resume_position = 0
                            
                            db.commit()
                    except Exception as ex:
                        db.rollback()
                        logger.error(f"Failed to update playback position in thread: {ex}")
                    finally:
                        db.close()
                        
            except Exception as e:
                # Debug logging only to avoid visual clutter
                logger.debug(f"Playback polling request failed: {e}")
                
    except Exception as e:
        logger.error(f"Error in playback monitoring thread: {e}")
    finally:
        # Perform final save
        if current_time > 0 and current_time != last_saved_time:
            db = Session()
            try:
                item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
                if item:
                    item.resume_position = current_time
                    if total_length > 0:
                        item.duration = total_length
                        progress = current_time / total_length
                        if progress > 0.90:
                            item.is_watched = True
                            item.resume_position = 0
                    db.commit()
                    logger.info(f"Final playback position saved: {current_time}s, duration: {total_length}s")
            except Exception as ex:
                db.rollback()
                logger.error(f"Failed to update final playback position: {ex}")
            finally:
                db.close()
        logger.info(f"Playback monitoring thread finished for item_id={item_id}")


def _launch_media_file(file_path: str, start_seconds: int = 0) -> dict:
    normalized_path = os.path.normpath(file_path)
    player_path, player_type = find_media_player()

    if player_path and player_type:
        proc = None
        port = 8080 if player_type == "vlc" else 13579

        if player_type == "vlc":
            args = [player_path, normalized_path]
            if start_seconds > 10:
                args.append(f"--start-time={start_seconds}")
            args.extend(["--no-one-instance", "--extraintf=http", "--http-password=renda", f"--http-port={port}", "--http-host=127.0.0.1"])
            proc = subprocess.Popen(args)
        elif player_type == "mpc":
            args = [player_path, normalized_path]
            if start_seconds > 10:
                h = start_seconds // 3600
                m = (start_seconds % 3600) // 60
                s = start_seconds % 60
                args.extend(["/startpos", f"{h:02d}:{m:02d}:{s:02d}"])
            proc = subprocess.Popen(args)

        if proc:
            return {
                "status": "success",
                "player_type": player_type,
                "process": proc,
                "port": port,
                "message": f"Launched {player_type.upper()} for {normalized_path}",
            }

    logger.info(f"VLC or MPC-HC not found. Falling back to default OS player for: {normalized_path}")
    if platform.system() == "Windows":
        os.startfile(normalized_path)
    elif platform.system() == "Darwin":
        subprocess.Popen(["open", normalized_path])
    else:
        subprocess.Popen(["xdg-open", normalized_path])

    return {
        "status": "success",
        "player_type": "default",
        "process": None,
        "port": None,
        "message": f"Launched default player for {normalized_path}",
    }

@router.post("/media/play")
def play_media_item(payload: dict):
    """Launches the media file locally using the OS default associated media player."""
    item_id = payload.get("item_id")
    if not item_id:
        return JSONResponse(status_code=400, content={"error": "item_id is required"})
        
    db = Session()
    try:
        from app.db.models import MediaItem, PlaybackLog
        from datetime import datetime
        import os
        import platform
        import subprocess
        import threading
        
        item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Media item not found"})
            
        file_path = item.current_path
        if not file_path or not os.path.exists(file_path):
            return JSONResponse(status_code=404, content={"error": f"Media file not found at: {file_path}"})
            
        logger.info(f"Launching media file with hybrid tracking: {file_path}")
        
        # 1. Update general stats immediately
        item.last_watched_at = datetime.utcnow()
        
        # Check if the item has an unfinished session (is_watched is False)
        # and has an existing log entry we can update instead of duplicating it
        existing_log = None
        if not item.is_watched:
            existing_log = db.query(PlaybackLog).filter(
                PlaybackLog.media_item_id == item.id
            ).order_by(PlaybackLog.watched_at.desc()).first()

        if existing_log:
            existing_log.watched_at = datetime.utcnow()
            log_entry = existing_log
        else:
            log_entry = PlaybackLog(media_item_id=item.id, watched_at=datetime.utcnow())
            db.add(log_entry)
            item.watch_count = (item.watch_count or 0) + 1

        item.is_watched = False
        db.commit()
        
        start_seconds = item.resume_position or 0
        
        launch_result = _launch_media_file(file_path, start_seconds=start_seconds)
        proc = launch_result.get("process")
        player_type = launch_result.get("player_type")
        port = launch_result.get("port")

        if proc and player_type in {"vlc", "mpc"}:
            t = threading.Thread(
                target=monitor_playback,
                args=(item.id, player_type, proc, port),
                daemon=True
            )
            t.start()
            return {
                "status": "success",
                "message": f"Launched {player_type.upper()} with precision hybrid tracking for {file_path}"
            }

        return {"status": "success", "message": f"Launched default player (no position tracking) for {file_path}"}
        
    except Exception as e:
        logger.error(f"Failed to play media file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.post("/media/preview")
def preview_media_file(payload: Optional[dict] = None):
    file_path = (payload or {}).get("file_path")
    start_seconds = int((payload or {}).get("start_seconds") or 0)

    if not file_path:
        return JSONResponse(status_code=400, content={"error": "file_path is required"})

    try:
        if not os.path.exists(file_path):
            return JSONResponse(status_code=404, content={"error": f"Media file not found at: {file_path}"})

        logger.info(f"Launching preview without watched tracking: {file_path}")
        launch_result = _launch_media_file(file_path, start_seconds=start_seconds)
        player_type = launch_result.get("player_type") or "default"
        return {
            "status": "success",
            "message": f"Launched {player_type.upper()} preview for {file_path}",
        }
    except Exception as e:
        logger.error(f"Failed to preview media file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/library/item/{item_id}/watch-history")
def add_watch_history_entry(item_id: int, payload: Optional[dict] = None):
    db = Session()
    try:
        from app.db.models import MediaItem, PlaybackLog

        item = db.query(MediaItem).options(joinedload(MediaItem.playback_logs)).filter(MediaItem.id == item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found"})

        watched_at = _parse_watched_at((payload or {}).get("watched_at"))
        db.add(PlaybackLog(media_item_id=item.id, watched_at=watched_at))
        db.flush()
        db.refresh(item)
        _recalculate_watch_state(item)
        db.commit()
        db.refresh(item)
        return _watch_history_response(item)
    except ValueError as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding watch history entry: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.put("/library/item/{item_id}/watch-history/{log_id}")
def update_watch_history_entry(item_id: int, log_id: int, payload: Optional[dict] = None):
    db = Session()
    try:
        from app.db.models import MediaItem, PlaybackLog

        item = db.query(MediaItem).options(joinedload(MediaItem.playback_logs)).filter(MediaItem.id == item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found"})

        log = db.query(PlaybackLog).filter(
            PlaybackLog.id == log_id,
            PlaybackLog.media_item_id == item_id,
        ).first()
        if not log:
            return JSONResponse(status_code=404, content={"error": "Watch history entry not found"})

        log.watched_at = _parse_watched_at((payload or {}).get("watched_at"))
        db.flush()
        db.refresh(item)
        _recalculate_watch_state(item)
        db.commit()
        db.refresh(item)
        return _watch_history_response(item)
    except ValueError as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating watch history entry: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.delete("/library/item/{item_id}/watch-history/{log_id}")
def delete_watch_history_entry(item_id: int, log_id: int):
    db = Session()
    try:
        from app.db.models import MediaItem, PlaybackLog

        item = db.query(MediaItem).options(joinedload(MediaItem.playback_logs)).filter(MediaItem.id == item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found"})

        log = db.query(PlaybackLog).filter(
            PlaybackLog.id == log_id,
            PlaybackLog.media_item_id == item_id,
        ).first()
        if not log:
            return JSONResponse(status_code=404, content={"error": "Watch history entry not found"})

        db.delete(log)
        db.flush()
        db.refresh(item)
        _recalculate_watch_state(item)
        db.commit()
        db.refresh(item)
        return _watch_history_response(item)
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting watch history entry: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.post("/library/item/{item_id}/reset-progress")
def reset_item_progress(item_id: int):
    """Manually resets the playback progress of an item to 0 and removes the watched flag."""
    db = Session()
    try:
        from app.db.models import MediaItem
        item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found"})
        
        item.resume_position = 0
        item.is_watched = False
        # Do not modify last_watched_at so it remains in history, but we could if needed.
        
        db.commit()
        return {"status": "success", "resume_position": 0, "is_watched": False}
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Error resetting progress: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

@router.get("/library/watched-history")
def get_watched_history(page: int = 1, limit: int = 20, include_adult: bool = False):
    db = Session()
    try:
        from app.db.models import PlaybackLog, MediaItem, ItemStatus
        from app.db.models.metadata import MediaMatch
        from app.services.language_service import LanguageService
        from app.services.library.asset_resolver import resolve_asset_path
        from app.utils.library_utils import _preferred_metadata_language

        ui_lang = _preferred_metadata_language(db)
        
        offset = (page - 1) * limit
        query = db.query(PlaybackLog).join(MediaItem)
        if not include_adult:
            active_adult_match = db.query(MediaMatch.id).filter(
                MediaMatch.media_item_id == MediaItem.id,
                MediaMatch.is_active == True,
                MediaMatch.is_adult == True,
            ).exists()
            query = query.filter(~active_adult_match)
            
        logs = query.options(
            joinedload(PlaybackLog.media_item).options(
                joinedload(MediaItem.matches).joinedload(MediaMatch.localizations)
            )
        ).order_by(PlaybackLog.watched_at.desc()).offset(offset).limit(limit + 1).all()

        has_more = len(logs) > limit
        if has_more:
            logs = logs[:limit]

        results = []
        for log in logs:
            item = log.media_item
            if not item:
                continue

            active_match = next((match for match in item.matches if match.is_active), None)
            loc = LanguageService.pick_localization(active_match.localizations, [ui_lang] if ui_lang else []) if active_match else None

            title = loc.title if loc else (item.fn_title or item.fd_title or item.filename)
            series_title = loc.series_title if loc else None
            episode_title = loc.episode_title if loc else None

            poster_path = resolve_asset_path(
                subfolder="posters",
                manual_local_path=getattr(loc, "manual_local_poster_path", None) if loc else None,
                manual_path=getattr(loc, "manual_poster_path", None) if loc else None,
                local_path=loc.local_poster_path if loc else None,
                remote_path=loc.poster_path if loc else None,
            ) if loc else None

            series_poster_path = resolve_asset_path(
                subfolder="posters",
                manual_local_path=(
                    getattr(loc, "manual_local_series_poster_path", None)
                    or getattr(loc, "manual_local_poster_path", None)
                ) if loc else None,
                manual_path=(
                    getattr(loc, "manual_series_poster_path", None)
                    or getattr(loc, "manual_poster_path", None)
                ) if loc else None,
                local_path=(loc.local_series_poster_path or loc.local_poster_path) if loc else None,
                remote_path=(loc.series_poster_path or loc.poster_path) if loc else None,
            ) if loc else None

            year_range = None
            if active_match:
                if item.item_type.value == "episode":
                    start_year = active_match.first_air_date.year if active_match.first_air_date else None
                    end_year = active_match.last_air_date.year if active_match.last_air_date else None
                    status = active_match.release_status
                    if start_year:
                        if status == "Ended" or (end_year and end_year != start_year and status != "Returning Series"):
                            year_range = f"{start_year}–{end_year}" if end_year else str(start_year)
                        else:
                            year_range = f"{start_year}–"
                else:
                    if active_match.release_date:
                        year_range = str(active_match.release_date.year)
            if not year_range:
                item_year = item.fn_year or item.fd_year
                year_range = str(item_year) if item_year else None

            results.append({
                "id": log.id,
                "media_item_id": item.id,
                "watched_at": log.watched_at.isoformat(),
                "title": title,
                "series_title": series_title,
                "episode_title": episode_title,
                "type": item.item_type.value,
                "year": year_range,
                "season_number": active_match.season_number if active_match else None,
                "episode_number": active_match.episode_number if active_match else None,
                "poster_path": poster_path,
                "series_poster_path": series_poster_path,
                "resume_position": item.resume_position or 0,
                "duration": item.duration or 0,
                "is_watched": item.is_watched or False,
            })

        return {
            "items": results,
            "page": page,
            "has_more": has_more
        }
    finally:
        db.close()


def get_active_player_position(item_id: int) -> Optional[int]:
    import requests
    import re
    from app.db.base import Session
    from app.db.models import UserSetting, MediaItem

    db = Session()
    try:
        item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
        if not item or not item.current_path:
            return None
        target_filename = os.path.basename(item.current_path)

        # Check settings for players
        vlc_path_setting = db.query(UserSetting).filter(UserSetting.key == "vlc_path").first()
        mpc_path_setting = db.query(UserSetting).filter(UserSetting.key == "mpc_path").first()

        # VLC
        if vlc_path_setting and vlc_path_setting.value:
            try:
                # Default VLC port is 8080
                r = requests.get(
                    "http://127.0.0.1:8080/requests/status.json",
                    auth=("", "renda"),
                    timeout=1.0
                )
                if r.status_code == 200:
                    data = r.json()
                    playing_file = data.get("information", {}).get("category", {}).get("meta", {}).get("filename")
                    if playing_file == target_filename:
                        return int(data.get("time", 0))
            except Exception:
                pass

        # MPC-HC
        if mpc_path_setting and mpc_path_setting.value:
            try:
                # Default MPC-HC port is 13579
                r = requests.get(
                    "http://127.0.0.1:13579/variables.html",
                    timeout=1.0
                )
                if r.status_code == 200:
                    file_match = re.search(r'id="file">([^<]+)</p>', r.text)
                    if file_match and os.path.basename(file_match.group(1)) == target_filename:
                        pos_match = re.search(r'id="position">(\d+)</p>', r.text)
                        if pos_match:
                            return int(pos_match.group(1)) // 1000
            except Exception:
                pass
    finally:
        db.close()
    return None


@router.post("/library/item/{item_id}/peaks")
def add_peak_entry(item_id: int, payload: Optional[dict] = None):
    db = Session()
    try:
        from app.db.models import MediaItem, PlaybackPeakLog
        item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found"})

        video_position = get_active_player_position(item_id)
        # If player is not active, fallback to last saved resume_position
        if video_position is None and item.resume_position:
            video_position = item.resume_position

        log_entry = PlaybackPeakLog(
            media_item_id=item.id,
            watched_at=datetime.utcnow(),
            video_position=video_position
        )
        db.add(log_entry)
        db.commit()
        db.refresh(item)

        return {
            "status": "success",
            "peaks_count": len(item.peak_logs) if item.peak_logs else 0,
            "peaks_history": [
                {
                    "id": log.id,
                    "watched_at": log.watched_at.isoformat(),
                    "video_position": log.video_position,
                }
                for log in sorted(item.peak_logs or [], key=lambda x: x.watched_at, reverse=True)
            ]
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding peak log: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()


@router.delete("/library/item/{item_id}/peaks/{log_id}")
def delete_peak_entry(item_id: int, log_id: int):
    db = Session()
    try:
        from app.db.models import MediaItem, PlaybackPeakLog
        item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
        if not item:
            return JSONResponse(status_code=404, content={"error": "Item not found"})

        log = db.query(PlaybackPeakLog).filter(
            PlaybackPeakLog.id == log_id,
            PlaybackPeakLog.media_item_id == item_id
        ).first()
        if not log:
            return JSONResponse(status_code=404, content={"error": "Peak log entry not found"})

        db.delete(log)
        db.commit()
        db.refresh(item)

        return {
            "status": "success",
            "peaks_count": len(item.peak_logs) if item.peak_logs else 0,
            "peaks_history": [
                {
                    "id": log.id,
                    "watched_at": log.watched_at.isoformat(),
                    "video_position": log.video_position,
                }
                for log in sorted(item.peak_logs or [], key=lambda x: x.watched_at, reverse=True)
            ]
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting peak log: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        db.close()

