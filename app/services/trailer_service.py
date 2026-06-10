"""
Trailer Service - On-demand YouTube trailer downloader using yt-dlp.
Downloads trailers locally and serves them as static video files,
completely bypassing YouTube embed restrictions and CAPTCHA issues.
"""
import subprocess
import logging
import asyncio
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

TRAILER_DIR = Path("data/trailers")
TRAILER_DIR.mkdir(parents=True, exist_ok=True)

# Simple in-memory lock to prevent duplicate downloads
_download_locks: dict[str, Lock] = {}
_downloading: set[str] = set()


def get_trailer_path(trailer_key: str) -> Path | None:
    """Check if a trailer is already downloaded. Returns the path or None."""
    for ext in (".mp4", ".webm", ".mkv"):
        path = TRAILER_DIR / f"{trailer_key}{ext}"
        if path.exists() and path.stat().st_size > 0:
            return path
    return None


def download_trailer(trailer_key: str) -> Path | None:
    """
    Download a YouTube trailer using yt-dlp.
    Returns the local file path on success, None on failure.
    Thread-safe: concurrent calls for the same key will wait for the first download.
    """
    # Fast path: already downloaded
    existing = get_trailer_path(trailer_key)
    if existing:
        return existing

    # Get or create a lock for this specific key
    if trailer_key not in _download_locks:
        _download_locks[trailer_key] = Lock()
    
    lock = _download_locks[trailer_key]
    
    with lock:
        # Double-check after acquiring lock (another thread may have finished)
        existing = get_trailer_path(trailer_key)
        if existing:
            return existing
        
        _downloading.add(trailer_key)
        
        try:
            url = f"https://www.youtube.com/watch?v={trailer_key}"
            output_template = str(TRAILER_DIR / f"{trailer_key}.%(ext)s")
            
            # If a manual cookies.txt is provided, we use it first (bypasses Chromium DPAPI block entirely)
            cookies_txt = Path("data/cookies.txt")
            
            browsers = []
            if cookies_txt.exists():
                browsers.append("manual_file")
            browsers.extend(["chrome", "firefox", "edge", "brave", "opera", "vivaldi", None])
            
            success = False
            
            logger.info(f"Downloading trailer: {trailer_key}")
            
            for browser in browsers:
                cmd = [
                    "yt-dlp",
                    "--no-playlist",
                    "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
                    "--merge-output-format", "mp4",
                    "--no-warnings",
                    "--no-check-certificates",
                    "--socket-timeout", "15",
                    "--retries", "2",
                    "-o", output_template
                ]
                
                if browser == "manual_file":
                    cmd.extend(["--cookies", str(cookies_txt)])
                    logger.info(f"Using manual cookies file: {cookies_txt}")
                elif browser:
                    cmd.extend(["--cookies-from-browser", browser])
                    logger.info(f"Trying to download {trailer_key} using cookies from: {browser}")
                else:
                    logger.info(f"Trying to download {trailer_key} without browser cookies")
                    
                cmd.append(url)
                
                try:
                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=120,  # 2 minute timeout
                        cwd=str(Path.cwd())
                    )
                    
                    # Check if we succeeded
                    downloaded = get_trailer_path(trailer_key)
                    if downloaded:
                        logger.info(f"Trailer downloaded successfully using '{browser or 'no cookies'}': {downloaded} ({downloaded.stat().st_size / 1024 / 1024:.1f} MB)")
                        success = True
                        return downloaded
                    else:
                        logger.warning(f"yt-dlp failed using browser '{browser}': {result.stderr[:200]}")
                        
                except subprocess.TimeoutExpired:
                    logger.error(f"yt-dlp timeout for {trailer_key} with browser '{browser}'")
                except Exception as e:
                    logger.error(f"yt-dlp exception for {trailer_key} with browser '{browser}': {e}")
                    
            if not success:
                logger.error(f"All download attempts failed for trailer: {trailer_key}")
                return None
        finally:
            _downloading.discard(trailer_key)


def is_downloading(trailer_key: str) -> bool:
    """Check if a trailer is currently being downloaded."""
    return trailer_key in _downloading
