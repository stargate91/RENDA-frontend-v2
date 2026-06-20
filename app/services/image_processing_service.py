import shutil
import uuid
from pathlib import Path
from typing import BinaryIO, Iterable, Optional

from PIL import Image

from app.utils.library_utils.image_constants import MEDIA_IMAGE_FOLDERS, MIN_CACHED_IMAGE_BYTES


class ImageProcessingService:
    def __init__(self, image_root: str | Path):
        self.image_root = Path(image_root)

    def ensure_folders(self) -> None:
        for folder in MEDIA_IMAGE_FOLDERS:
            (self.image_root / folder).mkdir(parents=True, exist_ok=True)

    def build_local_path(self, subfolder: str, filename: str) -> Path:
        return self.image_root / subfolder / filename.lstrip("/")

    def exists(self, local_file_path: str | Path) -> bool:
        path = Path(local_file_path)
        return path.exists() and path.stat().st_size > MIN_CACHED_IMAGE_BYTES

    def write_chunks(self, local_file_path: str | Path, chunks: Iterable[bytes]) -> Optional[str]:
        target = Path(local_file_path)
        temp_file_path = target.with_name(f"{target.name}.{uuid.uuid4().hex}.tmp")
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(temp_file_path, "wb") as handle:
                for chunk in chunks:
                    if chunk:
                        handle.write(chunk)
            return self._finalize_temp_file(temp_file_path, target)
        finally:
            temp_file_path.unlink(missing_ok=True)

    def write_upload(self, local_file_path: str | Path, source: BinaryIO) -> Optional[str]:
        target = Path(local_file_path)
        temp_file_path = target.with_name(f"{target.name}.{uuid.uuid4().hex}.tmp")
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(temp_file_path, "wb") as handle:
                shutil.copyfileobj(source, handle)
            return self._finalize_temp_file(temp_file_path, target)
        finally:
            temp_file_path.unlink(missing_ok=True)

    def _finalize_temp_file(self, temp_file_path: Path, target: Path) -> Optional[str]:
        if not temp_file_path.exists() or temp_file_path.stat().st_size < MIN_CACHED_IMAGE_BYTES:
            return None

        is_svg = False
        try:
            with open(temp_file_path, "rb") as f:
                header = f.read(4096).strip().lower()
                if header.startswith(b"<svg") or header.startswith(b"<?xml") or b"<svg" in header:
                    is_svg = True
        except Exception:
            pass

        if not is_svg:
            with Image.open(temp_file_path) as image:
                image.verify()

        temp_file_path.replace(target)
        return str(target)
