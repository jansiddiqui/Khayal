from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import Register, bearer


def test_login_success_and_failure(client: TestClient, register: Register) -> None:
    register("Ravi", "ravi@example.com", "caregiver", password="correct-horse")
    ok = client.post("/api/auth/login", json={"email": "RAVI@example.com", "password": "correct-horse"})
    assert ok.status_code == 200
    assert ok.json()["user"]["role"] == "caregiver"

    wrong = client.post("/api/auth/login", json={"email": "ravi@example.com", "password": "nope-nope"})
    assert wrong.status_code == 401
    unknown = client.post("/api/auth/login", json={"email": "who@example.com", "password": "correct-horse"})
    assert unknown.status_code == 401


def test_elders_have_no_password_to_sign_in_with(client: TestClient, register: Register) -> None:
    register("Kamala", "kamala@example.com", "patient")
    assert client.post("/api/auth/login", json={"email": "kamala@example.com", "password": "password123"}).status_code == 401


def test_me_requires_valid_token(client: TestClient, register: Register) -> None:
    payload = register("Ravi", "ravi@example.com", "caregiver")
    me = client.get("/api/auth/me", headers=bearer(payload))
    assert me.status_code == 200
    assert me.json()["name"] == "Ravi"
    assert "password_hash" not in me.json()

    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_password_is_hashed(register: Register, db: Session) -> None:
    from app.services.auth import get_user_by_email

    register("Ravi", "ravi@example.com", "caregiver", password="password123")
    user = get_user_by_email(db, "ravi@example.com")
    assert user is not None and user.password_hash is not None
    assert user.password_hash != "password123"
    assert user.password_hash.startswith("$2b$")
