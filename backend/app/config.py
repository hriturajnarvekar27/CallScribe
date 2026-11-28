from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables or backend/.env."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "CallScribe API"
    app_env: str = "development"
    log_level: str = "INFO"

    host: str = "0.0.0.0"
    port: int = 8000

    database_url: str = f"sqlite:///{(BACKEND_ROOT / 'data' / 'callscribe.db').as_posix()}"
    upload_dir: str = str(BACKEND_ROOT / "storage" / "uploads")
    max_upload_bytes: int = Field(default=2 * 1024 * 1024 * 1024, gt=0)
    ai_provider_enabled: bool = False
    local_whisper_model: str = "base"
    run_local_worker_on_upload: bool = False
    diarization_confidence_threshold: float = 0.55

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origin_list(self) -> List[str]:
        origins = [item.strip() for item in self.cors_origins.split(",") if item.strip()]
        return origins or ["http://localhost:3000"]

    @property
    def resolved_upload_dir(self) -> Path:
        path = Path(self.upload_dir)
        if not path.is_absolute():
            path = (BACKEND_ROOT / path).resolve()
        return path

    @property
    def resolved_database_url(self) -> str:
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix):
            return self.database_url
        raw_path = self.database_url[len(prefix) :]
        if raw_path == ":memory:":
            return self.database_url
        db_path = Path(raw_path)
        if not db_path.is_absolute():
            db_path = (BACKEND_ROOT / db_path).resolve()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return f"{prefix}{db_path.as_posix()}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
