"""Migrations must build exactly the schema the models describe, on SQLite and on Postgres
(set KHAYAL_TEST_MIGRATIONS_DATABASE_URL to an empty Postgres database; see conftest.py)."""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

from app import config
from app.db import ALEMBIC_INI, Base

POSTGRES_URL = os.getenv("KHAYAL_TEST_MIGRATIONS_DATABASE_URL", "").strip() or None


def alembic_config(url: str) -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(ALEMBIC_INI.parent / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


@pytest.fixture(params=["sqlite", "postgres"])
def database_url(request: pytest.FixtureRequest, tmp_path: Path) -> str:
    if request.param == "sqlite":
        return f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    if POSTGRES_URL is None:
        pytest.skip("KHAYAL_TEST_MIGRATIONS_DATABASE_URL is not set")
    url = config.normalize_database_url(POSTGRES_URL)
    engine = create_engine(url)
    with engine.begin() as connection:  # a dedicated, empty test database: start from nothing
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()
    return url


def test_upgrade_head_matches_models(database_url: str) -> None:
    cfg = alembic_config(database_url)
    command.upgrade(cfg, "head")

    engine = create_engine(database_url)
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"render_as_batch": True})
        assert context.get_current_revision() == ScriptDirectory.from_config(cfg).get_current_head()
        assert compare_metadata(context, Base.metadata) == []
    engine.dispose()


def test_downgrade_to_base_and_back(database_url: str) -> None:
    cfg = alembic_config(database_url)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


def test_postgres_style_urls_are_normalised() -> None:
    assert (
        config.normalize_database_url("postgres://u:p%40ss@db.example:5432/khayal?sslmode=require")
        == "postgresql+psycopg://u:p%40ss@db.example:5432/khayal?sslmode=require"
    )
    assert config.normalize_database_url("postgresql://u:p@h/d") == "postgresql+psycopg://u:p@h/d"
    assert config.normalize_database_url("sqlite:///x.db") == "sqlite:///x.db"


def test_database_url_prefers_khayal_name_then_database_url() -> None:
    both = {"KHAYAL_DATABASE_URL": "postgres://a/one", "DATABASE_URL": "postgres://b/two"}
    assert config.database_url_from(both) == "postgresql+psycopg://a/one"
    assert config.database_url_from({"DATABASE_URL": "postgres://b/two"}) == "postgresql+psycopg://b/two"
    assert config.database_url_from({"KHAYAL_DATABASE_URL": " ", "DATABASE_URL": ""}).startswith("sqlite:///")
