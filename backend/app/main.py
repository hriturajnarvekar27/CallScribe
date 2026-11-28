from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.database import create_session_factory, create_sqlite_engine, init_db
from app.logging_config import configure_logging
from app.routers.health import router as health_router
from app.routers.jobs import router as jobs_router
from app.services.storage import ensure_upload_dir

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)

    engine = create_sqlite_engine(resolved_settings.resolved_database_url)
    session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        ensure_upload_dir(resolved_settings.resolved_upload_dir)
        init_db(engine)
        logger.info(
            "CallScribe API initialized db=%s upload_dir=%s",
            resolved_settings.resolved_database_url,
            resolved_settings.resolved_upload_dir,
        )
        try:
            yield
        finally:
            engine.dispose()

    application = FastAPI(
        title=resolved_settings.app_name,
        version="1.0.0",
        description="CallScribe Phase 1 persistent REST API backend (FastAPI + SQLite).",
        lifespan=lifespan,
    )

    application.state.settings = resolved_settings
    application.state.engine = engine
    application.state.session_factory = session_factory

    application.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    @application.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error during %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error."},
        )

    application.include_router(health_router)
    application.include_router(jobs_router)

    return application


app = create_app()
