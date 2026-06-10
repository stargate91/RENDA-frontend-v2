import threading
import logging
import time
from typing import Dict, Any, List, Callable

logger = logging.getLogger(__name__)

class StatusManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(StatusManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._status = {
            "active": False,
            "total": 0,
            "current": 0,
            "phase": "idle", # 'collecting', 'probing', 'resolving', 'idle'
            "start_time": 0,
            "can_stop": False,
            "stop_requested": False,
        }
        self._lock = threading.Lock()
        self._listeners: List[Callable[[Dict[str, Any]], None]] = []
        self._initialized = True

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return self._status.copy()

    def update(self, updates: Dict[str, Any]):
        """Updates the status and notifies listeners."""
        with self._lock:
            self._status.update(updates)
            current_status = self._status.copy()
        
        self._notify(current_status)

    def increment_current(self, amount: int = 1):
        """Safely increments the current progress count."""
        with self._lock:
            self._status["current"] += amount
            current_status = self._status.copy()
        
        self._notify(current_status)

    def set_active(self, active: bool, phase: str = "collecting"):
        """Convenience method to start/stop a scan."""
        updates = {
            "active": active,
            "phase": phase if active else "idle",
            "start_time": time.time() if active else 0,
            "current": 0 if active else self._status["current"],
            "total": 0 if active else self._status["total"]
        }
        self.update(updates)

    def subscribe(self, listener: Callable[[Dict[str, Any]], None]):
        """Registers a callback for status changes."""
        with self._lock:
            if listener not in self._listeners:
                self._listeners.append(listener)

    def _notify(self, status: Dict[str, Any]):
        """Notifies all registered listeners of a status change."""
        for listener in self._listeners:
            try:
                listener(status)
            except Exception as e:
                logger.error(f"Error notifying status listener: {e}")

# Singleton instance for backward compatibility with existing imports
status_manager = StatusManager()

# Shims to keep existing code working without massive refactoring yet
def update_scan_status(updates: Dict[str, Any]):
    status_manager.update(updates)

def increment_scan_status_current():
    status_manager.increment_current()

def get_scan_status() -> Dict[str, Any]:
    return status_manager.get_status()

def request_scan_stop():
    status_manager.update({
        "stop_requested": True,
    })

def clear_scan_stop():
    status_manager.update({
        "stop_requested": False,
    })

def is_scan_stop_requested() -> bool:
    return bool(status_manager.get_status().get("stop_requested"))

# Export for thread-safe access in loops
scan_status_lock = status_manager._lock
scan_status = status_manager._status # Warning: direct access discouraged
