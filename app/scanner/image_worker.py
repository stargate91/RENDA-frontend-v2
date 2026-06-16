import requests
import threading
from pathlib import Path
from sqlalchemy.orm import Session

from .images.downloader import ImageDownloaderMixin
from .images.batch_processor import ImageBatchProcessorMixin


class ImageWorker(ImageDownloaderMixin, ImageBatchProcessorMixin):
    """
    Background engine for downloading media assets (posters, backdrops, etc.).
    Supports parallel downloads and memory-efficient batch processing.
    """
    
    def __init__(self, db_session: Session, storage_path: str):
        self.db = db_session
        self.storage_path = Path(storage_path) / "media" / "images"
        self._ensure_folders()
        self._path_locks = {}
        self._path_locks_guard = threading.Lock()
        
        # Central session with retries
        self.session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(max_retries=3)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
