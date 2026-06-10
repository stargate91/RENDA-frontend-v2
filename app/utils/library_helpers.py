from pathlib import Path
from typing import Optional

MEDIA_IMAGE_ROOT = Path("data/media/images")

def match_language_code(lang_a: Optional[str], lang_b: Optional[str]) -> bool:
    if not lang_a or not lang_b:
        return False
    a = lang_a.lower()
    b = lang_b.lower()
    return a == b or a.split("-")[0] == b.split("-")[0]

def public_image_path(path: Optional[str], subfolder: str) -> Optional[str]:
    if not path or path.startswith("http://") or path.startswith("https://"):
        return None

    clean_path = path.replace("\\", "/")
    marker = f"media/images/{subfolder}/"
    filename = clean_path.split(marker, 1)[1] if marker in clean_path else clean_path.lstrip("/")
    local_file = MEDIA_IMAGE_ROOT / subfolder / filename
    if local_file.exists() and local_file.stat().st_size > 100:
        return f"/{filename}"
    return None
