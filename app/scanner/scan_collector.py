import time
import os
from pathlib import Path
from typing import List, Optional, Dict, Any
from sqlalchemy import or_
from sqlalchemy.orm import Session
from concurrent.futures import ThreadPoolExecutor

from .collector import Collector
from .categorizer import Categorizer
from .linker import Linker
from .probe import TechnicalProber
from ..db.models import MediaItem, ExtraFile, ItemType, ItemStatus, ExtraCategory
from ..utils.logger import logger
from .status import update_scan_status, increment_scan_status_current, is_scan_stop_requested


def _cpu_heavy_worker_count() -> int:
    logical_threads = os.cpu_count() or 4
    return max(2, min(8, int(logical_threads * 0.5)))


class ScanCollector:
    def __init__(
        self,
        db: Session,
        prober: TechnicalProber,
        collector: Collector,
        categorizer: Categorizer,
        linker: Linker,
        min_video_duration_minutes: int,
        preprobed_data: dict,
    ):
        self.db = db
        self.prober = prober
        self.collector = collector
        self.categorizer = categorizer
        self.linker = linker
        self.min_video_duration_minutes = min_video_duration_minutes
        self.preprobed_data = preprobed_data

    def _stop_requested(self) -> bool:
        if is_scan_stop_requested():
            update_scan_status({"message": "Stopping safely..."})
            return True
        return False

    def collect_and_save(self, paths: List[str]) -> Optional[tuple[List[MediaItem], dict]]:
        update_scan_status({
            "active": True,
            "phase": "collecting",
            "current": 0,
            "total": 0,
            "start_time": time.time(),
            "can_stop": True,
            "stop_requested": False,
        })
        
        logger.info("Phase 1: Collecting files and establishing links...")
        files = self.collector.collect(paths)
        if self._stop_requested():
            logger.info("Scan stop requested during collection.")
            return None
        potential_media = files["potential_media"]
        potential_extras = files["potential_extras"]

        def path_keys(path_value) -> set[str]:
            if not path_value:
                return set()
            path_text = str(path_value).lower().replace("\\", "/")
            keys = {path_text}
            try:
                resolved = str(Path(path_text).resolve(strict=False)).lower().replace("\\", "/")
                keys.add(resolved)
            except Exception:
                pass
            return {key for key in keys if key}

        preserved_rescan_statuses = {
            ItemStatus.MATCHED,
            ItemStatus.MULTIPLE,
            ItemStatus.UNCERTAIN,
            ItemStatus.NO_MATCH,
            ItemStatus.RENAMED,
            ItemStatus.ORGANIZED,
            ItemStatus.IGNORED,
        }

        # Load all existing items to cache for fast lookup
        existing_items = {}
        for item in self.db.query(MediaItem).all():
            for key in path_keys(item.original_path) | path_keys(item.current_path):
                existing_items[key] = item

        existing_extras = set()
        for ex in self.db.query(ExtraFile.original_path, ExtraFile.current_path).all():
            existing_extras.update(path_keys(ex.original_path))
            existing_extras.update(path_keys(ex.current_path))

        # Identify which potential media candidates need technical probing to determine duration
        probe_targets = []
        probe_durations = {}
        probe_infos = {}

        for p in potential_media:
            p_str = str(p)
            stat = p.stat()
            mtime = stat.st_mtime
            size = stat.st_size
            
            existing = next((existing_items.get(key) for key in path_keys(p_str) if existing_items.get(key)), None)
            if existing and existing.size == size and existing.mtime == mtime and existing.duration is not None:
                # Cache existing duration
                probe_durations[p_str] = existing.duration
            else:
                probe_targets.append(p)

        # Probe targets in parallel using ThreadPoolExecutor
        if probe_targets:
            logger.info(f"Probing {len(probe_targets)} potential media candidates...")
            update_scan_status({"phase": "probing", "total": len(probe_targets), "current": 0})
            
            max_workers_proc = _cpu_heavy_worker_count()
            with ThreadPoolExecutor(max_workers=max_workers_proc) as executor:
                future_to_path = {executor.submit(self.prober.probe, str(p)): p for p in probe_targets}
                for future in future_to_path:
                    if self._stop_requested():
                        for pending in future_to_path:
                            pending.cancel()
                        logger.info("Scan stop requested during probing.")
                        return None
                    path = future_to_path[future]
                    path_str = str(path)
                    try:
                        raw_data = future.result()
                        self.preprobed_data[path_str] = raw_data
                        info = self.prober.extract_info(raw_data)
                        probe_durations[path_str] = info.get("duration")
                        probe_infos[path_str] = info
                    except Exception as e:
                        logger.error(f"FFprobe failed for {path_str}: {e}")
                        probe_durations[path_str] = None
                    finally:
                        increment_scan_status_current()

        # Separate into media_paths and extra_paths based on duration limit
        media_paths = []
        extra_paths = list(potential_extras)

        limit_seconds = self.min_video_duration_minutes * 60
        for p in potential_media:
            if self._stop_requested():
                logger.info("Scan stop requested while classifying media candidates.")
                return None
            p_str = str(p)
            duration = probe_durations.get(p_str)
            
            info = probe_infos.get(p_str)
            is_audio_only = False
            if info:
                has_video = bool(info.get("video_codec"))
                has_audio = len(info.get("audio_streams") or []) > 0
                if not has_video and has_audio:
                    is_audio_only = True

            if is_audio_only:
                logger.info(f"Demoting {p.name} to extra because it has no video stream (audio-only container).")
                extra_paths.append(p)
            elif duration is not None and duration < limit_seconds:
                logger.info(f"Demoting {p.name} to extra because duration {duration:.1f}s is less than {limit_seconds}s.")
                extra_paths.append(p)
            else:
                media_paths.append(p)

        # Clean up database if a file switched categories
        for p in extra_paths:
            if self._stop_requested():
                logger.info("Scan stop requested while reconciling extras.")
                return None
            p_str = str(p)
            existing_media = next((existing_items.get(key) for key in path_keys(p_str) if existing_items.get(key)), None)
            if existing_media:
                if existing_media.status in preserved_rescan_statuses:
                    logger.info(f"Keeping existing library MediaItem {p_str}; not demoting it to ExtraFile during rescan.")
                    continue
                logger.info(f"Removing former MediaItem {p_str} from MediaItem table because it is now categorized as an ExtraFile.")
                self.db.delete(existing_media)
                existing_items.pop(p_str, None)

        for p in media_paths:
            p_str = str(p)
            if path_keys(p_str) & existing_extras:
                logger.info(f"Removing former ExtraFile {p_str} from ExtraFile table because it is now categorized as a MediaItem.")
                self.db.query(ExtraFile).filter(
                    or_(ExtraFile.original_path == p_str, ExtraFile.current_path == p_str)
                ).delete()
                existing_extras.difference_update(path_keys(p_str))

        # Recalculate final links
        links = self.linker.link(media_paths, extra_paths)
        
        path_to_item = {}
        to_process = [] # Items that need probing and enrichment

        update_scan_status({"phase": "collecting", "total": len(media_paths) + len(extra_paths), "current": 0})

        for p in media_paths:
            if self._stop_requested():
                logger.info("Scan stop requested while collecting media items.")
                return None
            stat = p.stat()
            mtime = stat.st_mtime
            size = stat.st_size
            p_str = str(p)
            
            existing = next((existing_items.get(key) for key in path_keys(p_str) if existing_items.get(key)), None)
            
            if existing and existing.size == size and existing.mtime == mtime:
                path_to_item[p] = existing
                if existing.status not in preserved_rescan_statuses:
                    to_process.append(existing)
            else:
                from ..utils.fs_utils import calculate_fast_hash
                file_hash = calculate_fast_hash(p_str)
                
                moved_item = None
                if file_hash:
                    from ..utils.fs_utils import to_win_long_path
                    candidates = self.db.query(MediaItem).filter(MediaItem.file_hash == file_hash).all()
                    for cand in candidates:
                        cand_long_path = to_win_long_path(cand.current_path)
                        if not os.path.exists(cand_long_path):
                            moved_item = cand
                            break
                
                if moved_item:
                    logger.info(f"Detected file move/rename via hash: {moved_item.current_path} -> {p_str}")
                    moved_item.original_path = p_str
                    moved_item.current_path = p_str
                    moved_item.filename = p.name
                    moved_item.extension = p.suffix.lower()
                    moved_item.folder_name = p.parent.name
                    moved_item.size = size
                    moved_item.mtime = mtime
                    path_to_item[p] = moved_item
                    if moved_item.status not in preserved_rescan_statuses:
                        to_process.append(moved_item)
                    for key in path_keys(p_str):
                        existing_items[key] = moved_item
                else:
                    if existing:
                        existing.size = size
                        existing.mtime = mtime
                        existing.file_hash = file_hash
                        if existing.status not in preserved_rescan_statuses:
                            existing.status = ItemStatus.NEW
                        item = existing
                    else:
                        item = MediaItem(
                            original_path=p_str, current_path=p_str,
                            filename=p.name, extension=p.suffix.lower(),
                            folder_name=p.parent.name, size=size, mtime=mtime,
                            item_type=ItemType.MOVIE, status=ItemStatus.NEW,
                            file_hash=file_hash
                        )
                        self.db.add(item)
                    
                    path_to_item[p] = item
                    if item.status not in preserved_rescan_statuses:
                        to_process.append(item)
            
            increment_scan_status_current()

        self.db.flush()

        # Handle extras
        for p in extra_paths:
            if self._stop_requested():
                logger.info("Scan stop requested while collecting extra files.")
                return None
            p_str = str(p)
            if path_keys(p_str) & existing_extras:
                increment_scan_status_current()
                continue

            res = self.categorizer.categorize(p, self.db)
            if res[0] is None:
                increment_scan_status_current()
                continue
                
            category, subtype = res
            
            # Check if it was probed as audio-only
            info = probe_infos.get(p_str)
            if not info and p_str in self.preprobed_data:
                try:
                    info = self.prober.extract_info(self.preprobed_data[p_str])
                except:
                    pass
            
            if info:
                has_video = bool(info.get("video_codec"))
                has_audio = len(info.get("audio_streams") or []) > 0
                if not has_video and has_audio:
                    category = ExtraCategory.AUDIO
                    if not subtype:
                        from ..db.models import ExtraSubtype
                        subtype = ExtraSubtype.ORIGINAL

            parent_path = links.get(p)
            parent_item = path_to_item.get(parent_path)
            
            if parent_item:
                from ..utils.fs_utils import calculate_fast_hash
                file_hash = calculate_fast_hash(p_str)
                
                moved_extra = None
                if file_hash:
                    from ..utils.fs_utils import to_win_long_path
                    candidates = self.db.query(ExtraFile).filter(ExtraFile.file_hash == file_hash).all()
                    for cand in candidates:
                        cand_long_path = to_win_long_path(cand.current_path)
                        if not os.path.exists(cand_long_path):
                            moved_extra = cand
                            break
                            
                if moved_extra:
                    logger.info(f"Detected extra file move/rename via hash: {moved_extra.current_path} -> {p_str}")
                    moved_extra.original_path = p_str
                    moved_extra.current_path = p_str
                    moved_extra.extension = p.suffix.lower()
                    moved_extra.parent_item_id = parent_item.id
                    moved_extra.category = category
                    moved_extra.subtype = subtype
                else:
                    extra = ExtraFile(
                        parent_item_id=parent_item.id,
                        category=category, subtype=subtype,
                        original_path=p_str, current_path=p_str,
                        extension=p.suffix.lower(),
                        file_hash=file_hash
                    )
                    self.db.add(extra)
            
            increment_scan_status_current()

        self.db.commit()
        return to_process, probe_infos
