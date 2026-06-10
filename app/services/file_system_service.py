import shutil
import logging
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Optional, Set

logger = logging.getLogger(__name__)


def _send_to_trash_windows(path: Path) -> None:
    escaped_path = str(path).replace("'", "''")
    script = (
        f"$target = '{escaped_path}'; "
        "Add-Type -AssemblyName Microsoft.VisualBasic; "
        "if (Test-Path -LiteralPath $target -PathType Container) { "
        "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory("
        "$target, "
        "[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, "
        "[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin"
        ")"
        "} else { "
        "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile("
        "$target, "
        "[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, "
        "[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin"
        ")"
        "}"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        check=True,
        capture_output=True,
        text=True,
    )

class FileSystemService:
    """
    Unified service for physical filesystem operations (move, delete, cleanup).
    Provides safety checks and standardized logging.
    """

    def __init__(self):
        # We can add protected paths here in the future via config
        self.protected_paths: Set[Path] = set()

    def move_file(self, source: Path, destination: Path, overwrite: bool = False) -> bool:
        """
        Safely moves a file from source to destination.
        Creates parent directories automatically.
        """
        try:
            if not source.exists():
                logger.error(f"FS: Source file does not exist: {source}")
                return False

            if destination.exists() and not overwrite and source != destination:
                logger.error(f"FS: Destination already exists: {destination}")
                return False

            # Ensure parent exists
            destination.parent.mkdir(parents=True, exist_ok=True)

            # Perform the move
            shutil.move(str(source), str(destination))
            logger.info(f"FS: Moved {source.name} -> {destination}")
            return True

        except Exception as e:
            logger.error(f"FS: Move failed ({source} -> {destination}): {e}")
            return False

    def delete_file(self, path: Path) -> bool:
        """Permanently deletes a file."""
        try:
            if path.exists() and path.is_file():
                path.unlink()
                logger.info(f"FS: Deleted file: {path}")
                return True
            return False
        except Exception as e:
            logger.error(f"FS: Delete failed ({path}): {e}")
            return False

    def cleanup_empty_directories(self, start_path: Path, stop_at: Optional[Path] = None):
        """
        Recursively removes empty parent directories up the hierarchy.
        """
        try:
            curr = start_path
            while curr and curr != curr.parent:
                # Security checks
                if stop_at and curr.resolve() == stop_at.resolve():
                    break
                
                # Check for root or drive root
                if len(curr.parts) <= 1:
                    break

                if curr.exists() and curr.is_dir() and not any(curr.iterdir()):
                    logger.info(f"FS: Removing empty directory: {curr}")
                    curr.rmdir()
                    curr = curr.parent
                else:
                    break
        except Exception as e:
            logger.debug(f"FS: Cleanup stopped at {curr}: {e}")

    def ensure_directory(self, path: Path):
        """Ensures a directory exists."""
        path.mkdir(parents=True, exist_ok=True)

    def send_to_trash(self, paths: Iterable[Path]) -> int:
        """Moves existing files to the OS recycle bin/trash."""
        try:
            from send2trash import send2trash
        except ImportError:
            send2trash = None

        moved = 0
        candidates = []
        seen: Set[str] = set()
        for path in paths:
            if not path:
                continue
            candidate = Path(path)
            resolved = str(candidate)
            if resolved in seen:
                continue
            seen.add(resolved)
            if candidate.exists():
                candidates.append(candidate)

        filtered_candidates = []
        for candidate in sorted(candidates, key=lambda p: len(p.parts)):
            if any(parent in candidate.parents for parent in filtered_candidates if parent.is_dir()):
                continue
            filtered_candidates.append(candidate)

        for candidate in filtered_candidates:
            if send2trash is not None:
                send2trash(str(candidate))
            elif sys.platform.startswith("win"):
                _send_to_trash_windows(candidate)
            else:
                raise RuntimeError("send2trash is not installed")
            moved += 1
            logger.info(f"FS: Sent to trash: {candidate}")

        return moved
