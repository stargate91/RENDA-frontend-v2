from fastapi import APIRouter
from app.api.routes.people.imports import router as import_router
from app.api.routes.people.details import router as details_router
from app.api.routes.people.search import router as search_router
from app.api.routes.people.mutate import router as mutate_router

router = APIRouter()
router.include_router(import_router)
router.include_router(search_router)
router.include_router(details_router)
router.include_router(mutate_router)
