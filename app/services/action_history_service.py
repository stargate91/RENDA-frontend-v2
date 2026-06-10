import logging
from typing import List, Optional, Any
from sqlalchemy.orm import Session
from ..db.models import ActionBatch, ActionLog, ActionType, ActionStatus

logger = logging.getLogger(__name__)

class ActionHistoryService:
    """
    Service for managing the history of actions (moves, renames, deletes).
    Provides methods for logging, batching, and tracking undoable operations.
    """

    def __init__(self, db: Session):
        self.db = db

    def create_batch(self, name: Optional[str] = None) -> ActionBatch:
        """Creates a new batch to group related actions."""
        batch = ActionBatch(name=name)
        self.db.add(batch)
        self.db.commit()
        self.db.refresh(batch)
        return batch

    def log_action(self, batch_id: int, 
                   media_item_id: Optional[int] = None, 
                   extra_file_id: Optional[int] = None,
                   action_type: ActionType = ActionType.RENAME,
                   status: ActionStatus = ActionStatus.SUCCESS,
                   old_value: Optional[str] = None,
                   new_value: Optional[str] = None,
                   error: Optional[str] = None) -> ActionLog:
        """Logs a single action to the database."""
        log = ActionLog(
            batch_id=batch_id,
            media_item_id=media_item_id,
            extra_file_id=extra_file_id,
            action_type=action_type,
            status=status,
            old_value=old_value,
            new_value=new_value,
            error_message=error
        )
        self.db.add(log)
        # We don't commit here to allow the caller to group DB operations
        return log

    def get_batch_logs(self, batch_id: int, only_successful: bool = True) -> List[ActionLog]:
        """Retrieves logs for a specific batch, optionally filtered by success."""
        query = self.db.query(ActionLog).filter(ActionLog.batch_id == batch_id)
        if only_successful:
            query = query.filter(ActionLog.status == ActionStatus.SUCCESS)
        return query.order_by(ActionLog.id.desc()).all()

    def get_recent_batches(self, limit: int = 10) -> List[ActionBatch]:
        """Returns the most recent action batches."""
        return self.db.query(ActionBatch).order_by(ActionBatch.created_at.desc()).limit(limit).all()

    def mark_log_undone(self, log_id: int):
        """Updates a log status to UNDONE."""
        log = self.db.query(ActionLog).get(log_id)
        if log:
            log.status = ActionStatus.UNDONE
            self.db.commit()
