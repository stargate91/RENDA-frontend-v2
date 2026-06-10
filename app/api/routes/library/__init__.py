from fastapi import APIRouter
from app.api.routes.library.core import router as core_router
from app.api.routes.library.media import router as media_router

router = APIRouter()
router.include_router(core_router)
router.include_router(media_router)
