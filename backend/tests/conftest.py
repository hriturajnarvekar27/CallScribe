from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture()
def test_settings(tmp_path: Path) -> Settings:
    db_file = tmp_path / "data" / "test_callscribe.db"
    upload_dir = tmp_path / "private_uploads"
    return Settings(
        app_env="test",
        database_url=f"sqlite:///{db_file.as_posix()}",
        upload_dir=str(upload_dir),
        max_upload_bytes=10 * 1024 * 1024,  # 10 MiB for fast oversize tests
        ai_provider_enabled=False,
        cors_origins="http://localhost:3000",
    )


@pytest.fixture()
def client(test_settings: Settings):
    app = create_app(test_settings)
    with TestClient(app) as test_client:
        yield test_client
