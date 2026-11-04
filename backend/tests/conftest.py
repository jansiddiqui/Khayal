from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import config
from app import models  # noqa: F401  (register tables)
from app.db import Base, get_db
from app.deps import get_now
from app.main import create_app
from app.services.clock import utc_now


@pytest.fixture(autouse=True)
def upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Every test writes uploaded files to its own temporary folder, never to data/."""
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "uploads")
    return tmp_path / "uploads"


@pytest.fixture
def db_session_factory() -> Iterator[sessionmaker[Session]]:
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
