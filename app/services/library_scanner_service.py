from typing import Any

from sqlalchemy.orm import Session

from .scanner_service import ScannerService


class LibraryScannerService:
    """
    Library ingestion / scanning boundary.
    Wraps the existing scanner service so scan-related responsibilities
    can be referenced from the library domain without coupling callers
    to the lower-level implementation.
    """

    def __init__(self, db: Session):
        self.db = db

    def get_scan_status(self) -> dict[str, Any]:
        return ScannerService.get_scan_status()

    def get_image_status(self) -> dict[str, Any]:
        return ScannerService.get_image_status(self.db)

    def reset_image_status(self):
        return ScannerService.reset_image_status(self.db)

    def start_scan(self, paths: list[str]):
        return ScannerService.start_scan(paths)
