import os
import requests
import threading
from typing import Optional
from pathlib import Path
from ...utils.logger import logger


class ImageDownloaderMixin:
    BASE_URL = "https://image.tmdb.org/t/p/"

    def _ensure_folders(self):
        """Creates the necessary subdirectories for different image types."""
        for folder in ["posters", "backdrops", "logos", "persons", "stills"]:
            (self.storage_path / folder).mkdir(parents=True, exist_ok=True)

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
        local_file_path = self.storage_path / subfolder / filename
        url = f"{self.BASE_URL}{size}{tmdb_path}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        path_lock = self._get_path_lock(local_file_path)
        
        with path_lock:
            if local_file_path.exists():
                return str(local_file_path)

            temp_file_path = local_file_path.with_name(f"{local_file_path.name}.{threading.get_ident()}.tmp")
            try:
                response = self.session.get(url, stream=True, timeout=(5, 20), headers=headers)
                if response.status_code == 200:
                    # Verify it's actually an image
                    content_type = response.headers.get("Content-Type", "")
                    if "image" not in content_type.lower():
                        logger.error(f"Invalid content type for {url}: {content_type}")
                        return None

                    with open(temp_file_path, 'wb') as f:
                        for chunk in response.iter_content(4096):
                            if chunk:
                                f.write(chunk)
                    
                    # Double check file size - images shouldn't be tiny (e.g. < 100 bytes)
                    if temp_file_path.stat().st_size < 100:
                        logger.error(f"Downloaded file too small for {url}")
                        temp_file_path.unlink(missing_ok=True)
                        return None

                    try:
                        from PIL import Image
                        with Image.open(temp_file_path) as img:
                            img.verify()
                    except Exception as verify_error:
                        logger.error(f"Downloaded image validation failed ({url}): {verify_error}")
                        temp_file_path.unlink(missing_ok=True)
                        return None

                    os.replace(temp_file_path, local_file_path)
                    return str(local_file_path)
                else:
                    logger.error(f"Image download failed ({url}): HTTP {response.status_code}")
            except Exception as e:
                logger.error(f"Image download failed ({url}): {e}")
            finally:
                if temp_file_path.exists():
                    temp_file_path.unlink(missing_ok=True)
        
        return None
