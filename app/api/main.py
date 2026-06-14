import os
import sys

# Prepend local bin directory to system PATH to resolve bundled ffmpeg/ffprobe
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS

exe_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else base_dir
bin_dir = os.path.join(exe_dir, "bin")
if os.path.exists(bin_dir):
    os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.utils.logger import setup_logger
from app.db.base import Session, Base, engine, CacheBase, cache_engine
from app.db.models import *

# Initialize logging before importing modules that create/use loggers.
setup_logger()

# Import routers
from app.api.routes import scanner, settings, library, recommendations, people, playback, overrides, metadata, renamer, tags, lists, user

# Automatically create tables if they don't exist
Base.metadata.create_all(bind=engine)
CacheBase.metadata.create_all(bind=cache_engine)


def _ensure_sqlite_columns():
    column_specs = {
        "metadata_localizations": {
            "logo_path": "VARCHAR",
            "local_logo_path": "VARCHAR",
        },
        "persons": {
            "is_adult": "BOOLEAN DEFAULT 0",
            "user_rating_at": "DATETIME",
            "user_comment": "TEXT",
        },
        "media_items": {
            "user_rating_at": "DATETIME",
            "user_comment": "TEXT",
        },
        "virtual_media_states": {
            "user_rating_at": "DATETIME",
            "user_comment": "TEXT",
        },
        "media_matches": {
            "companies": "TEXT",
        },
        "tags": {
            "target_type": "VARCHAR DEFAULT 'media'",
        },
    }
    with engine.begin() as conn:
        for table_name, columns in column_specs.items():
            existing = {
                row[1]
                for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            }
            for column_name, column_type in columns.items():
                if column_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))


_ensure_sqlite_columns()


from contextlib import asynccontextmanager
from app.services.background_tasks import start_background_workers, stop_background_workers

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.scanner.image_worker import ImageWorker
    from app.db.base import Session
    from app.db.models import UserSetting
    from app.services.metadata_service import MetadataService
    
    db = Session()
    try:
        ImageWorker.reset_stale_tasks(db)
        
        # Check if language sync was interrupted
        pending_sync = db.query(UserSetting).filter(UserSetting.key == "language_sync_pending").first()
        if pending_sync and pending_sync.value == "true":
            print("Lifespan: Resuming interrupted language synchronization...")
            MetadataService.run_sync_language()
    except Exception as e:
        print(f"Lifespan error: {e}")
    finally:
        db.close()
        Session.remove()
        
    # Start background workers (e.g. ImageWorker)
    start_background_workers()
    yield
    # Stop them gracefully
    stop_background_workers()

app = FastAPI(title="RENDA API", lifespan=lifespan)

# Ensure media directory exists
os.makedirs("data/media", exist_ok=True)

# Mount media folder
app.mount("/media", StaticFiles(directory="data/media"), name="media")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(scanner.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(library.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(people.router, prefix="/api")
app.include_router(playback.router, prefix="/api")
app.include_router(overrides.router, prefix="/api")
app.include_router(metadata.router, prefix="/api")
app.include_router(renamer.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(lists.router, prefix="/api")
app.include_router(user.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    import socket
    import threading
    import time
    import signal

    def monitor_parent_process():
        initial_parent_pid = os.getppid()
        if initial_parent_pid <= 1:
            return
        while True:
            time.sleep(1)
            try:
                # On Unix, if the parent process dies, getppid() changes (usually to 1).
                # Also double-check by attempting to send signal 0 to check process existence.
                if os.getppid() != initial_parent_pid:
                    os.kill(os.getpid(), signal.SIGTERM)
                    break
                # On Windows or just to be extremely robust, check if the parent process is still active
                if os.name == 'posix':
                    # Signal 0 does not kill the process but checks if it exists
                    os.kill(initial_parent_pid, 0)
            except OSError:
                # Parent process is no longer active or PID doesn't exist
                os.kill(os.getpid(), signal.SIGTERM)
                break

    # Start the parent process monitor in a daemon thread
    monitor_thread = threading.Thread(target=monitor_parent_process, daemon=True)
    monitor_thread.start()

    def find_free_port(start_port: int = 8000, max_attempts: int = 100) -> int:
        for port in range(start_port, start_port + max_attempts):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(("127.0.0.1", port))
                    return port
                except socket.error:
                    continue
        raise IOError(f"Could not find a free port in range {start_port} to {start_port + max_attempts}")

    port = find_free_port(8000)
    try:
        with open("port.txt", "w") as f:
            f.write(str(port))
    except Exception as e:
        print(f"Failed to write port.txt: {e}")

    uvicorn.run(app, host="0.0.0.0", port=port)
