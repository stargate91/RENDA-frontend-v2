import logging
import threading
from typing import Any, Dict, Optional
from app.db.models.settings import UserSetting
from app.db.base import Session as DbSession

logger = logging.getLogger(__name__)

class ConfigManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ConfigManager, cls).__new__(cls)
                cls._instance._cache = {}
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.refresh()
        self._initialized = True

    def refresh(self):
        """Loads all settings from the database into the memory cache."""
        db = DbSession()
        try:
            settings = db.query(UserSetting).all()
            new_cache = {s.key: s.value for s in settings}
            self._cache = new_cache
            logger.info(f"ConfigManager: Loaded {len(self._cache)} settings from DB.")
        except Exception as e:
            logger.error(f"ConfigManager: Failed to load settings: {e}")
        finally:
            db.close()
            DbSession.remove()

    def get(self, key: str, default: Any = None) -> Any:
        """Returns a setting value from cache."""
        return self._cache.get(key, default)

    def get_int(self, key: str, default: int = 0) -> int:
        val = self.get(key, default)
        try: return int(val)
        except: return default

    def get_bool(self, key: str, default: bool = False) -> bool:
        val = self.get(key, default)
        if isinstance(val, bool): return val
        if isinstance(val, str): return val.lower() in ("true", "1", "yes")
        return bool(val)

# Global singleton
config_manager = ConfigManager()
