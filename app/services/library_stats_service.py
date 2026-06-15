from sqlalchemy.orm import Session
from ..repositories.media_repository import MediaRepository
from ..schemas.media import LibraryStatsDTO

class LibraryStatsService:
    """
    Service for library dashboard statistics and counts.
    """

    def __init__(self, db: Session):
        self.db = db
        self.repository = MediaRepository(db)

    def _format_size(self, size_bytes: int) -> str:
        if size_bytes >= 1024 ** 4:
            return f"{size_bytes / (1024 ** 4):.1f} TB"
        if size_bytes >= 1024 ** 3:
            return f"{size_bytes / (1024 ** 3):.1f} GB"
        return f"{size_bytes / (1024 ** 2):.0f} MB"

    def get_stats(self) -> LibraryStatsDTO:
        stats = self.repository.get_stats()

        drives = set()
        for path_str in stats["items"]:
            if path_str:
                if ":" in path_str:
                    drives.add(path_str.split(":")[0].upper() + ":")
                elif path_str.startswith("/"):
                    parts = path_str.split("/")
                    if len(parts) > 2 and parts[1] in ["mnt", "media", "Volumes"]:
                        drives.add("/" + parts[1] + "/" + parts[2])
                    else:
                        drives.add("/")

        total_bytes = stats["total_bytes"]
        storage_str = self._format_size(total_bytes)
        storage_breakdown = {
            key: self._format_size(value)
            for key, value in stats.get("storage_breakdown", {}).items()
        }

        return LibraryStatsDTO(
            total_movies=stats["total_movies"],
            total_series=stats["total_series"],
            total_episodes=stats["total_episodes"],
            total_adult_movies=stats.get("total_adult_movies", 0),
            storage=storage_str,
            drive_count=len(drives) if drives else 0,
            unmatched=stats["unmatched"],
            storage_breakdown=storage_breakdown,
            manual_review_total=stats.get("manual_review_total", 0),
            manual_review_breakdown=stats.get("manual_review_breakdown", {}),
            genre_distribution=stats.get("genre_distribution", {}),
            genre_distribution_ids=stats.get("genre_distribution_ids", {}),
            genre_labels=stats.get("genre_labels", {}),
            genre_constellation=stats.get("genre_constellation", {}),
            decade_distribution=stats.get("decade_distribution", {}),
        )
