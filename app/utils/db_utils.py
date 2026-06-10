import time
import logging
from functools import wraps
from sqlalchemy.exc import OperationalError

logger = logging.getLogger("renda")

def with_db_retry(max_retries=3, delay=0.5, backoff=2):
    """
    Decorator to retry database operations if they fail due to SQLite locks.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            current_delay = delay
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    if "database is locked" in str(e).lower():
                        last_error = e
                        logger.warning(f"Database locked. Retrying attempt {attempt+1}/{max_retries} in {current_delay}s...")
                        time.sleep(current_delay)
                        current_delay *= backoff
                        continue
                    raise # Not a lock error, re-raise immediately
                except Exception as e:
                    raise e
            
            logger.error(f"Database operation failed after {max_retries} attempts: {last_error}")
            raise last_error
        return wrapper
    return decorator
