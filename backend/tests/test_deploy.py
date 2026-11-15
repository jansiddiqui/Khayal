"""Public-demo and hosting features: database storage, demo limits, rate limits, "Try the demo",
the 7-day clean-up, the tick route and production settings."""

import io
import os
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app import config
from app.models import (
    Alert,
    CareLink,
    FamilyMember,
    GameRound,
    GameSession,
    PairingCode,
    Reminder,
    ReminderLog,
    SpeechSample,
    StoredFile,
    User,
)
from app.services import accounts, family, speech
from tests.conftest import Clock, Register, bearer

BACKEND = Path(__file__).resolve().parents[1]
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64


def png(size: int = 300) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (size, size), (200, 80, 40)).save(out, format="PNG")
    return out.getvalue()


@pytest.fixture
def demo_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "DEMO_MODE", True)


@pytest.fixture
def db_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "STORAGE_BACKEND", "db")


def caregiver_with_patient(client: TestClient, register: Register) -> tuple[dict[str, str], dict[str, str], int]:
    care = bearer(register("Priya", "priya@example.com", "caregiver"))
    patient_payload = register("Kamala", "kamala@example.com", "patient")
    pid = int(patient_payload["user"]["id"])  # type: ignore[index]
    assert client.post("/api/patients/link", json={"patient_email": "kamala@example.com"}, headers=care).status_code == 201
    return care, bearer(patient_payload), pid


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


# --- storage in the database --------------------------------------------------------------


@pytest.mark.usefixtures("db_storage")
def test_photos_and_recordings_can_live_in_the_database(
    client: TestClient, register: Register, db: Session, upload_dir: Path
) -> None:
    care, patient, pid = caregiver_with_patient(client, register)
    member = client.post(f"/api/patients/{pid}/family", json={"name": "Rahul", "relation": "Grandson"}, headers=care).json()
    photo = client.post(
        f"/api/patients/{pid}/family/{member['id']}/photos", content=png(), headers={**care, "Content-Type": "image/png"}
    ).json()["photos"][0]
    served = client.get(f"/api{photo['url']}", headers=patient)
    assert served.status_code == 200 and served.headers["content-type"] == "image/jpeg"
    assert served.content[:2] == b"\xff\xd8"

    client.patch(f"/api/patients/{pid}", json={"voice_task_enabled": True}, headers=care)
    sample = client.post("/api/speech?duration_ms=5000", content=WEBM, headers={**patient, "Content-Type": "audio/webm"})
    assert sample.status_code == 201, sample.text
    audio = client.get(f"/api{sample.json()['audio_url']}", headers=care)
    assert audio.status_code == 200 and audio.content == WEBM

    rows = db.scalars(select(StoredFile).order_by(StoredFile.key)).all()
    assert [r.key.split("/")[0] for r in rows] == ["family", "speech"]
    assert all(r.owner_id == pid and r.size == len(r.data) for r in rows)
    assert not upload_dir.exists()  # nothing on disk

    assert client.delete(f"/api/patients/{pid}/family/{member['id']}/photos/{photo['id']}", headers=care).status_code == 200
    db.expire_all()
    assert [r.key.split("/")[0] for r in db.scalars(select(StoredFile))] == ["speech"]


# --- public demo limits --------------------------------------------------------------------


@pytest.mark.usefixtures("demo_mode")
def test_demo_limits_on_photos_and_recordings(client: TestClient, register: Register, monkeypatch: pytest.MonkeyPatch) -> None:
    care, patient, pid = caregiver_with_patient(client, register)
    member = client.post(f"/api/patients/{pid}/family", json={"name": "Rahul", "relation": "Grandson"}, headers=care).json()
    monkeypatch.setattr(family, "DEMO_MAX_STORED_BYTES", 100)  # any real photo is bigger than this
    too_big = client.post(
        f"/api/patients/{pid}/family/{member['id']}/photos", content=png(), headers={**care, "Content-Type": "image/png"}
    )
    assert too_big.status_code == 422 and "1 MB" in too_big.json()["detail"]

    client.patch(f"/api/patients/{pid}", json={"voice_task_enabled": True}, headers=care)
    upload = {**patient, "Content-Type": "audio/webm"}
    assert speech.recording_limit_seconds() == 120
    assert client.post(f"/api/speech?duration_ms={speech.max_duration_ms() + 1}", content=WEBM, headers=upload).status_code == 422
    big = b"\x1a\x45\xdf\xa3" + b"\x00" * speech.DEMO_MAX_AUDIO_BYTES
    response = client.post("/api/speech?duration_ms=60000", content=big, headers=upload)
    assert response.status_code == 413 and "2 MB" in response.json()["detail"]
    assert client.post("/api/speech?duration_ms=60000", content=WEBM, headers=upload).status_code == 201


def test_config_tells_the_frontend_about_demo_mode(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert client.get("/api/config").json() == {
        "demo_mode": False, "recording_limit_seconds": 180, "demo_account_days": 7, "contact_email": None
    }
    monkeypatch.setattr(config, "DEMO_MODE", True)
    assert client.get("/api/config").json()["recording_limit_seconds"] == 120


# --- rate limits ---------------------------------------------------------------------------


def test_login_register_and_pairing_are_rate_limited(client: TestClient, register: Register) -> None:
    for _ in range(10):
        assert client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "password123"}).status_code == 401
    blocked = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "password123"})
    assert blocked.status_code == 429 and int(blocked.headers["Retry-After"]) > 0

    for i in range(5):
        register(f"U{i}", f"u{i}@example.com", "caregiver")
    extra = client.post("/api/auth/register", json={"name": "U", "email": "u9@example.com", "password": "password123", "role": "caregiver"})
    assert extra.status_code == 429

    statuses = [client.post("/api/auth/pair", json={"code": "000000"}).status_code for _ in range(12)]
    assert statuses[:10] == [400] * 10 and statuses[10:] == [429, 429]


# --- "Try the demo" ------------------------------------------------------------------------


def test_try_the_demo_is_off_outside_demo_mode(client: TestClient) -> None:
    assert client.post("/api/demo/start").status_code == 404


@pytest.mark.usefixtures("demo_mode", "db_storage")
def test_try_the_demo_gives_a_private_copy_and_a_pairing_code(client: TestClient, db: Session, clock: Clock) -> None:
    first = client.post("/api/demo/start")
    assert first.status_code == 201, first.text
    body = first.json()
    assert body["user"]["role"] == "caregiver" and body["patient_name"] == "Kamala Devi"
    care = bearer(body)

    patients = client.get("/api/patients", headers=care).json()
    assert sorted(p["name"] for p in patients) == ["Kamala Devi", "Rahim Khan", "Shanti Iyer"]
    kamala = body["patient_id"]
    assert client.get(f"/api/patients/{kamala}/sessions", headers=care).json(), "90 days of history"
    assert len(client.get(f"/api/patients/{kamala}/reminders", headers=care).json()) == 4
    photos = [ph for m in client.get(f"/api/patients/{kamala}/family", headers=care).json() for ph in m["photos"]]
    assert len(photos) == 3

    # The patient side: pair a second device with the code.
    paired = client.post("/api/auth/pair", json={"code": body["pairing"]["code"]})
    assert paired.status_code == 200 and paired.json()["user"]["id"] == kamala
    assert paired.json()["user"]["voice_task_enabled"] is True

    # A second visitor gets their own copies; neither sees the other's patients.
    other = client.post("/api/demo/start").json()
    assert other["patient_id"] != kamala
    assert client.get(f"/api/patients/{kamala}/family", headers=bearer(other)).status_code == 403

    expires = [u.demo_expires_at for u in db.scalars(select(User))]
    assert len(expires) == 8 and all(e is not None for e in expires)


@pytest.mark.usefixtures("demo_mode")
def test_open_sign_up_in_demo_mode_also_expires(client: TestClient, register: Register) -> None:
    user = register("Visitor", "visitor@example.com", "caregiver")["user"]
    assert user["demo_expires_at"] is not None  # type: ignore[index]


# --- clean-up after 7 days -----------------------------------------------------------------


@pytest.mark.usefixtures("demo_mode", "db_storage")
def test_expired_demo_accounts_and_all_their_data_are_deleted(
    client: TestClient, db: Session, db_session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    demo = client.post("/api/demo/start").json()
    # An ordinary account made outside demo mode is never touched.
    monkeypatch.setattr(config, "DEMO_MODE", False)
    keeper = client.post("/api/auth/register", json={"name": "Keep", "email": "keep@example.com", "password": "password123", "role": "caregiver"})
    keeper_id = keeper.json()["user"]["id"]
    assert count(db, GameSession) > 0 and count(db, StoredFile) == 3

    with db_session_factory() as session:
        now = session.get(User, demo["user"]["id"]).demo_expires_at  # type: ignore[union-attr]
        assert accounts.delete_expired(session, now - timedelta(minutes=1)) == 0
        assert accounts.delete_expired(session, now + timedelta(minutes=1)) == 4

    db.expire_all()
    assert [u.id for u in db.scalars(select(User))] == [keeper_id]
    for model in (CareLink, GameSession, GameRound, Reminder, ReminderLog, Alert, PairingCode, FamilyMember, SpeechSample, StoredFile):
        assert count(db, model) == 0, model.__name__
    assert client.get("/api/auth/me", headers=bearer(demo)).status_code == 401


@pytest.mark.usefixtures("demo_mode")
def test_oldest_demo_caregivers_go_first_when_there_are_too_many(
    client: TestClient, db: Session, db_session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch, clock: Clock
) -> None:
    starts = []
    for minutes in (0, 1, 2):
        clock.now = clock.now + timedelta(minutes=minutes)
        starts.append(client.post("/api/demo/start").json())
    monkeypatch.setattr(config, "DEMO_MAX_CAREGIVERS", 2)
    with db_session_factory() as session:
        assert accounts.delete_expired(session, clock.now) == 4  # the oldest caregiver and their 3 patients
    db.expire_all()
    left = {u.id for u in db.scalars(select(User).where(User.role == "caregiver"))}
    assert left == {starts[1]["user"]["id"], starts[2]["user"]["id"]}


@pytest.mark.usefixtures("demo_mode")
def test_signing_in_runs_the_clean_up(
    client: TestClient, register: Register, db: Session, db_session_factory: sessionmaker[Session]
) -> None:
    demo = client.post("/api/demo/start").json()
    with db_session_factory() as session:
        for user in session.scalars(select(User)):
            user.demo_expires_at = user.created_at  # already expired
        session.commit()
    register("Later", "later@example.com", "caregiver")  # registered now, expires in 7 days
    assert client.post("/api/auth/login", json={"email": "later@example.com", "password": "password123"}).status_code == 200
    db.expire_all()
    assert db.get(User, demo["user"]["id"]) is None
    assert [u.email for u in db.scalars(select(User))] == ["later@example.com"]


# --- the tick route ------------------------------------------------------------------------


def test_tick_needs_the_secret(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert client.post("/api/internal/tick").status_code == 404  # no secret configured: no route
    monkeypatch.setattr(config, "TICK_SECRET", "s3cret-value")
    assert client.post("/api/internal/tick").status_code == 403
    assert client.post("/api/internal/tick", headers={"X-Khayal-Tick-Secret": "wrong"}).status_code == 403
    ok = client.post("/api/internal/tick", headers={"X-Khayal-Tick-Secret": "s3cret-value"})
    assert ok.status_code == 200 and ok.json() == {"reminder_patients": 0, "accounts_removed": 0, "skipped": False}


# --- production settings -------------------------------------------------------------------


def _import_config(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    clean = {k: v for k, v in os.environ.items() if not k.startswith("KHAYAL_") and k != "DATABASE_URL"}
    return subprocess.run(
        [sys.executable, "-c", "from app import config; print(config.STORAGE_BACKEND, config.CORS_ORIGINS, config.LOCAL_TIMEZONE)"],
        cwd=BACKEND, env={**clean, **env}, capture_output=True, text=True, timeout=60,
    )


def test_production_refuses_to_start_without_a_jwt_secret() -> None:
    missing = _import_config({"KHAYAL_ENV": "production"})
    assert missing.returncode != 0 and "KHAYAL_JWT_SECRET" in missing.stderr
    short = _import_config({"KHAYAL_ENV": "production", "KHAYAL_JWT_SECRET": "too-short"})
    assert short.returncode != 0

    ok = _import_config({
        "KHAYAL_ENV": "production",
        "KHAYAL_JWT_SECRET": "x" * 48,
        "KHAYAL_CORS_ORIGINS": "https://khayal-web.example.app/ , https://other.example.app",
        "KHAYAL_TIMEZONE": "Asia/Kolkata",
    })
    assert ok.returncode == 0, ok.stderr
    assert ok.stdout.startswith("db ")  # production keeps files in the database by default
    assert "['https://khayal-web.example.app', 'https://other.example.app']" in ok.stdout
