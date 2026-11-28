from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings
from app.dependencies import get_app_settings, get_db
from app.schemas import HealthResponseSchema
from app.services.storage import ensure_upload_dir

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponseSchema)
def health_check(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> HealthResponseSchema:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database health check failed.",
        ) from exc

    try:
        ensure_upload_dir(settings.resolved_upload_dir)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Storage directory health check failed.",
        ) from exc

    return HealthResponseSchema(
        status="ok",
        database="connected",
        storage="ready",
    )
