import re
from typing import Optional

def _normalize_title(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = re.sub(r"[\W_]+", " ", str(value).casefold(), flags=re.UNICODE)
    return " ".join(normalized.split())
