from sqlalchemy.orm import Session
from app.services.library.details.formatter import DetailFormatterService

class BaseDetailProvider:
    def __init__(self, db: Session, formatter: DetailFormatterService):
        self.db = db
        self.formatter = formatter
