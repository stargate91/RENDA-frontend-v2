import logging
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session

from ..db.models import ActionBatch, ActionStatus
from ..renamer.renamer_engine import RenamerEngine
from ..formatter.formatter import RenamePreview
from ..services.action_history_service import ActionHistoryService

logger = logging.getLogger(__name__)

class JobStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class JobOrchestrator:
    """
    Orchestrates long-running batch operations (like mass renaming).
    Manages job lifecycle, progress tracking, and integration between services.
    """

    def __init__(self, db: Session):
        self.db = db
        self.renamer = RenamerEngine(db)
        self.history = ActionHistoryService(db)

    def run_rename_job(self, previews: List[RenamePreview], batch_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Starts a rename job and tracks its progress.
        """
        job_id = str(uuid.uuid4())
        total_items = len(previews)
        
        logger.info(f"Starting Rename Job {job_id} with {total_items} items.")
        
        # 1. Create a batch in the history
        batch_name = batch_name or f"Rename Job {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        batch = self.history.create_batch(name=batch_name)

        # 2. Execute (in a real production env, this could be sent to a background worker)
        # For now, we execute it and return the final report
        success_count = 0
        failed_items = []

        for i, preview in enumerate(previews):
            # Potential for progress update callback here
            success = self.renamer.execute_single(preview, batch.id)
            if success:
                success_count += 1
            else:
                failed_items.append(preview.target_name)

        # 3. Finalize
        status = JobStatus.COMPLETED if success_count == total_items else JobStatus.FAILED
        if success_count > 0 and success_count < total_items:
            status = "partial_success"

        report = {
            "job_id": job_id,
            "batch_id": batch.id,
            "status": status,
            "total": total_items,
            "success": success_count,
            "failed": len(failed_items),
            "failed_names": failed_items,
            "timestamp": datetime.now().isoformat()
        }
        
        logger.info(f"Job {job_id} finished. Status: {status}")
        return report

    def undo_job(self, batch_id: int) -> Dict[str, Any]:
        """
        Orchestrates an undo operation for a specific batch.
        """
        logger.info(f"Starting Undo Job for batch {batch_id}")
        
        undo_count = self.renamer.undo_batch(batch_id)
        
        return {
            "batch_id": batch_id,
            "status": JobStatus.COMPLETED,
            "undone_count": undo_count,
            "timestamp": datetime.now().isoformat()
        }
