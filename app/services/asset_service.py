import logging
import threading
import uuid
import requests
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from app.services.image_processing_service import ImageProcessingService

logger = logging.getLogger(__name__)

_download_locks_guard = threading.Lock()
_download_locks: dict[str, threading.Lock] = {}
class AssetService:
    """
    Service for managing media assets: downloading, storage, and processing (thumbnails).
    """
    TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/"

    def __init__(self, storage_root: str = "./data"):
        self.storage_root = Path(storage_root)
        self.image_path = self.storage_root / "media" / "images"
        self.processor = ImageProcessingService(self.image_path)
        self._ensure_folders()
        
        self.session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(max_retries=3)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def _ensure_folders(self):
        """Creates the necessary subdirectories for assets."""
        self.processor.ensure_folders()

    def _get_download_lock(self, local_file_path: Path) -> threading.Lock:
        key = str(local_file_path.resolve())
        with _download_locks_guard:
            lock = _download_locks.get(key)
            if lock is None:
                lock = threading.Lock()
                _download_locks[key] = lock
            return lock

    def download_image(self, tmdb_path: str, subfolder: str, size: str = "original") -> Optional[str]:
        """
        Downloads an image from TMDB and returns the local relative path.
        """
        if not tmdb_path:
            return None

        if isinstance(tmdb_path, str) and (tmdb_path.startswith("/media/") or "media/images/" in tmdb_path):
            clean_path = tmdb_path.replace("\\", "/")
            marker = f"media/images/{subfolder}/"
            filename = clean_path.split(marker, 1)[1] if marker in clean_path else clean_path.lstrip("/")
            if "media/images/" in filename:
                parts = filename.split("/")
                filename = parts[-1]
            local_file_path = self.processor.build_local_path(subfolder, filename)
            return str(local_file_path)

        is_remote_url = isinstance(tmdb_path, str) and tmdb_path.startswith(("http://", "https://"))
        if is_remote_url:
            import hashlib
            parsed = urlparse(tmdb_path)
            suffix = Path(parsed.path).suffix or ".jpg"
            url_hash = hashlib.md5(tmdb_path.encode("utf-8")).hexdigest()
            filename = f"{url_hash}{suffix}"
            url = tmdb_path
        else:
            filename = tmdb_path.lstrip("/")
            url = f"{self.TMDB_IMAGE_BASE}{size}{tmdb_path}"

        local_file_path = self.processor.build_local_path(subfolder, filename)

        if self.processor.exists(local_file_path.with_suffix(".svg")):
            return str(local_file_path.with_suffix(".svg"))

        lock = self._get_download_lock(local_file_path)
        with lock:
            if self.processor.exists(local_file_path):
                return str(local_file_path)

            headers = {"User-Agent": "Renda Media Manager/1.0"}

            try:
                response = self.session.get(url, stream=True, timeout=(5, 30), headers=headers)
                if response.status_code != 200:
                    logger.error(f"Image download failed ({url}): HTTP {response.status_code}")
                    return None

                content_type = response.headers.get("Content-Type", "").lower()
                if "svg" in content_type:
                    local_file_path = local_file_path.with_suffix(".svg")
                    if self.processor.exists(local_file_path):
                        return str(local_file_path)
                elif content_type and "image" not in content_type:
                    logger.warning(f"Suspicious content type for {url}: {content_type}. Trying to verify image payload anyway.")

                saved_path = self.processor.write_chunks(local_file_path, response.iter_content(8192))
                if not saved_path:
                    logger.error(f"Downloaded file too small: {url}")
                    return None

                return saved_path
            except Exception as e:
                logger.error(f"Image download exception ({url}): {e}")
                return None
