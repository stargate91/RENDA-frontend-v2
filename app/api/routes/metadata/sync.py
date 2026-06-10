from fastapi import APIRouter
from app.services.metadata_service import MetadataService
from app.scanner.scanner_manager import scan_status

router = APIRouter()

@router.get("/sync-language/status")
def get_sync_metadata_language_status():
    return {"active": MetadataService.is_language_sync_active()}


@router.post("/sync-language")
def sync_metadata_language():
    """Sync all item's metadata according to UserSettings."""
    if scan_status.get("active") or MetadataService.is_language_sync_active():
        return {"status": "error", "message": "A scan or sync is already in progress"}

        
    MetadataService.run_sync_language()
    
    return {"status": "started", "message": "Metadata language synchronization started in background"}
