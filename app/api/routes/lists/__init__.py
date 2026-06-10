from fastapi import APIRouter
from .core import router as core_router
from .items import router as items_router
from .imports import router as imports_router

router = APIRouter()
router.include_router(core_router)
router.include_router(items_router)
router.include_router(imports_router)
