from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.models import Person, ImageStatus

class PersonRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, person_id: int) -> Optional[Person]:
        return self.db.query(Person).filter(Person.id == person_id).first()

    def get_count(self) -> int:
        return self.db.query(Person).count()

    def get_completed_image_count(self) -> int:
        return self.db.query(Person).filter(Person.image_status.in_([ImageStatus.COMPLETED, ImageStatus.FAILED])).count()

    def get_pending_image_count(self) -> int:
        return self.db.query(Person).filter(Person.image_status.in_([ImageStatus.PENDING, ImageStatus.DOWNLOADING])).count()

    def get_pending_alt_images_count(self) -> int:
        return self.db.query(Person).filter(
            Person.images == None,
            Person.image_status.in_([ImageStatus.COMPLETED, ImageStatus.FAILED])
        ).count()

    def get_failed_image_count(self) -> int:
        return self.db.query(Person).filter(Person.image_status == ImageStatus.FAILED).count()

    def reset_image_status(self):
        self.db.query(Person).filter(Person.image_status == ImageStatus.PENDING).update({"image_status": ImageStatus.FAILED})

    def commit(self):
        self.db.commit()
