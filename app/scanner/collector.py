import os
from pathlib import Path
from typing import List, Dict, Set

class Collector:
    """
    Submodule 1: Discovers and collects all files from specified paths.
    Categorizes them into primary media (Videos) and potential extras (Images, Subtitles, etc.).
    """
    
    VIDEO_EXTS = {'.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv', '.mpg', '.mpeg'}
    SUBTITLE_EXTS = {'.srt', '.sub', '.ass', '.ssa', '.idx', '.vtt'}
    IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    AUDIO_EXTS = {'.ac3', '.dts', '.flac', '.mp3', '.aac', '.m4a'}
    META_EXTS = {'.nfo', '.xml', '.json', '.txt'}

    def __init__(self, min_video_size_mb: float = 50.0):
        # We now use a hybrid fast-track threshold (defaults to 50MB) to instantly filter out tiny video clips
        self.fast_track_size = min_video_size_mb * 1024 * 1024

    def collect(self, paths: List[str]) -> Dict[str, List[Path]]:
        """
        Recursively traverses directories and groups files into categories.
        """
        results = {
            "potential_media": [], # Primary video files exceeding the 50MB threshold
            "potential_extras": [], # Smaller videos (<50MB), images, subtitles, etc.
            "ignored": []
        }

        def process_file(file_path: Path):
            # Skip hidden files and directories
            if any(part.startswith('.') for part in file_path.parts):
                results["ignored"].append(file_path)
                return

            ext = file_path.suffix.lower()
            
            # Filter video files by size: videos smaller than 50MB are fast-tracked as extras
            if ext in self.VIDEO_EXTS:
                size = file_path.stat().st_size
                if size >= self.fast_track_size:
                    results["potential_media"].append(file_path)
                else:
                    results["potential_extras"].append(file_path)
            
            elif ext in self.SUBTITLE_EXTS or \
                 ext in self.IMAGE_EXTS or \
                 ext in self.AUDIO_EXTS or \
                 ext in self.META_EXTS:
                results["potential_extras"].append(file_path)
            
            else:
                results["ignored"].append(file_path)

        for root_path in paths:
            p = Path(root_path)
            if not p.exists():
                continue
            
            if p.is_file():
                process_file(p)
            else:
                for file_path in p.rglob("*"): # Recursive traversal
                    if file_path.is_file():
                        process_file(file_path)

        return results
