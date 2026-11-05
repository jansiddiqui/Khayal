import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.deps import ensure_patient_access
from app.models import Role
from app.services import auth
from app.seed import DEMO_PASSWORD, PATIENTS, seed
from tests.conftest import Register, bearer


def test_caregiver_links_and_lists_patients(client: TestClient, register: Register) -> None:
    cg = register("Priya", "priya@example.com", "caregiver")
    register("Kamala", "kamala@example.com", "patient")
    register("Rahim", "rahim@example.com", "patient")

    assert client.get("/api/patients", headers=bearer(cg)).json() == []

    for email in ("rahim@example.com", "kamala@example.com", "Kamala@example.com"):
        response = client.post("/api/patients/link", json={"patient_email": email}, headers=bearer(cg))
        assert response.status_code == 201

    names = [p["name"] for p in client.get("/api/patients", headers=bearer(cg)).json()]
    assert names == ["Kamala", "Rahim"]  # sorted, no duplicate link


def test_link_errors(client: TestClient, register: Register) -> None:
    cg = register("Priya", "priya@example.com", "caregiver")
    register("Other", "other@example.com", "caregiver")

    missing = client.post("/api/patients/link", json={"patient_email": "nobody@example.com"}, headers=bearer(cg))
    assert missing.status_code == 404
    not_patient = client.post("/api/patients/link", json={"patient_email": "other@example.com"}, headers=bearer(cg))
    assert not_patient.status_code == 400


def test_patient_cannot_use_caregiver_routes(client: TestClient, register: Register) -> None:
    patient = register("Kamala", "kamala@example.com", "patient")
    assert client.get("/api/patients", headers=bearer(patient)).status_code == 403
    response = client.post("/api/patients/link", json={"patient_email": "kamala@example.com"}, headers=bearer(patient))
    assert response.status_code == 403


def test_patient_routes_require_auth(client: TestClient) -> None:
    assert client.get("/api/patients").status_code == 401


def test_access_rule(db: Session) -> None:
    caregiver, (kamala, rahim, _) = seed(db)
    stranger = auth.register_user(db, name="Stranger", email="s@example.com", password="password123", role=Role.caregiver)

    ensure_patient_access(db, kamala, kamala.id)  # own data
    ensure_patient_access(db, caregiver, rahim.id)  # linked
    with pytest.raises(HTTPException) as exc:
        ensure_patient_access(db, kamala, rahim.id)  # another patient
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException):
        ensure_patient_access(db, stranger, kamala.id)  # unlinked caregiver


def test_seed_is_idempotent_and_loginable(client: TestClient, db: Session) -> None:
    seed(db)
    caregiver, patients = seed(db)
    assert len(patients) == len(PATIENTS) == 3

    login = client.post("/api/auth/login", json={"email": caregiver.email, "password": DEMO_PASSWORD})
    assert login.status_code == 200
    listed = client.get("/api/patients", headers=bearer(login.json())).json()
    assert len(listed) == 3


def test_caregiver_sets_patient_city(client: TestClient, register: Register) -> None:
    cg = bearer(register("Priya", "priya@example.com", "caregiver"))
    patient_payload = register("Kamala", "kamala@example.com", "patient")
    patient = bearer(patient_payload)
    patient_id = patient_payload["user"]["id"]  # type: ignore[index]
    stranger = bearer(register("Sam", "sam@example.com", "caregiver"))
    url = f"/api/patients/{patient_id}"

    assert client.patch(url, json={"city": "Pune"}, headers=cg).status_code == 403  # not linked yet
    client.post("/api/patients/link", json={"patient_email": "kamala@example.com"}, headers=cg)

    updated = client.patch(url, json={"city": "  Pune  "}, headers=cg)
    assert updated.status_code == 200
    assert updated.json()["city"] == "Pune"
    assert client.get("/api/auth/me", headers=patient).json()["city"] == "Pune"
    assert client.get("/api/patients", headers=cg).json()[0]["city"] == "Pune"

    assert client.patch(url, json={"city": ""}, headers=cg).json()["city"] is None
    assert client.patch(url, json={"city": "Pune"}, headers=stranger).status_code == 403
    assert client.patch(url, json={"city": "Pune"}, headers=patient).status_code == 403


def test_demo_history_loads_once_per_patient(db: Session) -> None:
    from sqlalchemy import func, select

    from app.demo_history import load_demo_history
    from app.models import Alert, GameSession, ReminderLog

    _, patients = seed(db)
    report = load_demo_history(db, patients)
    assert [line.split(":")[0] for line in report] == [p.email for p in patients]
    for p in patients:
        assert db.scalar(select(func.count()).select_from(GameSession).where(GameSession.patient_id == p.id)) > 150
    assert db.scalar(select(func.count()).select_from(ReminderLog)) > 0  # Kamala has reminders
    # The moderate profile declines enough to raise decline alerts.
    shanti = next(p for p in patients if p.email == "shanti@khayal.test")
    assert db.scalar(select(func.count()).select_from(Alert).where(Alert.patient_id == shanti.id, Alert.type == "decline")) > 0

    again = load_demo_history(db, patients)
    assert all(line.endswith("already has history, skipped") for line in again)


def test_demo_history_reset_and_reload(db: Session) -> None:
    from sqlalchemy import func, select

    from app.demo_history import load_demo_history, reset_demo_history
    from app.models import Alert, GameSession, GameRound, PlayerLevel

    _, patients = seed(db)
    load_demo_history(db, patients)
    before = db.scalar(select(func.count()).select_from(GameSession))
    report = reset_demo_history(db, patients)
    assert all("removed" in line for line in report)
    for model in (GameSession, GameRound, PlayerLevel):
        assert db.scalar(select(func.count()).select_from(model)) == 0
    assert db.scalar(select(func.count()).select_from(Alert).where(Alert.type == "decline")) == 0
    load_demo_history(db, patients)
    assert db.scalar(select(func.count()).select_from(GameSession)) == before  # same seeds, same history
