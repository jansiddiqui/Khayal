from collections.abc import Iterator
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app import config

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    """SQLite for development; anything else (Postgres) gets a small, self-healing pool,
    because the free hosted database allows only a few connections."""
    if url.startswith("sqlite"):
        if url.startswith("sqlite:///"):
            config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(
        url,
        pool_size=config.DB_POOL_SIZE,
        max_overflow=config.DB_MAX_OVERFLOW,
        pool_pre_ping=True,  # the database may drop idle connections while the service sleeps
        pool_recycle=300,
    )


engine = make_engine(config.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class SchemaOutOfDateError(RuntimeError):
    pass


def ensure_schema_current() -> None:
    """Tables are created and changed only by Alembic migrations, never by the app."""
    alembic_cfg = Config(str(ALEMBIC_INI))
    alembic_cfg.set_main_option("script_location", str(ALEMBIC_INI.parent / "migrations"))
    head = ScriptDirectory.from_config(alembic_cfg).get_current_head()
    with engine.connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
    if current != head:
        raise SchemaOutOfDateError(
            f"Database is at revision {current or 'none'}, code expects {head}. "
            "Run `alembic upgrade head` from the backend/ folder."
        )


def get_session_factory() -> sessionmaker[Session]:
    """For work that outlives a request (housekeeping after login). Tests override it."""
    return SessionLocal


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
