import os
import time
import queue
import threading
import logging
from pathlib import Path
from typing import List, Optional

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from app.db.base import Session as DbSession
from app.db.models import MediaItem
from app.db.models.enums import ItemStatus
from app.scanner.scanner_manager import ScannerManager
from app.scanner.status import scan_status, scan_status_lock, update_scan_status
from app.utils.config_manager import config_manager
from app.utils.fs_utils import calculate_fast_hash, to_win_long_path

logger = logging.getLogger(__name__)

_watchdog_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()
_event_queue = queue.Queue()
_observer: Optional[Observer] = None
TEMP_DOWNLOAD_SUFFIXES = (".!qb", ".part", ".crdownload", ".tmp")
SCAN_STABLE_SECONDS = 30
SCAN_STABLE_TIMEOUT_SECONDS = 6 * 60 * 60
SCAN_STABLE_POLL_SECONDS = 5


class LibraryWatchdogHandler(FileSystemEventHandler):
    def on_created(self, event):
        _event_queue.put(("created", event.src_path))

    def on_deleted(self, event):
        if not event.is_directory:
            _event_queue.put(("deleted", event.src_path))

    def on_moved(self, event):
        _event_queue.put(("moved", (event.src_path, event.dest_path)))


def _norm_path(path: str) -> str:
    return os.path.normcase(os.path.abspath(path))


def _is_path_inside(path: str, root: str) -> bool:
    if not path or not root:
        return False
    try:
        return os.path.commonpath([_norm_path(path), _norm_path(root)]) == _norm_path(root)
    except ValueError:
        return False


def _should_scan_created_path(path: str) -> bool:
    scan_dir = config_manager.get("default_scan_dir", "")
    if not scan_dir or not _is_path_inside(path, scan_dir):
        return False
    return os.path.exists(to_win_long_path(os.path.abspath(path)))


def _is_temp_download_path(path: str) -> bool:
    return path.lower().endswith(TEMP_DOWNLOAD_SUFFIXES)


def _path_signature(path: str):
    long_path = to_win_long_path(os.path.abspath(path))
    try:
        if os.path.isfile(long_path):
            stat = os.stat(long_path)
            return (1, stat.st_size, stat.st_mtime)
        if os.path.isdir(long_path):
            file_count = 0
            total_size = 0
            newest_mtime = 0.0
            for file_path in Path(long_path).rglob("*"):
                if not file_path.is_file() or _is_temp_download_path(str(file_path)):
                    continue
                stat = file_path.stat()
                file_count += 1
                total_size += stat.st_size
                newest_mtime = max(newest_mtime, stat.st_mtime)
            return (file_count, total_size, newest_mtime)
    except OSError:
        return None
    return None


def _wait_for_stable_paths(paths: List[str]) -> List[str]:
    pending = {os.path.abspath(path) for path in paths if not _is_temp_download_path(path)}
    stable_since = {}
    last_signatures = {}
    ready = []
    deadline = time.time() + SCAN_STABLE_TIMEOUT_SECONDS

    while pending and time.time() < deadline:
        now = time.time()
        for path in list(pending):
            if not os.path.exists(to_win_long_path(path)):
                pending.remove(path)
                continue

            signature = _path_signature(path)
            if not signature or signature[0] == 0:
                stable_since.pop(path, None)
                last_signatures[path] = signature
                continue

            if last_signatures.get(path) == signature:
                stable_since.setdefault(path, now)
                if now - stable_since[path] >= SCAN_STABLE_SECONDS:
                    ready.append(path)
                    pending.remove(path)
            else:
                last_signatures[path] = signature
                stable_since[path] = now

        if pending:
            time.sleep(SCAN_STABLE_POLL_SECONDS)

    if pending:
        logger.info(f"Watchdog: paths did not become stable before timeout: {sorted(pending)}")

    return ready


def _dedupe_nested_paths(paths: List[str]) -> List[str]:
    normalized = sorted(
        {os.path.abspath(path) for path in paths},
        key=lambda value: len(Path(value).parts),
    )
    result = []
    for path in normalized:
        if any(_is_path_inside(path, parent) for parent in result):
            continue
        result.append(path)
    return result


def _start_watchdog_scan(paths: List[str]):
    unique_paths = []
    seen = set()
    for path in paths:
        norm_path = os.path.abspath(path)
        if norm_path in seen or not os.path.exists(to_win_long_path(norm_path)):
            continue
        seen.add(norm_path)
        unique_paths.append(norm_path)

    if not unique_paths:
        return
    unique_paths = _dedupe_nested_paths(unique_paths)

    def run_scan():
        db = DbSession()
        try:
            ready_paths = _wait_for_stable_paths(unique_paths)
            if not ready_paths:
                return
            with scan_status_lock:
                if scan_status.get("active"):
                    logger.info(f"Watchdog: scan already active, skipping new paths: {ready_paths}")
                    return
                scan_status["active"] = True
            
            update_scan_status({
                "active": True,
                "phase": "collecting",
                "current": 0,
                "total": 0,
                "start_time": time.time(),
            })
            min_duration = config_manager.get_int("min_video_duration_minutes", 12)
            min_size_mb = config_manager.get_int("min_video_size_mb", 50)
            scanner = ScannerManager(
                db,
                min_video_size_mb=min_size_mb,
                min_video_duration_minutes=min_duration,
            )
            scanner.scan_and_save(ready_paths)
        except Exception as e:
            logger.error(f"Watchdog scan failed: {e}", exc_info=True)
        finally:
            DbSession.remove()

    logger.info(f"Watchdog: starting scan for new paths: {unique_paths}")
    threading.Thread(target=run_scan, name="WatchdogScan", daemon=True).start()


def process_queue_loop():
    logger.info("Watchdog event processor loop started.")
    
    # We buffer events for a short period to debounce/batch them
    buffer = {}
    last_process_time = time.time()
    
    while not _stop_event.is_set():
        try:
            # Wait for an event with a timeout
            item = _event_queue.get(timeout=0.5)
            evt_type, data = item
            
            if evt_type == "moved":
                src, dest = data
                # If a file was moved, collapse delete on src and create on dest
                buffer[src] = ("deleted", src)
                buffer[dest] = ("created", dest)
            else:
                buffer[data] = (evt_type, data)
                
            _event_queue.task_done()
        except queue.Empty:
            pass
            
        # Process buffer if we haven't processed in 2 seconds or if queue is empty
        current_time = time.time()
        if (current_time - last_process_time > 2.0 or _event_queue.empty()) and buffer:
            events_to_process = list(buffer.values())
            buffer.clear()
            last_process_time = current_time
            
            if events_to_process:
                scan_candidates = []
                # Run the actual DB updates in a session
                db = DbSession()
                try:
                    for evt_type, path in events_to_process:
                        if evt_type == "deleted":
                            handle_deleted(db, path)
                        elif evt_type == "created":
                            restored = handle_created(db, path)
                            if not restored and _should_scan_created_path(path):
                                scan_candidates.append(path)
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.error(f"Watchdog DB commit failed: {e}")
                finally:
                    db.close()
                    DbSession.remove()
                _start_watchdog_scan(scan_candidates)


def handle_deleted(db, path: str):
    norm_path = os.path.abspath(path)
    item = db.query(MediaItem).filter(MediaItem.current_path == norm_path).first()
    # Only mark files as MISSING if they were successfully integrated into the library.
    # Files in Discovery (MATCHED, NEW, etc.) might be actively moving, which triggers false DELETED events.
    if not item or item.status not in (ItemStatus.RENAMED, ItemStatus.ORGANIZED):
        return

    # Guard against race condition with the renamer engine:
    # The renamer already updated current_path + status before the watchdog
    # processes the filesystem event. Refresh from DB to get the latest state.
    db.refresh(item)
    if item.current_path != norm_path:
        # Renamer already updated the path — this delete event is stale
        logger.debug(f"Watchdog: skipping stale delete for {norm_path} (item path now {item.current_path})")
        return

    # Verify the file is truly gone at the current_path
    if os.path.exists(to_win_long_path(norm_path)):
        logger.debug(f"Watchdog: file still exists at {norm_path}, skipping MISSING mark.")
        return

    logger.info(f"Watchdog: file deleted. Marking MediaItem as MISSING: {norm_path}")
    # Save previous status if we need to restore it
    item.ignored_previous_status = item.status
    item.status = ItemStatus.MISSING


def handle_created(db, path: str):
    norm_path = os.path.abspath(path)
    # Check if this file exists on disk now (sometimes created events are transient)
    if not os.path.exists(to_win_long_path(norm_path)):
        return False

    if os.path.isdir(to_win_long_path(norm_path)):
        return False

    # Compute fast hash
    file_hash = calculate_fast_hash(norm_path)
    if not file_hash:
        return False

    # Find if there's a missing item with this hash or current_path
    item = db.query(MediaItem).filter(
        (MediaItem.file_hash == file_hash) | (MediaItem.current_path == norm_path)
    ).filter(MediaItem.status == ItemStatus.MISSING).first()

    if item:
        # Restore previous status if saved, otherwise fallback to heuristics
        restore_status = item.ignored_previous_status
        if not restore_status:
            library_path = config_manager.get("folder_library_path", "")
            is_in_library = library_path and norm_path.lower().startswith(library_path.lower())
            if is_in_library:
                restore_status = ItemStatus.ORGANIZED
            elif item.matches:
                restore_status = ItemStatus.MATCHED
            else:
                restore_status = ItemStatus.NEW

        logger.info(f"Watchdog: file restored/moved in. Restoring MediaItem {item.id} to {restore_status.value}: {norm_path}")
        item.current_path = norm_path
        item.filename = os.path.basename(norm_path)
        item.folder_name = os.path.basename(os.path.dirname(norm_path))
        item.status = restore_status
        item.ignored_previous_status = None
        return True

    return False


def start_watchdog():
    global _observer, _watchdog_thread, _stop_event
    
    # Check if enabled in settings
    enabled = config_manager.get_bool("watchdog_enabled", True)
    if not enabled:
        logger.info("Watchdog service is disabled in settings.")
        return

    if _observer is not None:
        logger.warning("Watchdog service already running.")
        return

    _stop_event.clear()
    
    # Start the event processing queue loop
    _watchdog_thread = threading.Thread(target=process_queue_loop, daemon=True)
    _watchdog_thread.start()

    # Get paths to watch
    scan_dir = config_manager.get("default_scan_dir", "")
    library_path = config_manager.get("folder_library_path", "")

    paths_to_watch = []
    if scan_dir and os.path.exists(scan_dir):
        paths_to_watch.append(scan_dir)
    if library_path and os.path.exists(library_path):
        paths_to_watch.append(library_path)

    if not paths_to_watch:
        logger.warning("Watchdog: No valid paths to watch.")
        return

    logger.info(f"Starting Watchdog observer on paths: {paths_to_watch}")
    _observer = Observer()
    handler = LibraryWatchdogHandler()

    for path in paths_to_watch:
        _observer.schedule(handler, path, recursive=True)

    _observer.start()


def stop_watchdog():
    global _observer, _watchdog_thread
    if _observer:
        logger.info("Stopping Watchdog observer...")
        _observer.stop()
        _observer.join()
        _observer = None
        
    _stop_event.set()
    if _watchdog_thread:
        _watchdog_thread.join(timeout=3)
        _watchdog_thread = None
    logger.info("Watchdog service stopped.")
