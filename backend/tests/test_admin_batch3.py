"""Admin (Round 2 batch 3): pilot overview, health, feedback inbox, research consent + export,
user search and the activity log."""

import csv
import io
import zipfile
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import (
    AdminLog,
    DeviceSession,
    Feedback,
    GameSession,
    InviteRequest,
    InviteRole,
    InviteStatus,
    Role,
    SignupInvite,
    User,
)
from app.services import accounts, auth, care, research
from tests.conftest import Clock, Register, bearer, link_patient
from tests.test_games import session_body

ADMIN = "admin@khayal.test"
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64


@pytest.fixture
def admin_headers(register: Register, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(config, "ADMIN_EMAILS", frozenset({ADMIN}))
    return bearer(register("Admin", ADMIN, "caregiver"))


def play(client: TestClient, headers: dict[str, str], when: datetime, game: str = "word_recall") -> None:
    body = session_body("11110", game)
    body["started_at"] = when.isoformat()
    body["ended_at"] = (when + timedelta(minutes=3)).isoformat()
    assert client.post("/api/sessions", json=body, headers=headers).status_code == 201


def family(client: TestClient, register: Register, n: int) -> tuple[dict[str, str], dict[str, str], int]:
    cg = bearer(register(f"Carer {n}", f"c{n}@example.com", "caregiver"))
    payload = register(f"Elder {n}", f"e{n}@example.com", "patient")
    link_patient(client, f"e{n}@example.com", cg)
    return cg, bearer(payload), int(payload["user"]["id"])  # type: ignore[index]


def test_admin_routes_are_admin_only(client: TestClient, register: Register, admin_headers: dict[str, str]) -> None:
    other = bearer(register("Priya", "p@example.com", "caregiver"))
    for path in ("/api/admin/overview", "/api/admin/health", "/api/admin/feedback", "/api/admin/log", "/api/admin/research-export"):
        assert client.get(path, headers=other).status_code == 403
        assert client.get(path, headers=admin_headers).status_code == 200


def test_pilot_overview_counts_real_families_only(
    client: TestClient, register: Register, admin_headers: dict[str, str], clock: Clock, db: Session
) -> None:
    now = datetime(2026, 11, 18, 12, tzinfo=timezone.utc)
    clock.now = now
    _, elder1, e1 = family(client, register, 1)
    _, elder2, _ = family(client, register, 2)
    play(client, elder1, now - timedelta(days=40))  # first game 40 days ago, still playing
    play(client, elder1, now - timedelta(days=1))
    play(client, elder2, now - timedelta(days=20))  # one game, 20 days ago
    # A demo elder never counts.
    demo = auth.register_user(db, name="Demo", email=None, password=None, role=Role.patient)
    demo.demo_expires_at = now + timedelta(days=3)
    db.add(GameSession(patient_id=demo.id, game_type="word_recall", level_start=2, level_end=2, started_at=now, ended_at=now,
                       rounds_played=5, rounds_correct=4, hints_used=0, completed=True))
    # Funnel: two requests, one approved and used, the elder paired.
    req = InviteRequest(name="A", email="a@x.in", role=InviteRole.family, city="Pune", consent_at=now, status=InviteStatus.invited)
    db.add_all([req, InviteRequest(name="B", email="b@x.in", role=InviteRole.family, city="Pune", consent_at=now)])
    db.flush()
    c1 = db.scalar(select(User).where(User.email == "c1@example.com"))
    assert c1 is not None
    db.add(SignupInvite(token_hash="h" * 64, invite_request_id=req.id, note="A", expires_at=now + timedelta(days=14),
                        used_at=now, used_by=c1.id))
    db.add(DeviceSession(patient_id=e1, created_at=now, last_seen_at=now))
    db.commit()

    o = client.get("/api/admin/overview", headers=admin_headers).json()
    assert (o["families"], o["active_7"], o["active_30"]) == (2, 1, 2)
    assert len(o["sessions_per_day"]) == 30
    assert sum(d["count"] for d in o["sessions_per_day"]) == 2  # day 40 is outside the chart, the demo game too
    assert o["funnel"] == {"requested": 2, "approved": 1, "invited": 1, "signed_up": 1, "paired": 1, "active": 1}
    assert o["retention_7"] == {"days": 7, "eligible": 2, "retained": 1}
    assert o["retention_30"] == {"days": 30, "eligible": 1, "retained": 1}


def test_health_tracks_backup_and_cron(
    client: TestClient, admin_headers: dict[str, str], clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    h = client.get("/api/admin/health", headers=admin_headers).json()
    assert h["database"] in ("sqlite", "postgresql")
    assert h["db_bytes"] is not None and h["db_bytes"] > 0
    assert h["db_limit_bytes"] == 1024**3
    assert h["last_backup_at"] is None and h["backup_warning"] is True

    assert client.get("/api/admin/backup", headers=admin_headers).status_code == 200
    h = client.get("/api/admin/health", headers=admin_headers).json()
    assert h["last_backup_by"] == ADMIN and h["days_since_backup"] == 0 and h["backup_warning"] is False
    clock.now = clock.now + timedelta(days=8)
    h = client.get("/api/admin/health", headers=admin_headers).json()
    assert (h["days_since_backup"], h["backup_warning"]) == (8, True)

    monkeypatch.setattr(config, "TICK_SECRET", "s" * 32)
    assert client.post("/api/internal/tick", headers={"X-Khayal-Tick-Secret": "s" * 32}).status_code == 200
    h = client.get("/api/admin/health", headers=admin_headers).json()
    assert h["last_tick_at"] is not None and h["last_housekeeping_at"] is not None


def test_feedback_inbox(client: TestClient, register: Register, admin_headers: dict[str, str], db: Session) -> None:
    cg, elder, pid = family(client, register, 1)
    sent = client.post("/api/feedback", json={"kind": "other", "text": "The chart is hard to read", "page": "/caregiver"}, headers=cg)
    assert sent.status_code == 201
    hard = client.post("/api/feedback", json={"kind": "hard", "page": "/patient/games"}, headers=elder).json()
    # A voice note needs the elder's voice opt-in.
    voice = f"/api/feedback/{hard['id']}/voice"
    assert client.post(voice, content=WEBM, headers={**elder, "Content-Type": "audio/webm"}).status_code == 403
    assert client.post(f"/api/patients/{pid}/consents", json={"kind": "voice", "granted": True}, headers=cg).status_code == 200
    assert client.post(voice, content=WEBM, headers={**elder, "Content-Type": "audio/webm"}).status_code == 204
    # Not someone else's feedback.
    assert client.post(f"/api/feedback/{sent.json()['id']}/voice", content=WEBM, headers={**elder, "Content-Type": "audio/webm"}).status_code == 404

    inbox = client.get("/api/admin/feedback", headers=admin_headers).json()
    assert [i["kind"] for i in inbox] == ["hard", "other"]
    assert inbox[0]["has_voice"] is True and inbox[0]["sender"] == "Elder 1 (elder of Carer 1)"
    assert client.get(f"/api/admin/feedback/{hard['id']}/voice", headers=admin_headers).content == WEBM
    marked = client.post(f"/api/admin/feedback/{hard['id']}/status", json={"status": "resolved"}, headers=admin_headers).json()
    assert marked["status"] == "resolved"
    assert [i["id"] for i in client.get("/api/admin/feedback?status=new", headers=admin_headers).json()] == [sent.json()["id"]]

    # Withdrawing the voice opt-in deletes the voice note; the feedback stays.
    client.post(f"/api/patients/{pid}/consents", json={"kind": "voice", "granted": False}, headers=cg)
    assert client.get(f"/api/admin/feedback/{hard['id']}/voice", headers=admin_headers).status_code == 404
    assert db.get(Feedback, hard["id"]) is not None


def test_feedback_is_rate_limited(client: TestClient, register: Register) -> None:
    cg = bearer(register("Priya", "p@example.com", "caregiver"))
    codes = [client.post("/api/feedback", json={"kind": "liked"}, headers=cg).status_code for _ in range(11)]
    assert codes[:10] == [201] * 10 and codes[10] == 429


def test_research_export_has_consented_families_only_and_no_identifiers(
    client: TestClient, register: Register, admin_headers: dict[str, str], clock: Clock
) -> None:
    now = datetime(2026, 11, 18, 12, tzinfo=timezone.utc)
    clock.now = now
    cg1, elder1, p1 = family(client, register, 1)
    _, elder2, _ = family(client, register, 2)
    client.patch(f"/api/patients/{p1}", json={"city": "Lucknow"}, headers=cg1)
    client.post(f"/api/patients/{p1}/reminders", json={"title": "Amlodipine 5 mg", "type": "medicine", "time_of_day": "09:00", "repeat": "daily"}, headers=cg1)
    for d in (3, 2):
        play(client, elder1, now - timedelta(days=d))
    play(client, elder2, now - timedelta(days=1))
    assert client.post(f"/api/patients/{p1}/consents", json={"kind": "research", "granted": True}, headers=cg1).status_code == 200
    consents = client.get(f"/api/patients/{p1}/consents", headers=cg1).json()
    assert any(c["kind"] == "research" and c["policy_version"] == research.RESEARCH_POLICY_VERSION for c in consents)

    z = zipfile.ZipFile(io.BytesIO(client.get("/api/admin/research-export", headers=admin_headers).content))
    assert sorted(z.namelist()) == ["README.txt", "mood.csv", "reminders.csv", "sessions.csv"]
    raw = b"".join(z.read(n) for n in z.namelist()).decode()
    for secret in ("Elder 1", "Elder 2", "Carer", "example.com", "Lucknow", "Amlodipine"):
        assert secret not in raw
    tables = (z.read("sessions.csv") + z.read("reminders.csv")).decode()
    assert "2026" not in tables  # no dates in the data, only day numbers
    rows = list(csv.DictReader(io.StringIO(z.read("sessions.csv").decode())))
    assert len(rows) == 2 and {r["participant"] for r in rows} == {rows[0]["participant"]}
    assert [r["day"] for r in rows] == ["0", "1"]
    assert rows[0]["participant"].startswith("P")

    # A new export gives new IDs; withdrawing leaves the family out.
    again = zipfile.ZipFile(io.BytesIO(client.get("/api/admin/research-export", headers=admin_headers).content))
    assert list(csv.DictReader(io.StringIO(again.read("sessions.csv").decode())))[0]["participant"] != rows[0]["participant"]
    client.post(f"/api/patients/{p1}/consents", json={"kind": "research", "granted": False}, headers=cg1)
    empty = zipfile.ZipFile(io.BytesIO(client.get("/api/admin/research-export", headers=admin_headers).content))
    assert list(csv.DictReader(io.StringIO(empty.read("sessions.csv").decode()))) == []

    log = client.get("/api/admin/log?action=research_export", headers=admin_headers).json()
    assert len(log) == 3 and log[0]["admin_email"] == ADMIN


def test_user_search_and_the_activity_log(
    client: TestClient, register: Register, admin_headers: dict[str, str], db: Session
) -> None:
    family(client, register, 1)
    register("Kamala Devi", "kamala@example.com", "caregiver")
    names = lambda q: [u["name"] for u in client.get(f"/api/admin/users{q}", headers=admin_headers).json()]  # noqa: E731
    assert names("?q=kamala") == ["Kamala Devi"]
    assert names("?q=EXAMPLE.COM&role=caregiver") == ["Kamala Devi", "Carer 1"]
    assert names("?role=patient") == ["Elder 1"]
    assert "Admin" in names("?kind=real") and names("?kind=demo") == []

    user = db.scalar(select(User).where(User.email == "kamala@example.com"))
    assert user is not None
    assert client.post(f"/api/admin/users/{user.id}/reset-link", headers=admin_headers).status_code == 201
    assert client.post("/api/admin/invites", json={"note": "Dr. Rao"}, headers=admin_headers).status_code == 201
    log = client.get("/api/admin/log", headers=admin_headers).json()
    assert [e["action"] for e in log[:2]] == ["invite_created", "reset_link"]
    assert all(e["admin_email"] == ADMIN for e in log)


def test_deleting_an_account_removes_feedback(client: TestClient, register: Register, db: Session) -> None:
    cg, elder, pid = family(client, register, 1)
    client.post("/api/feedback", json={"kind": "liked"}, headers=elder)
    client.post("/api/feedback", json={"kind": "other", "text": "Thanks"}, headers=cg)
    caregiver = db.scalar(select(User).where(User.email == "c1@example.com"))
    assert caregiver is not None
    accounts.delete_account(db, caregiver)
    assert list(db.scalars(select(Feedback))) == []
    assert db.get(User, pid) is None
    assert care is not None and AdminLog is not None
