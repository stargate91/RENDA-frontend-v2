import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker, scoped_session

# Ensure data directory exists
DATA_DIR = Path("data")
if not DATA_DIR.is_dir():
    if DATA_DIR.exists(): # It's a file with the same name
        os.remove(DATA_DIR)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

# Database file location
DATABASE_URL = f"sqlite:///{DATA_DIR / 'renda.db'}"

class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models in the application."""
    pass

class CacheBase(DeclarativeBase):
    """Base class for caching models, stored in a separate database."""
    pass

# Engine initialization
engine = create_engine(
    DATABASE_URL, 
    connect_args={
        "check_same_thread": False,
        "timeout": 30
    }, # Required for multi-threaded SQLite usage
    pool_size=12,
    max_overflow=24,
    pool_timeout=60,
)

CACHE_DATABASE_URL = f"sqlite:///{DATA_DIR / 'cache.db'}"
cache_engine = create_engine(
    CACHE_DATABASE_URL,
    connect_args={
        "check_same_thread": False,
        "timeout": 30
    },
    pool_size=6,
    max_overflow=12,
    pool_timeout=60,
)

# SQLite Optimization: Enable WAL (Write-Ahead Logging) mode
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

@event.listens_for(cache_engine, "connect")
def set_sqlite_pragma_cache(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

# Thread-safe Session factory using scoped_session
session_factory = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine,
    binds={CacheBase: cache_engine}
)
Session = scoped_session(session_factory)

cache_session_factory = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=cache_engine
)
CacheSession = scoped_session(cache_session_factory)

def get_db():
    """
    Dependency helper for session management.
    Provides a thread-safe database session and ensures proper cleanup.
    """
    db = Session()
    try:
        yield db
    finally:
        # Crucial for scoped_session to clean up the thread-local reference
        Session.remove()
