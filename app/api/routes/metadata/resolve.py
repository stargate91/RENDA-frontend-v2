from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from app.db.base import get_db
from app.services.metadata_service import MetadataService
import logging
import traceback

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/resolve")
def resolve_metadata(request_data: dict = Body(...), db: Session = Depends(get_db)):
    """Manually resolve a media item to one or more TMDB targets."""
    try:
        active_match_id = MetadataService.resolve_metadata(db, request_data)
        
        return {
            "status": "success", 
            "message": "Item resolved and enriched",
            "match_id": active_match_id
        }
    except ValueError as e:
        logger.error(f"Validation error in resolve: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error resolving metadata: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to resolve metadata: {str(e)}")


@router.post("/bulk-resolve")
def bulk_resolve_metadata(request_data: dict = Body(...), db: Session = Depends(get_db)):
    """Bulk-resolve multiple media items to shared TMDB targets."""
    try:
        match_ids = MetadataService.bulk_resolve_metadata(db, request_data)
        return {
            "status": "success",
            "message": "Items resolved and enriched",
            "match_ids": match_ids,
        }
    except ValueError as e:
        logger.error(f"Validation error in bulk resolve: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error bulk resolving metadata: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to bulk resolve metadata: {str(e)}")
