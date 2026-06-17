import requests
import threading
from typing import Optional
from pathlib import Path
from ...utils.logger import logger
from ...services.image_processing_service import ImageProcessingService


class ImageDownloaderMixin:
    BASE_URL = "https://image.tmdb.org/t/p/"

    def _ensure_folders(self):
        """Creates the necessary subdirectories for different image types."""
        self.image_processor = ImageProcessingService(self.storage_path)
        self.image_processor.ensure_folders()

    def _get_path_lock(self, target_path: Path) -> threading.Lock:
        key = str(target_path).lower()
        with self._path_locks_guard:
            lock = self._path_locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._path_locks[key] = lock
            return lock

    def download_image(self, tmdb_path: str, subfolder: str, size: str = "original") -> Optional[str]:
        """
        Downloads an image from TMDB and returns the local relative path.
        """
        if not tmdb_path:
            return None

        filename = tmdb_path.lstrip("/")
        local_file_path = self.image_processor.build_local_path(subfolder, filename)
        url = f"{self.BASE_URL}{size}{tmdb_path}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        path_lock = self._get_path_lock(local_file_path)
        
        with path_lock:
            if self.image_processor.exists(local_file_path):
                return str(local_file_path)

            try:
                response = self.session.get(url, stream=True, timeout=(5, 20), headers=headers)
                if response.status_code == 200:
                    # Verify it's actually an image
                    content_type = response.headers.get("Content-Type", "")
                    if "image" not in content_type.lower():
                        logger.error(f"Invalid content type for {url}: {content_type}")
                        return None

                    saved_path = self.image_processor.write_chunks(local_file_path, response.iter_content(4096))
                    if not saved_path:
                        logger.error(f"Downloaded file too small for {url}")
                        return None

                    return saved_path
                else:
                    logger.error(f"Image download failed ({url}): HTTP {response.status_code}")
            except Exception as e:
                logger.error(f"Image download failed ({url}): {e}")
        
        return None
