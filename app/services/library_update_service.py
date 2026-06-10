from sqlalchemy.orm import Session

from .media_action_service import MediaActionService


class LibraryUpdateService:
    """
    State-changing library operations.
    Currently delegates to the existing action service while keeping
    a library-specific boundary for future metadata/status updates.
    """

    def __init__(self, db: Session):
        self.db = db
        self.actions = MediaActionService(db)

    def delete_media_and_extras(self, item_ids: list[int], extra_ids: list[int]):
        return self.actions.delete_media_and_extras(item_ids, extra_ids)

    def update_properties(self, target_id: int, target_type: str, updates: dict):
        return self.actions.update_properties(target_id, target_type, updates)
