from __future__ import annotations

from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Base declarative class for SQLAlchemy ORM models."""


def create_sqlite_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, connect_args=connect_args, future=True)

    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def _ensure_sqlite_columns(engine: Engine) -> None:
    if not str(engine.url).startswith("sqlite"):
        return

    expected_columns: dict[str, list[tuple[str, str]]] = {
        "jobs": [
            ("stage_message", "TEXT"),
            ("bookmarks_json", "TEXT"),
            ("action_items_json", "TEXT"),
        ],
        "transcript_segments": [
            ("confidence", "FLOAT"),
            ("uncertain", "BOOLEAN"),
        ],
    }

    with engine.begin() as conn:
        for table_name, columns in expected_columns.items():
            existing = {
                row[1]
                for row in conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
            }
            for col_name, col_type in columns:
                if col_name not in existing:
                    conn.exec_driver_sql(
                        f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"
                    )


def init_db(engine: Engine) -> None:
    # Ensure ORM models are imported before metadata.create_all
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns(engine)



def get_db_session(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
