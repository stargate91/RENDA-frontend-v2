import traceback
import threading
from sqlalchemy.orm import Session
from app.db.base import Session as DbSession
from app.db.models import MediaItem, ItemStatus, UserSetting, ImageStatus
from app.scanner.metadata_enricher import MetadataEnricher
from app.scanner.scanner_manager import scan_status, scan_status_lock
from app.scanner.image_worker import ImageWorker
from app.utils.logger import logger

class LanguageSyncService:
    """
    Handles background synchronization of metadata languages.
    """
    @staticmethod
    def run_sync():
        db = DbSession()
        import time
        start_time = time.time()
        try:
            lang = db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
            fallback = db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()
            
            target_lang = lang.value if lang else "en"
            fallback_lang = fallback.value if fallback and fallback.value != "none" else None

            logger.info(f"LanguageSyncService: Starting sync. Target={target_lang}, Fallback={fallback_lang}")

            items = db.query(MediaItem).filter(MediaItem.status.in_([
                ItemStatus.MATCHED, ItemStatus.RENAMED, ItemStatus.ORGANIZED
            ])).all()

            enricher = MetadataEnricher(db)
            
            with scan_status_lock:
                scan_status["active"] = True
                scan_status["phase"] = "enriching"
                scan_status["progress"] = 0.0
                scan_status["current_item"] = f"Syncing {len(items)} items..."
                scan_status["processed_files"] = 0
                scan_status["total_files"] = len(items)

            for idx, item in enumerate(items):
                with scan_status_lock:
                    scan_status["current_item"] = item.filename
                    scan_status["processed_files"] = idx
                    if len(items) > 0:
                        scan_status["progress"] = (idx / len(items)) * 100
                
                try:
                    enricher.enrich_matched_item(item, language=target_lang, fallback_language=fallback_lang)
                    
                    # Reset the images to PENDING so that the posters in the new language are downloaded
                    for match in item.matches:
                        if match.is_active:
                            match.image_status = ImageStatus.PENDING
                            match.backdrop_status = ImageStatus.PENDING
                    
                    db.commit()
                except Exception as e:
                    logger.error(f"Error enriching item {item.id} ({item.filename}): {e}")
                    logger.error(traceback.format_exc())
                    db.rollback()
            
            with scan_status_lock:
                scan_status["active"] = False
                scan_status["phase"] = "idle"
                scan_status["progress"] = 100.0
                
            elapsed = time.time() - start_time
            logger.info(f"LanguageSyncService: Sync COMPLETED successfully for {len(items)} items in {elapsed:.2f} seconds.")

        except Exception as e:
            db.rollback()
            logger.error(f"Error syncing language: {e}")
            logger.error(traceback.format_exc())
            with scan_status_lock:
                scan_status["active"] = False
                scan_status["phase"] = "idle"
        finally:
            db.close()
