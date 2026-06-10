import os
import shutil
import platform
import logging

logger = logging.getLogger(__name__)

def to_win_long_path(path_str: str) -> str:
    r"""
    Converts a path to a Windows extended-length path (\\?\) if on Windows.
    This bypasses the 260 character MAX_PATH limit.
    """
    if platform.system() != "Windows":
        return path_str
    
    if path_str.startswith("\\\\?\\") or not os.path.isabs(path_str):
        return path_str
        
    abs_path = os.path.abspath(path_str)
    
    if abs_path.startswith("\\\\"):
        return "\\\\?\\UNC\\" + abs_path[2:]
    
    return "\\\\?\\" + abs_path

import hashlib

def calculate_fast_hash(filepath: str) -> str:
    """Fast hash calculation: file size + content of the first and last 1MB"""
    try:
        long_path = to_win_long_path(filepath)
        if not os.path.exists(long_path):
            return None
            
        file_size = os.path.getsize(long_path)
        if file_size < 2 * 1024 * 1024:
            with open(long_path, 'rb') as f:
                content = f.read()
        else:
            with open(long_path, 'rb') as f:
                first_part = f.read(1024 * 1024)
                try:
                    f.seek(-1024 * 1024, os.SEEK_END)
                    last_part = f.read(1024 * 1024)
                except OSError:
                    last_part = b""
                content = first_part + last_part
        
        hasher = hashlib.md5(content)
        hasher.update(str(file_size).encode())
        return hasher.hexdigest()
    except Exception as e:
        logger.error(f"Failed to hash {filepath}: {e}")
        return None

def move_with_progress(src: str, dst: str, progress_callback=None):
    """
    Moves a file with progress reporting.
    Tries os.rename first (instant for same drive).
    Falls back to chunked copy + delete (for cross-drive) to allow progress updates.
    """
    src_long = to_win_long_path(src)
    dst_long = to_win_long_path(dst)

    try:
        os.rename(src_long, dst_long)
        if progress_callback:
            progress_callback(1.0)
        return
    except OSError:
        pass # Probably cross-drive EXDEV

    # Fallback to chunked copy
    file_size = os.path.getsize(src_long)
    copied = 0
    chunk_size = 1024 * 1024 * 16 # 16 MB chunks

    with open(src_long, 'rb') as fsrc, open(dst_long, 'wb') as fdst:
        while True:
            buf = fsrc.read(chunk_size)
            if not buf:
                break
            fdst.write(buf)
            copied += len(buf)
            if progress_callback and file_size > 0:
                progress_callback(copied / file_size)

    # Copy metadata
    shutil.copystat(src_long, dst_long)
    # Remove original
    os.remove(src_long)
    
    if progress_callback:
        progress_callback(1.0)
