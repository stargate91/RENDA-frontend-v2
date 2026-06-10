from typing import Any, Optional

class RendaException(Exception):
    """Base exception for all application errors."""
    def __init__(self, message: str, code: str = "INTERNAL_ERROR", status_code: int = 500):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(self.message)

class ResourceNotFoundException(RendaException):
    def __init__(self, resource: str, identifier: Any):
        super().__init__(f"{resource} not found with ID: {identifier}", "NOT_FOUND", 404)

class ValidationException(RendaException):
    def __init__(self, message: str):
        super().__init__(message, "VALIDATION_ERROR", 400)

class DatabaseLockException(RendaException):
    def __init__(self, message: str = "Database is currently locked. Please try again."):
        super().__init__(message, "DATABASE_LOCKED", 503)

def decode_error(e: Exception) -> dict:
    """Converts an exception into a standardized dictionary for reporting."""
    if isinstance(e, RendaException):
        return {
            "status": "error",
            "code": e.code,
            "message": e.message
        }
    
    # Handle specific library exceptions
    err_str = str(e).lower()
    if "database is locked" in err_str or "sqlite3.operationalerror" in err_str:
        return {
            "status": "error",
            "code": "DATABASE_LOCKED",
            "message": "The database is busy. Your request was queued or failed."
        }
    
    return {
        "status": "error",
        "code": "UNKNOWN_ERROR",
        "message": str(e)
    }
