import time
import concurrent.futures
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

from ..db.models import MediaItem, ItemStatus, UserSetting
from ..resolver.resolver import Resolver
from .metadata_enricher import MetadataEnricher
from ..db.base import Session as DbSession
from ..utils.logger import logger
from .status import update_scan_status, increment_scan_status_current, is_scan_stop_requested

class ScanResolver:
    def __init__(self, db: Session):
        self.db = db

    def _stop_requested(self) -> bool:
        if is_scan_stop_requested():
            update_scan_status({"message": "Stopping safely..."})
            return True
        return False

    def resolve_all(self, items: List[MediaItem]):
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
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
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

                done, _pending = concurrent.futures.wait(set(future_to_item.keys()), return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    future.result()
                    future_to_item.pop(future, None)

            for future in list(future_to_item.keys()):
                future.result()

        logger.info("Resolution complete.")
