from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, wait, FIRST_COMPLETED
from typing import List, Optional, Dict, Any
from sqlalchemy import or_
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .collector import Collector
from .categorizer import Categorizer
from .linker import Linker
from .nfo_parser import NFOParser
from .probe import TechnicalProber
from .analyzer import Analyzer
from .decision_engine import DecisionEngine
from ..formatter.formatter import Formatter, FormatterConfig
from ..db.models import MediaItem, ExtraFile, ItemType, ItemStatus, ExtraCategory, PartType
from ..resolver.resolver import Resolver
from ..db.base import Session as DbSession
from ..utils.logger import logger

import time
import hashlib
import threading

from .status import scan_status, scan_status_lock, update_scan_status, increment_scan_status_current, is_scan_stop_requested

class ScannerManager:
    """
    Coordinator for the entire scanning and data enrichment pipeline.
    Handles file discovery, technical probing, and metadata extraction.
    """

    def __init__(self, db_session: Session, min_video_size_mb: int = 50, min_video_duration_minutes: int = 12):
        self.db = db_session
        self.collector = Collector(min_video_size_mb)
        self.categorizer = Categorizer()
        self.linker = Linker()
        self.prober = TechnicalProber()
        self.analyzer = Analyzer()
        self.decision_engine = DecisionEngine()
        self.nfo_parser = NFOParser()
        self.formatter = Formatter() # Default config for now
        self.min_video_duration_minutes = min_video_duration_minutes
        self.preprobed_data = {}

    def scan_and_save(self, paths: List[str], stop_after: Optional[str] = None):
        """
        Phase 1: Fast scanning and basic database population.
        Implements change-detection to skip files that haven't been modified.
        """
        global scan_status
        update_scan_status({"active": True, "phase": "collecting", "current": 0, "total": 0, "start_time": time.time(), "can_stop": True, "stop_requested": False})
        
        try:
            logger.info("Phase 1: Collecting files and establishing links...")
            files = self.collector.collect(paths)
            if self._stop_requested():
                logger.info("Scan stop requested during collection.")
                return
            potential_media = files["potential_media"]
            potential_extras = files["potential_extras"]

            def path_keys(path_value) -> set[str]:
                if not path_value:
                    return set()
                path_text = str(path_value)
                keys = {path_text}
                try:
                    keys.add(str(Path(path_text).resolve(strict=False)))
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
            # (releases the GIL on subprocess.run and avoids pickling errors on mock patches in tests under Windows)
            import os
            if probe_targets:
                logger.info(f"Probing {len(probe_targets)} potential media candidates...")
                update_scan_status({"phase": "probing", "total": len(probe_targets), "current": 0})
                
                max_workers_proc = min(os.cpu_count() or 4, 8)
                with ThreadPoolExecutor(max_workers=max_workers_proc) as executor:
                    future_to_path = {executor.submit(self.prober.probe, str(p)): p for p in probe_targets}
                    for future in future_to_path:
                        if self._stop_requested():
                            for pending in future_to_path:
                                pending.cancel()
                            logger.info("Scan stop requested during probing.")
                            return
                        path = future_to_path[future]
                        path_str = str(path)
                        try:
                            raw_data = future.result()
                            self.preprobed_data[path_str] = raw_data
                            info = self.prober.extract_info(raw_data)
                            probe_durations[path_str] = info.get("duration")
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
                    return
                p_str = str(p)
                duration = probe_durations.get(p_str)
                
                if duration is not None and duration < limit_seconds:
                    logger.info(f"Demoting {p.name} to extra because duration {duration:.1f}s is less than {limit_seconds}s.")
                    extra_paths.append(p)
                else:
                    media_paths.append(p)

            # Clean up database if a file switched categories
            for p in extra_paths:
                if self._stop_requested():
                    logger.info("Scan stop requested while reconciling extras.")
                    return
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
                    return
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
                    return
                p_str = str(p)
                if path_keys(p_str) & existing_extras:
                    increment_scan_status_current()
                    continue

                res = self.categorizer.categorize(p, self.db)
                if res[0] is None:
                    increment_scan_status_current()
                    continue
                    
                category, subtype = res
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
            
            # PHASE 2: Technical Probing & Enrichment
            if to_process and not self._stop_requested():
                logger.info(f"Scan complete. {len(to_process)} items need processing.")
                self.enrich_all(to_process)
                if stop_after == "formatter":
                    logger.info("Stopping scan after formatter stage as requested.")
                elif not self._stop_requested():
                    self.resolve_all(to_process)
            
            self.db.expire_all()
            logger.info("Scan complete.")
        except Exception as e:
            import traceback
            logger.error(f"Scan failed: {e}")
            logger.error(traceback.format_exc())
            raise
        finally:
            self.db.close()
            update_scan_status({"active": False, "phase": "idle", "can_stop": False, "stop_requested": False})
            
            try:
                from .people_hydrator import people_hydrator
                people_hydrator.start()
            except Exception as e:
                logger.error(f"Failed to start people hydrator: {e}")

    def enrich_all(self, items: List[MediaItem]):
        """
        Enriches media items with technical metadata (FFprobe) and logical metadata (Guessit).
        Uses ThreadPool for FFprobe (CPU/IO) and Guessit/Logic.
        """
        import os

        if not items:
            return

        # 1. Technical Probing (ThreadPool for FFprobe)
        paths_to_probe = []
        probe_results = {}

        # Prepopulate with pre-probed data
        for path_str, raw_data in self.preprobed_data.items():
            probe_results[path_str] = raw_data

        for item in items:
            if self._stop_requested():
                logger.info("Scan stop requested before enrichment probing.")
                return
            path_str = item.original_path
            # Skip if we already pre-probed this or if it has duration set in database
            if path_str in self.preprobed_data:
                continue
            if item.duration is not None:
                continue
            paths_to_probe.append(path_str)

        if paths_to_probe:
            logger.info(f"Phase 2: Technical Probing for {len(paths_to_probe)} items...")
            update_scan_status({"phase": "probing", "total": len(paths_to_probe), "current": 0})
            
            max_workers_proc = min(os.cpu_count() or 4, 8)
            with ThreadPoolExecutor(max_workers=max_workers_proc) as executor:
                future_to_path = {executor.submit(self.prober.probe, p): p for p in paths_to_probe}
                for future in future_to_path:
                    if self._stop_requested():
                        for pending in future_to_path:
                            pending.cancel()
                        logger.info("Scan stop requested during enrichment probing.")
                        return
                    path = future_to_path[future]
                    try:
                        probe_results[path] = future.result()
                    except Exception as e:
                        logger.error(f"FFprobe failed for {path}: {e}")
                        probe_results[path] = None
                    finally:
                        increment_scan_status_current()

        logger.info(f"Phase 3: Metadata Enrichment for {len(items)} items...")
        update_scan_status({"phase": "enriching", "total": len(items), "current": 0})
        
        # Prepare pure dictionary data for threads to avoid SQLAlchemy issues
        tasks_data = []
        for item in items:
            if self._stop_requested():
                logger.info("Scan stop requested before metadata enrichment.")
                return
            tasks_data.append((
                item.id,
                {
                    "original_path": item.original_path,
                    "filename": item.filename,
                    "folder_name": item.folder_name,
                    "internal_title": item.internal_title,
                    "duration": item.duration,
                    "size": item.size,
                    "resolution": item.resolution,
                    "extension": item.extension,
                    "extras": [
                        {"id": ex.id, "original_path": ex.original_path, "category": ex.category}
                        for ex in item.extras
                    ]
                }
            ))

        def parse_worker(task_data):
            # Purely CPU/IO work, no SQLAlchemy!
            item_id, item_dict = task_data
            try:
                result = {"id": item_id, "status": "OK", "updates": {}, "extras": []}
                
                # NFO (IMDb ID)
                p = Path(item_dict["original_path"])
                nfo_imdb_id = self.nfo_parser.get_imdb_id(p)
                result["updates"]["nfo_imdb_id"] = nfo_imdb_id
                
                # Technical data from probe results
                probe_data = probe_results.get(item_dict["original_path"])
                if probe_data:
                    tech_info = self.prober.extract_info(probe_data)
                    result["updates"]["duration"] = tech_info["duration"]
                    result["updates"]["size"] = tech_info["size"] or item_dict["size"]
                    result["updates"]["resolution"] = tech_info["resolution"]
                    result["updates"]["video_codec"] = tech_info["video_codec"]
                    result["updates"]["video_bitrate"] = tech_info["video_bitrate"]
                    result["updates"]["audio_codec"] = tech_info["audio_codec"]
                    result["updates"]["audio_channels"] = tech_info["audio_channels"]
                    result["updates"]["audio_bitrate"] = tech_info["audio_bitrate"]
                    result["updates"]["framerate"] = tech_info["framerate"]
                    result["updates"]["bit_depth"] = tech_info["bit_depth"]
                    result["updates"]["hdr_type"] = tech_info["hdr_type"]
                    result["updates"]["audio_streams"] = tech_info["audio_streams"]
                    result["updates"]["internal_title"] = tech_info["internal_title"]
                else:
                    if not item_dict["duration"]:
                        result["status"] = "ERROR"

                internal_title = result["updates"].get("internal_title") or item_dict["internal_title"]
                duration = result["updates"].get("duration") or item_dict["duration"]
                size = result["updates"].get("size") or item_dict["size"]
                resolution = result["updates"].get("resolution") or item_dict["resolution"]

                # Guessit analysis
                triple = {}
                if not nfo_imdb_id:
                    triple = self.analyzer.get_triple_data(
                        internal_title, item_dict["filename"], item_dict["folder_name"]
                    )
                    
                    fn = triple.get("fn", {})
                    result["updates"]["fn_title"] = self.analyzer.reconstruct_title(fn, item_dict["filename"])
                    result["updates"]["fn_year"] = fn.get('year')
                    result["updates"]["fn_season"] = fn.get('season')
                    result["updates"]["fn_episode"] = str(fn.get('episode')) if fn.get('episode') else None
                    
                    fd = triple.get("fd", {})
                    result["updates"]["fd_title"] = self.analyzer.reconstruct_title(fd, item_dict["folder_name"])
                    result["updates"]["fd_year"] = fd.get('year')
                    result["updates"]["fd_season"] = fd.get('season')
                    result["updates"]["fd_episode"] = str(fd.get('episode')) if fd.get('episode') else None

                    it = triple.get("it", {})
                    result["updates"]["it_title"] = self.analyzer.reconstruct_title(it, internal_title) if internal_title else None
                    result["updates"]["it_year"] = it.get('year')
                    result["updates"]["it_season"] = it.get('season')
                    result["updates"]["it_episode"] = str(it.get('episode')) if it.get('episode') else None
                    
                    it_type = it.get('type')
                    if it_type == 'episode' and not it.get('season'):
                        it_type = 'movie'
                    result["updates"]["it_item_type"] = it_type

                    # Decision Logic
                    item_type = self.decision_engine.determine_item_type(
                        triple, item_dict["filename"], item_dict["folder_name"], has_nfo=bool(nfo_imdb_id)
                    )
                    result["updates"]["item_type"] = item_type
                    
                    cleanup = self.decision_engine.get_clean_metadata(item_type, triple)
                    if cleanup:
                        if "season" in cleanup: result["updates"]["fn_season"] = cleanup["season"]
                        if "episode" in cleanup: result["updates"]["fn_episode"] = cleanup["episode"]

                    result["updates"]["fn_item_type"] = fn.get('type')
                    result["updates"]["fd_item_type"] = fd.get('type')
                    
                    # Part Detection
                    raw_part = fn.get('part') or fn.get('cd') or fn.get('disc') or fn.get('volume')
                    if raw_part:
                        title_lower = (result["updates"].get("fn_title") or "").lower()
                        is_part_of_title = "part" in title_lower or "episode" in title_lower
                        has_episode_num = fn.get('episode') is not None
                        
                        if not is_part_of_title and not has_episode_num:
                            try:
                                val = int(raw_part)
                                result["updates"]["fn_part"] = val
                                result["updates"]["part"] = val
                            except (ValueError, TypeError):
                                pass
                            
                            if 'cd' in fn: result["updates"]["part_type"] = PartType.CD
                            elif 'disc' in fn: result["updates"]["part_type"] = PartType.DISC
                            elif 'volume' in fn: result["updates"]["part_type"] = PartType.VOLUME
                            else: result["updates"]["part_type"] = PartType.PART

                    # Group Hash
                    result["updates"]["group_hash"] = self.analyzer.generate_group_hash(
                        title=result["updates"].get("fn_title") or result["updates"].get("fd_title") or item_dict["folder_name"],
                        year=result["updates"].get("fn_year") or result["updates"].get("fd_year"),
                        season=result["updates"].get("fn_season"),
                        episode=fn.get('episode')
                    )

                    # Planned Path
                    res = resolution or ""
                    if res and "x" in res.lower() and "p" not in res.lower():
                        try:
                            from ..formatter.tech_mapping import map_resolution
                            parts = res.lower().split("x")
                            if len(parts) == 2:
                                res = map_resolution(int(parts[0]), int(parts[1]))
                        except: pass

                    lite_ctx = {
                        "title": result["updates"].get("fn_title") or result["updates"].get("fd_title") or item_dict["filename"],
                        "year": str(result["updates"].get("fn_year") or result["updates"].get("fd_year") or ""),
                        "resolution": res,
                        "ext": item_dict["extension"] or ""
                    }
                    if item_type == ItemType.EPISODE:
                        lite_ctx["series_title"] = lite_ctx["title"]
                        lite_ctx["season"] = self.formatter.format_number(result["updates"].get("fn_season") or "1")
                        lite_ctx["episode"] = self.formatter.format_number(result["updates"].get("fn_episode") or "0")
                        result["updates"]["planned_path"] = self.formatter.format_episode_filename(lite_ctx)
                    else:
                        result["updates"]["planned_path"] = self.formatter.format_movie_filename(lite_ctx)

                # Extras language
                for extra_dict in item_dict["extras"]:
                    if extra_dict["category"] in [ExtraCategory.SUBTITLE, ExtraCategory.AUDIO]:
                        lang = self.analyzer.extract_language(extra_dict["original_path"])
                        result["extras"].append({"id": extra_dict["id"], "language": lang})

                return result
            except Exception as e:
                import traceback
                logger.error(f"Error enriching item task: {e}")
                logger.error(traceback.format_exc())
                return {"id": item_id, "status": "ERROR"}

        # Run in thread pool
        import concurrent.futures
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = {executor.submit(parse_worker, data): data[0] for data in tasks_data}
            for future in concurrent.futures.as_completed(futures):
                if self._stop_requested():
                    for pending in futures:
                        pending.cancel()
                    logger.info("Scan stop requested during metadata enrichment.")
                    return
                results.append(future.result())
                increment_scan_status_current()

        # Update DB sequentially in main thread
        items_dict = {item.id: item for item in items}
        for res in results:
            if self._stop_requested():
                logger.info("Scan stop requested before enrichment commit.")
                return
            item = items_dict.get(res["id"])
            if not item: continue
            
            if res.get("status") == "ERROR":
                item.status = ItemStatus.ERROR
            else:
                for k, v in res.get("updates", {}).items():
                    setattr(item, k, v)
                
                for ext_res in res.get("extras", []):
                    for extra in item.extras:
                        if extra.id == ext_res["id"]:
                            extra.language = ext_res["language"]

        self.db.commit()


        logger.info("Enrichment complete.")

    def resolve_all(self, items: List[MediaItem]):
        """
        Performs online metadata resolution using TMDB/IMDb.
        """
        if not items:
            return

        if self._stop_requested():
            logger.info("Scan stop requested before metadata resolution.")
            return

        logger.info(f"Phase 4: API Metadata Resolution for {len(items)} items...")
        update_scan_status({"phase": "resolving", "total": len(items), "current": 0})

        # Deduplicate items by group_hash to avoid race conditions in propagate_match
        unique_items = []
        seen_hashes = set()
        for item in items:
            if not item.group_hash:
                unique_items.append(item)
            elif item.group_hash not in seen_hashes:
                unique_items.append(item)
                seen_hashes.add(item.group_hash)
        
        item_ids = [item.id for item in unique_items]

        # Read settings once on the scanner thread. Worker threads use their own
        # sessions, so API work can overlap without sharing ORM state.
        from ..db.models import UserSetting
        primary_lang = "en"
        fallback_lang = None
        try:
            pl = self.db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
            fl = self.db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()
            if pl and pl.value:
                primary_lang = pl.value
            if fl and fl.value and fl.value != "none":
                fallback_lang = fl.value
        except Exception as settings_ex:
            logger.warning(f"Failed to load metadata language settings before resolution: {settings_ex}")

        def resolve_task(item_id: int):
            max_attempts = 3
            try:
                for attempt in range(max_attempts):
                    local_db = DbSession()
                    try:
                        item = local_db.query(MediaItem).filter(MediaItem.id == item_id).first()
                        if not item:
                            return

                        resolver = Resolver(local_db)
                        resolver.resolve_item(item, language=primary_lang)
                        resolver.propagate_match(item)

                        if item.status == ItemStatus.MATCHED:
                            from .metadata_enricher import MetadataEnricher

                            enricher = MetadataEnricher(local_db)
                            enricher.enrich_matched_item(item, language=primary_lang, fallback_language=fallback_lang)

                            if item.group_hash:
                                siblings = local_db.query(MediaItem).filter(
                                    MediaItem.group_hash == item.group_hash,
                                    MediaItem.id != item.id,
                                    MediaItem.status == ItemStatus.MATCHED
                                ).all()
                                for sib in siblings:
                                    try:
                                        enricher.enrich_matched_item(sib, language=primary_lang, fallback_language=fallback_lang)
                                    except Exception as sib_ex:
                                        logger.warning(f"Failed to enrich sibling item {sib.id}: {sib_ex}")
                        return
                    except OperationalError as e:
                        local_db.rollback()
                        if "database is locked" not in str(e).lower() or attempt == max_attempts - 1:
                            raise
                        wait_seconds = 0.25 * (attempt + 1)
                        logger.warning(f"Database was locked while resolving item ID {item_id}; retrying in {wait_seconds:.2f}s")
                        time.sleep(wait_seconds)
                    finally:
                        DbSession.remove()
            except Exception as e:
                import traceback
                logger.error(f"Error resolving item ID {item_id}: {e}")
                logger.error(traceback.format_exc())
                local_db = DbSession()
                try:
                    db_item = local_db.query(MediaItem).filter(MediaItem.id == item_id).first()
                    if db_item:
                        db_item.status = ItemStatus.ERROR
                        local_db.commit()
                except Exception as status_ex:
                    logger.error(f"Failed to set ERROR status for item ID {item_id}: {status_ex}")
                    local_db.rollback()
                finally:
                    DbSession.remove()
            finally:
                increment_scan_status_current()

        # ThreadPool for network requests (limited to avoid rate limit)
        max_workers = min(5, len(item_ids)) or 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_item = {}
            item_iter = iter(item_ids)

            while not self._stop_requested():
                while len(future_to_item) < max_workers:
                    try:
                        item_id = next(item_iter)
                    except StopIteration:
                        break
                    future = executor.submit(resolve_task, item_id)
                    future_to_item[future] = item_id

                if not future_to_item:
                    break

                done, _pending = wait(set(future_to_item.keys()), return_when=FIRST_COMPLETED)
                for future in done:
                    future.result()
                    future_to_item.pop(future, None)

            for future in list(future_to_item.keys()):
                future.result()

        logger.info("Resolution complete.")

    def _stop_requested(self) -> bool:
        if is_scan_stop_requested():
            update_scan_status({"message": "Stopping safely..."})
            return True
        return False
