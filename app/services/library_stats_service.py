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
        for item in stats["items"]:
            if item.current_path:
                if ":" in item.current_path:
                    drives.add(item.current_path.split(":")[0].upper() + ":")
                elif item.current_path.startswith("/"):
                    parts = item.current_path.split("/")
                    if len(parts) > 2 and parts[1] in ["mnt", "media", "Volumes"]:
                        drives.add("/" + parts[1] + "/" + parts[2])
                    else:
                        drives.add("/")

        total_bytes = stats["total_bytes"]
        storage_str = self._format_size(total_bytes)

        return LibraryStatsDTO(
            total_movies=stats["total_movies"],
            total_series=stats["total_series"],
            total_episodes=stats["total_episodes"],
            storage=storage_str,
            drive_count=len(drives) if drives else 0,
            unmatched=stats["unmatched"],
            genre_distribution=stats.get("genre_distribution", {}),
            genre_distribution_ids=stats.get("genre_distribution_ids", {}),
            genre_labels=stats.get("genre_labels", {}),
            genre_constellation=stats.get("genre_constellation", {}),
            decade_distribution=stats.get("decade_distribution", {}),
        )
