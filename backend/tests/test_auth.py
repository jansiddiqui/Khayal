from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import Register, bearer


def test_register_returns_token_and_user(register: Register) -> None:
    payload = register("Asha", "Asha@Example.com", "caregiver")
    assert payload["access_token"]
    user = payload["user"]
    assert isinstance(user, dict)
    assert user["email"] == "asha@example.com"  # normalised
    assert user["role"] == "caregiver"
    assert "password_hash" not in user


def test_register_duplicate_email_conflicts(client: TestClient, register: Register) -> None:
    register("Asha", "asha@example.com", "caregiver")
    response = client.post(
        "/api/auth/register",
        json={"name": "Other", "email": "ASHA@example.com", "password": "password123", "role": "patient"},
    )
    assert response.status_code == 409


def test_register_validates_input(client: TestClient) -> None:
    bad = [
        {"name": "A", "email": "not-an-email", "password": "password123", "role": "patient"},
        {"name": "A", "email": "a@b.com", "password": "short", "role": "patient"},
        {"name": "A", "email": "a@b.com", "password": "password123", "role": "doctor"},
        {"name": "  ", "email": "a@b.com", "password": "password123", "role": "patient"},
    ]
    for body in bad:
        assert client.post("/api/auth/register", json=body).status_code == 422, body


def test_login_success_and_failure(client: TestClient, register: Register) -> None:
    register("Ravi", "ravi@example.com", "patient", password="correct-horse")
    ok = client.post("/api/auth/login", json={"email": "RAVI@example.com", "password": "correct-horse"})
    assert ok.status_code == 200
    assert ok.json()["user"]["role"] == "patient"

    wrong = client.post("/api/auth/login", json={"email": "ravi@example.com", "password": "nope-nope"})
    assert wrong.status_code == 401
    unknown = client.post("/api/auth/login", json={"email": "who@example.com", "password": "correct-horse"})
    assert unknown.status_code == 401


def test_me_requires_valid_token(client: TestClient, register: Register) -> None:
    payload = register("Ravi", "ravi@example.com", "patient")
    me = client.get("/api/auth/me", headers=bearer(payload))
    assert me.status_code == 200
    assert me.json()["name"] == "Ravi"

    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_password_is_hashed(register: Register, db: Session) -> None:
    from app.services.auth import get_user_by_email

    register("Ravi", "ravi@example.com", "patient", password="password123")
    user = get_user_by_email(db, "ravi@example.com")
    assert user is not None
    assert user.password_hash != "password123"
    assert user.password_hash.startswith("$2b$")
