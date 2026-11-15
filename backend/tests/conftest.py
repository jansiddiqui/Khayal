"""Test fixtures. Tests run on in-memory SQLite by default.

To run the same suite on Postgres, point KHAYAL_TEST_DATABASE_URL at an empty database
(its tables are created and emptied by the tests), and KHAYAL_TEST_MIGRATIONS_DATABASE_URL
at a second empty one for the migration tests, e.g.
    KHAYAL_TEST_DATABASE_URL=postgresql://khayal:pw@127.0.0.1:5432/khayal_test
    KHAYAL_TEST_MIGRATIONS_DATABASE_URL=postgresql://khayal:pw@127.0.0.1:5432/khayal_test_migrations
"""

import os
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import background, config
from app import models  # noqa: F401  (register tables)
from app.db import Base, get_db, get_session_factory
from app.deps import get_now
from app.main import create_app
from app.services import pairing, ratelimit
from app.services.clock import utc_now

TEST_DATABASE_URL = os.getenv("KHAYAL_TEST_DATABASE_URL", "").strip() or None


def pytest_report_header() -> str:
    return f"khayal test database: {'Postgres (KHAYAL_TEST_DATABASE_URL)' if TEST_DATABASE_URL else 'in-memory SQLite'}"


@pytest.fixture(autouse=True)
def fresh_limits() -> Iterator[None]:
    """Rate limits and the after-login housekeeping gap are per process; start each test clean."""
    ratelimit.clear_all()
    pairing.limiter._failures.clear()
    background.reset_for_tests()
    yield
    ratelimit.clear_all()


@pytest.fixture(autouse=True)
def upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Every test writes uploaded files to its own temporary folder, never to data/."""
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "uploads")
    return tmp_path / "uploads"


@pytest.fixture(scope="session")
def postgres_engine() -> Iterator[Engine]:
    assert TEST_DATABASE_URL is not None
    engine = create_engine(config.normalize_database_url(TEST_DATABASE_URL), pool_pre_ping=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db_session_factory(request: pytest.FixtureRequest) -> Iterator[sessionmaker[Session]]:
    if TEST_DATABASE_URL is not None:
        engine: Engine = request.getfixturevalue("postgres_engine")
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        with engine.begin() as connection:
            connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        return
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    engine.dispose()


@pytest.fixture
def db(db_session_factory: sessionmaker[Session]) -> Iterator[Session]:
    with db_session_factory() as session:
        yield session


@dataclass
class Clock:
    """The time routes see as "now"; tests can set it."""

    now: datetime = field(default_factory=utc_now)


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def client(db_session_factory: sessionmaker[Session], clock: Clock) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_now] = lambda: clock.now

    def override_get_db() -> Iterator[Session]:
        with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_session_factory] = lambda: db_session_factory
    return TestClient(app)


Register = Callable[..., dict[str, object]]


@pytest.fixture
def register(client: TestClient) -> Register:
    """Register a user and return the login payload ({access_token, user})."""

    def _register(name: str, email: str, role: str, password: str = "password123") -> dict[str, object]:
        response = client.post(
            "/api/auth/register", json={"name": name, "email": email, "password": password, "role": role}
        )
        assert response.status_code == 201, response.text
        return response.json()

    return _register


def bearer(token_payload: dict[str, object]) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_payload['access_token']}"}
