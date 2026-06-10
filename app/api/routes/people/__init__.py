from fastapi import APIRouter
from app.api.routes.people.core import router as core_router
from app.api.routes.people.imports import router as import_router

router = APIRouter()
router.include_router(import_router)
router.include_router(core_router)
