import os
import concurrent.futures
from pathlib import Path
from typing import List
from sqlalchemy.orm import Session

from .probe import TechnicalProber
from .nfo_parser import NFOParser
from .analyzer import Analyzer
from .decision_engine import DecisionEngine
from ..db.models import MediaItem, ItemStatus, ItemType
from ..utils.logger import logger
from .status import update_scan_status, increment_scan_status_current, is_scan_stop_requested
from .mappers import map_guessit_source, map_guessit_edition, map_guessit_audio_type

class ScanEnricher:
    def __init__(
        self,
        db: Session,
        prober: TechnicalProber,
        nfo_parser: NFOParser,
        analyzer: Analyzer,
        decision_engine: DecisionEngine,
        preprobed_data: dict,
    ):
        self.db = db
        self.prober = prober
        self.nfo_parser = nfo_parser
        self.analyzer = analyzer
        self.decision_engine = decision_engine
        self.preprobed_data = preprobed_data

    def _stop_requested(self) -> bool:
        if is_scan_stop_requested():
            update_scan_status({"message": "Stopping safely..."})
            return True
        return False

    def enrich_all(self, items: List[MediaItem], probe_infos: dict):
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
            if path_str in self.preprobed_data:
                continue
            if item.duration is not None:
                continue
            paths_to_probe.append(path_str)

        if paths_to_probe:
            logger.info(f"Phase 2: Technical Probing for {len(paths_to_probe)} items...")
            update_scan_status({"phase": "probing", "total": len(paths_to_probe), "current": 0})
            
            max_workers_proc = min(os.cpu_count() or 4, 8)
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers_proc) as executor:
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
                if True:
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

                    # Extract Guessit source, edition, audio_type with priority: fn > it > fd
                    guessit_source = fn.get("source")
                    guessit_edition = fn.get("edition")
                    guessit_other = fn.get("other")
                    guessit_languages = fn.get("language")

                    if not guessit_source: guessit_source = it.get("source")
                    if not guessit_edition: guessit_edition = it.get("edition")
                    if not guessit_other: guessit_other = it.get("other")
                    if not guessit_languages: guessit_languages = it.get("language")

                    if not guessit_source: guessit_source = fd.get("source")
                    if not guessit_edition: guessit_edition = fd.get("edition")
                    if not guessit_other: guessit_other = fd.get("other")
                    if not guessit_languages: guessit_languages = fd.get("language")

                    result["updates"]["source"] = map_guessit_source(guessit_source)
                    result["updates"]["edition"] = map_guessit_edition(guessit_edition)
                    result["updates"]["audio_type"] = map_guessit_audio_type(guessit_other, guessit_languages)

                # Extras processing (checking if guessit language matches any extra file)
                for ex_dict in item_dict["extras"]:
                    from ..db.models import ExtraCategory
                    if ex_dict["category"] in (ExtraCategory.SUBTITLE, ExtraCategory.AUDIO):
                        ex_path = Path(ex_dict["original_path"])
                        lang_val = self.analyzer.extract_language(ex_path.name)
                        result["extras"].append({"id": ex_dict["id"], "language": lang_val})

                return result
            except Exception as e:
                import traceback
                logger.error(f"Failed to enrich item {item_id}: {e}")
                logger.error(traceback.format_exc())
                return {"id": item_id, "status": "ERROR"}

        # Run in thread pool
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
