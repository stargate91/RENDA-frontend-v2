from fastapi import APIRouter
from app.api.routes.overrides.virtual import router as virtual_router
from app.api.routes.overrides.bulk import router as bulk_router
from app.api.routes.overrides.single import router as single_router

router = APIRouter()
router.include_router(virtual_router)
router.include_router(bulk_router)
router.include_router(single_router)
