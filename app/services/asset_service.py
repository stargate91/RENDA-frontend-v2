import logging
import threading
import uuid
import requests
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from PIL import Image

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
        self._ensure_folders()
        
        self.session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(max_retries=3)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def _ensure_folders(self):
        """Creates the necessary subdirectories for assets."""
        folders = ["posters", "backdrops", "logos", "persons", "stills", "thumbnails"]
        for folder in folders:
            (self.image_path / folder).mkdir(parents=True, exist_ok=True)

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

        is_remote_url = isinstance(tmdb_path, str) and tmdb_path.startswith(("http://", "https://"))
        if is_remote_url:
            parsed = urlparse(tmdb_path)
            suffix = Path(parsed.path).suffix or ".jpg"
            filename = f"{uuid.uuid4().hex}{suffix}"
            url = tmdb_path
        else:
            filename = tmdb_path.lstrip("/")
            url = f"{self.TMDB_IMAGE_BASE}{size}{tmdb_path}"

        local_file_path = self.image_path / subfolder / filename

        lock = self._get_download_lock(local_file_path)
        with lock:
            if local_file_path.exists() and local_file_path.stat().st_size > 100:
                return str(local_file_path)

            local_file_path.parent.mkdir(parents=True, exist_ok=True)
            temp_file_path = local_file_path.with_name(f"{local_file_path.name}.{uuid.uuid4().hex}.tmp")
            headers = {"User-Agent": "Renda Media Manager/1.0"}

            try:
                response = self.session.get(url, stream=True, timeout=(5, 30), headers=headers)
                if response.status_code != 200:
                    logger.error(f"Image download failed ({url}): HTTP {response.status_code}")
                    return None

                content_type = response.headers.get("Content-Type", "")
                if "image" not in content_type.lower():
                    logger.error(f"Invalid content type for {url}: {content_type}")
                    return None

                with open(temp_file_path, "wb") as f:
                    for chunk in response.iter_content(8192):
                        if chunk:
                            f.write(chunk)

                if not temp_file_path.exists() or temp_file_path.stat().st_size < 100:
                    logger.error(f"Downloaded file too small: {url}")
                    temp_file_path.unlink(missing_ok=True)
                    return None

                temp_file_path.replace(local_file_path)
                return str(local_file_path)
            except Exception as e:
                logger.error(f"Image download exception ({url}): {e}")
                temp_file_path.unlink(missing_ok=True)
                return None

    def generate_thumbnail(self, source_path: str, width: int = 300) -> Optional[str]:
        """Generates a small WebP thumbnail for fast UI preview."""
        try:
            src = Path(source_path)
            if not src.exists():
                return None
            
            thumb_filename = src.stem + "_thumb.webp"
            thumb_path = self.image_path / "thumbnails" / thumb_filename
            
            if thumb_path.exists():
                return str(thumb_path)
            
            with Image.open(src) as img:
                # Maintain aspect ratio
                w_percent = (width / float(img.size[0]))
                h_size = int((float(img.size[1]) * float(w_percent)))
                img = img.resize((width, h_size), Image.Resampling.LANCZOS)
                img.save(thumb_path, "WEBP", quality=80)
            
            return str(thumb_path)
        except Exception as e:
            logger.error(f"Thumbnail generation failed ({source_path}): {e}")
            # If image is corrupt, delete source to force re-download
            try:
                if Path(source_path).exists():
                    Path(source_path).unlink()
            except: pass
            return None
