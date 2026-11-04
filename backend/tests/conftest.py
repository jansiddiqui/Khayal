from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401  (register tables)
from app.db import Base, get_db
from app.main import create_app


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


@pytest.fixture
def client(db_session_factory: sessionmaker[Session]) -> TestClient:
    app = create_app()

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
