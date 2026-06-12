from typing import List, Optional
from sqlalchemy.orm import Session

from .collector import Collector
from .categorizer import Categorizer
from .linker import Linker
from .probe import TechnicalProber
from .analyzer import Analyzer
from .decision_engine import DecisionEngine
from .nfo_parser import NFOParser
from ..formatter.formatter import Formatter
from ..db.models import MediaItem
from ..utils.logger import logger

from .status import scan_status, scan_status_lock, update_scan_status, is_scan_stop_requested
from .scan_collector import ScanCollector
from .scan_enricher import ScanEnricher
from .scan_resolver import ScanResolver

class ScannerManager:
    """
    Coordinator for the entire scanning and data enrichment pipeline.
    Acts as a facade delegating tasks to modular phase managers.
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
        collector_phase = ScanCollector(
            db=self.db,
            prober=self.prober,
            collector=self.collector,
            categorizer=self.categorizer,
            linker=self.linker,
            min_video_duration_minutes=self.min_video_duration_minutes,
            preprobed_data=self.preprobed_data,
        )
        
        try:
            res = collector_phase.collect_and_save(paths)
            if res is None:
                return  # Stop requested
            
            to_process, probe_infos = res
            
            # PHASE 2 & 3: Technical Probing & Enrichment
            if to_process and not self._stop_requested():
                logger.info(f"Scan complete. {len(to_process)} items need processing.")
                self.enrich_all(to_process, probe_infos)
                
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
            update_scan_status({"active": False, "phase": "idle", "can_stop": False, "stop_requested": False, "message": None})
            
            try:
                from .people_hydrator import people_hydrator
                people_hydrator.start()
            except Exception as e:
                logger.error(f"Failed to start people hydrator: {e}")

    def enrich_all(self, items: List[MediaItem], probe_infos: Optional[dict] = None):
        """
        Enriches media items with technical metadata (FFprobe) and logical metadata (Guessit).
        """
        enricher_phase = ScanEnricher(
            db=self.db,
            prober=self.prober,
            nfo_parser=self.nfo_parser,
            analyzer=self.analyzer,
            decision_engine=self.decision_engine,
            preprobed_data=self.preprobed_data,
        )
        enricher_phase.enrich_all(items, probe_infos or {})

    def resolve_all(self, items: List[MediaItem]):
        """
        Performs online metadata resolution using TMDB/IMDb.
        """
        resolver_phase = ScanResolver(db=self.db)
        resolver_phase.resolve_all(items)

    def _stop_requested(self) -> bool:
        if is_scan_stop_requested():
            update_scan_status({"message": "Stopping safely..."})
            return True
        return False
