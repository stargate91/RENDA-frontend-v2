from fastapi import APIRouter

from .search import router as search_router
from .resolve import router as resolve_router
from .sync import router as sync_router
from .details import router as details_router

router = APIRouter(prefix="/metadata", tags=["Metadata"])

router.include_router(search_router)
router.include_router(resolve_router)
router.include_router(sync_router)
router.include_router(details_router)
