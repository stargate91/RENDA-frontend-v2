from pydantic import BaseModel
from typing import Optional

class ScanStatusDTO(BaseModel):
    active: bool
    total: int
    current: int
    phase: str
    start_time: float
    progress: float = 0.0

    @classmethod
    def from_dict(cls, data: dict):
        progress = (data["current"] / data["total"] * 100) if data.get("total", 0) > 0 else 0
        return cls(**data, progress=progress)

class ImageStatusDTO(BaseModel):
    active: bool
    pending: int
    downloading: int
    total: int
    completed: int
    progress: float
