from collections.abc import Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app import config
from app.services import pairing
from tests.conftest import Clock, Register, bearer


@pytest.fixture(autouse=True)
def fresh_limiter() -> Iterator[None]:
    pairing.limiter.reset("testclient")
    yield
    pairing.limiter.reset("testclient")


def setup(client: TestClient, register: Register) -> tuple[dict[str, str], int, dict[str, str]]:
    cg = bearer(register("Priya", "p@example.com", "caregiver"))
    patient = register("Kamala", "k@example.com", "patient")
    client.post("/api/patients/link", json={"patient_email": "k@example.com"}, headers=cg)
    stranger = bearer(register("Sam", "s@example.com", "caregiver"))
    return cg, int(patient["user"]["id"]), stranger  # type: ignore[index]


def test_caregiver_code_signs_in_the_patient_device_for_90_days(client: TestClient, register: Register, clock: Clock) -> None:
    cg, pid, _ = setup(client, register)
    made = client.post(f"/api/patients/{pid}/pairing-code", headers=cg)
    assert made.status_code == 201
    code = made.json()["code"]
    assert len(code) == 6 and code.isdigit()

    paired = client.post("/api/auth/pair", json={"code": code})
    assert paired.status_code == 200
    body = paired.json()
    assert body["user"]["id"] == pid and body["user"]["role"] == "patient"
    claims = jwt.decode(body["access_token"], config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
    lifetime = claims["exp"] - claims.get("iat", clock.now.timestamp())
    assert lifetime > timedelta(days=89).total_seconds()
    assert client.get("/api/auth/me", headers=bearer(body)).json()["id"] == pid

    # One use only.
    assert client.post("/api/auth/pair", json={"code": code}).status_code == 400


def test_code_expires_after_10_minutes_and_a_new_code_replaces_the_old(
    client: TestClient, register: Register, clock: Clock
) -> None:
    cg, pid, _ = setup(client, register)
    old = client.post(f"/api/patients/{pid}/pairing-code", headers=cg).json()["code"]
    clock.now += timedelta(minutes=10, seconds=1)
    assert client.post("/api/auth/pair", json={"code": old}).status_code == 400

    first = client.post(f"/api/patients/{pid}/pairing-code", headers=cg).json()["code"]
    second = client.post(f"/api/patients/{pid}/pairing-code", headers=cg).json()["code"]
    assert client.post("/api/auth/pair", json={"code": first}).status_code == 400 or first == second
    assert client.post("/api/auth/pair", json={"code": second}).status_code == 200


def test_only_linked_caregivers_make_codes(client: TestClient, register: Register) -> None:
    cg, pid, stranger = setup(client, register)
    assert client.post(f"/api/patients/{pid}/pairing-code", headers=stranger).status_code == 403
    patient = bearer(client.post("/api/auth/login", json={"email": "k@example.com", "password": "password123"}).json())
    assert client.post(f"/api/patients/{pid}/pairing-code", headers=patient).status_code == 403
    assert client.post(f"/api/patients/{pid}/pairing-code").status_code == 401


def test_bad_codes_are_rejected_and_rate_limited(client: TestClient, register: Register, clock: Clock) -> None:
    cg, pid, _ = setup(client, register)
    assert client.post("/api/auth/pair", json={"code": "12ab56"}).status_code == 422
    code = client.post(f"/api/patients/{pid}/pairing-code", headers=cg).json()["code"]
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    for _ in range(config.PAIRING_MAX_FAILURES):
        assert client.post("/api/auth/pair", json={"code": wrong}).status_code == 400
    # Paused, even for the right code, until the window has passed.
    assert client.post("/api/auth/pair", json={"code": code}).status_code == 429
    clock.now += timedelta(minutes=9)
    new = client.post(f"/api/patients/{pid}/pairing-code", headers=cg).json()["code"]
    clock.now += timedelta(minutes=1, seconds=1)
    assert client.post("/api/auth/pair", json={"code": new}).status_code == 200
