import threading
import logging
import uuid
import time
from typing import Callable, Any, Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)

class TaskStatus(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class TaskInfo:
    id: str
    name: str
    status: TaskStatus
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    error: Optional[str] = None
    progress: float = 0.0

class TaskManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(TaskManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._tasks: Dict[str, TaskInfo] = {}
        self._threads: Dict[str, threading.Thread] = {}
        self._lock = threading.Lock()
        self._initialized = True

    def run_task(self, name: str, func: Callable, *args, **kwargs) -> str:
        """Runs a task in a separate background thread."""
        task_id = str(uuid.uuid4())
        task_info = TaskInfo(id=task_id, name=name, status=TaskStatus.RUNNING)
        
        with self._lock:
            self._tasks[task_id] = task_info

        def wrapper():
            try:
                func(*args, **kwargs)
                with self._lock:
                    task_info.status = TaskStatus.COMPLETED
                    task_info.end_time = time.time()
                    task_info.progress = 100.0
            except Exception as e:
                logger.error(f"Task {name} ({task_id}) failed: {e}")
                with self._lock:
                    task_info.status = TaskStatus.FAILED
                    task_info.end_time = time.time()
                    task_info.error = str(e)
            finally:
                with self._lock:
                    if task_id in self._threads:
                        del self._threads[task_id]

        thread = threading.Thread(target=wrapper, name=f"Task-{name}", daemon=True)
        with self._lock:
            self._threads[task_id] = thread
        
        thread.start()
        return task_id

    def list_tasks(self) -> List[Dict[str, Any]]:
        """Returns a list of all managed tasks."""
        with self._lock:
            return [
                {
                    "id": t.id,
                    "name": t.name,
                    "status": t.status.value,
                    "duration": (t.end_time or time.time()) - t.start_time,
                    "error": t.error,
                    "progress": t.progress
                }
                for t in self._tasks.values()
            ]

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            t = self._tasks.get(task_id)
            if not t: return None
            return {
                "id": t.id,
                "name": t.name,
                "status": t.status.value,
                "duration": (t.end_time or time.time()) - t.start_time,
                "error": t.error,
                "progress": t.progress
            }

# Global singleton
task_manager = TaskManager()
