from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.bootstrap import bootstrap_database
from app.logging_config import configure_logging
from app.routes.aircraft import router as aircraft_router
from app.routes.alerts import router as alerts_router
from app.routes.auth import router as auth_router
from app.routes.cases import router as cases_router
from app.routes.connectors import router as connectors_router
from app.routes.dashboard import router as dashboard_router
from app.routes.docs import router as docs_router
from app.routes.events import router as events_router
from app.routes.flights import router as flights_router
from app.routes.incidents import router as incidents_router
from app.routes.network import router as network_router
from app.routes.reliability import router as reliability_router
from app.routes.roles import router as roles_router
from app.routes.spares import router as spares_router
from app.routes.users import router as users_router
from app.routes.workspaces import router as workspaces_router
from app.schemas import HealthResponse


configure_logging("backend")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("backend_startup", extra={"event": "backend_startup", "app_env": settings.app_env})
    bootstrap_database()
    logger.info("backend_startup_complete", extra={"event": "backend_startup_complete"})
    yield
    logger.info("backend_shutdown", extra={"event": "backend_shutdown"})


app = FastAPI(
    title=settings.app_name,
    description=settings.app_description,
    version="2.0.0",
    docs_url="/api/docs" if settings.enable_api_docs else None,
    redoc_url="/api/redoc" if settings.enable_api_docs else None,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["health"])
def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "status": "ok",
        "health": "/health",
        "auth": "/auth/login",
        "api_docs": "/api/docs" if settings.enable_api_docs else "disabled",
    }


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(roles_router)
app.include_router(workspaces_router)
app.include_router(connectors_router)
app.include_router(alerts_router)
app.include_router(cases_router)
app.include_router(events_router)
app.include_router(network_router)
app.include_router(dashboard_router)
app.include_router(aircraft_router)
app.include_router(incidents_router)
app.include_router(reliability_router)
app.include_router(spares_router)
app.include_router(docs_router)
app.include_router(flights_router)
