"""Mood check-in and memory book (Round 2 batch 4)."""

import csv
import io
import zipfile
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import MemoryEntry, MoodCheckin, User
from app.services import accounts
from app.services.clock import LOCAL_TZ
from tests.conftest import Clock, Register, bearer
from tests.test_reminders import Setup

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
ADMIN = "admin@khayal.test"


def jpeg() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (40, 30), (14, 94, 99)).save(out, format="JPEG")
    return out.getvalue()


def at(day: int, hour: int) -> datetime:
    return datetime(2026, 11, day, hour, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def test_mood_once_a_day_with_skip(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(16, 9)
    s = Setup(client, register)
    assert client.get("/api/me/mood/today", headers=s.patient).json() == {"asked": False, "mood": None}
    assert client.post("/api/me/mood", json={"mood": "okay"}, headers=s.patient).json() == {"asked": True, "mood": "okay"}
    assert client.get("/api/me/mood/today", headers=s.patient).json() == {"asked": True, "mood": "okay"}
    clock.now = at(17, 8)
    assert client.get("/api/me/mood/today", headers=s.patient).json()["asked"] is False
    assert client.post("/api/me/mood", json={"mood": None}, headers=s.patient).json() == {"asked": True, "mood": None}
    clock.now = at(18, 8)
    client.post("/api/me/mood", json={"mood": "not_so_good"}, headers=s.patient)
    assert client.post("/api/me/mood", json={"mood": "sad"}, headers=s.patient).status_code == 422
    # Caregivers only, linked only.
    assert client.post("/api/me/mood", json={"mood": "good"}, headers=s.cg).status_code == 403
    history = client.get(f"/api/patients/{s.pid}/mood?days=7", headers=s.cg).json()
    assert history == [
        {"date": "2026-11-16", "mood": "okay"},
        {"date": "2026-11-17", "mood": None},
        {"date": "2026-11-18", "mood": "not_so_good"},
    ]
    other = bearer(register("Meera", "m@example.com", "caregiver"))
    assert client.get(f"/api/patients/{s.pid}/mood", headers=other).status_code == 403


def test_mood_in_timeline_weekly_and_report(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(16, 9)
    s = Setup(client, register)
    client.post("/api/me/mood", json={"mood": "good"}, headers=s.patient)
    clock.now = at(17, 9)
    client.post("/api/me/mood", json={"mood": "not_so_good"}, headers=s.patient)
    clock.now = at(17, 12)
    titles = [e["title"] for e in client.get(f"/api/patients/{s.pid}/timeline?kinds=mood", headers=s.cg).json()]
    assert titles == ["Feeling: Not so good", "Feeling: Good"]
    week = client.get(f"/api/patients/{s.pid}/weekly", headers=s.cg).json()["this_week"]
    assert week["mood"] == {"good": 1, "okay": 0, "not_so_good": 1, "skipped": 0}
    report = client.get(f"/api/patients/{s.pid}/report?days=30", headers=s.cg).json()
    assert report["mood"]["not_so_good"] == 1
    assert report["mood_days"] == [{"date": "2026-11-16", "mood": "good"}, {"date": "2026-11-17", "mood": "not_so_good"}]


def test_mood_goes_into_the_research_export(
    client: TestClient, register: Register, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "ADMIN_EMAILS", frozenset({ADMIN}))
    admin = bearer(register("Admin", ADMIN, "caregiver"))
    clock.now = at(16, 9)
    s = Setup(client, register)
    client.post("/api/me/mood", json={"mood": "good"}, headers=s.patient)
    client.post(f"/api/patients/{s.pid}/consents", json={"kind": "research", "granted": True}, headers=s.cg)
    z = zipfile.ZipFile(io.BytesIO(client.get("/api/admin/research-export", headers=admin).content))
    rows = list(csv.DictReader(io.StringIO(z.read("mood.csv").decode())))
    assert [(r["day"], r["mood"]) for r in rows] == [("0", "good")]


def test_memory_book_needs_photos_and_voice_opt_ins(client: TestClient, register: Register, clock: Clock, db: Session) -> None:
    s = Setup(client, register)
    base = f"/api/patients/{s.pid}/memories"
    body = {"title": "Our wedding, 1972", "story": "A rainy day in Lucknow."}
    assert client.post(base, json=body, headers=s.cg).status_code == 403  # photos opt-in off
    client.post(f"/api/patients/{s.pid}/consents", json={"kind": "photos", "granted": True}, headers=s.cg)
    entry = client.post(base, json=body, headers=s.cg).json()
    url = f"{base}/{entry['id']}"
    # Without a photo the elder doesn't see the page yet.
    assert client.get(base, headers=s.patient).json() == []
    photo = client.post(f"{url}/photos", content=jpeg(), headers={**s.cg, "Content-Type": "image/jpeg"})
    assert photo.status_code == 201
    entry = photo.json()
    assert len(entry["photos"]) == 1
    listed = client.get(base, headers=s.patient).json()
    assert [m["title"] for m in listed] == ["Our wedding, 1972"]
    assert client.get(f"/api{entry['photos'][0]['url']}", headers=s.patient).headers["content-type"] == "image/jpeg"
    for _ in range(4):
        client.post(f"{url}/photos", content=jpeg(), headers={**s.cg, "Content-Type": "image/jpeg"})
    assert client.post(f"{url}/photos", content=jpeg(), headers={**s.cg, "Content-Type": "image/jpeg"}).status_code == 409

    voice = f"{url}/voice?duration_ms=4000"
    assert client.post(voice, content=WEBM, headers={**s.cg, "Content-Type": "audio/webm"}).status_code == 403
    client.post(f"/api/patients/{s.pid}/consents", json={"kind": "voice", "granted": True}, headers=s.cg)
    with_voice = client.post(voice, content=WEBM, headers={**s.cg, "Content-Type": "audio/webm"}).json()
    assert with_voice["voice_ms"] == 4000
    assert client.get(f"/api{with_voice['voice_url']}", headers=s.patient).content == WEBM
    # The elder can't change the book; another family can't see it.
    assert client.post(base, json=body, headers=s.patient).status_code == 403
    other = bearer(register("Meera", "m@example.com", "caregiver"))
    assert client.get(base, headers=other).status_code == 403

    # Withdrawing voice removes the voice note; withdrawing photos removes the pages.
    client.post(f"/api/patients/{s.pid}/consents", json={"kind": "voice", "granted": False}, headers=s.cg)
    assert client.get(base, headers=s.cg).json()[0]["voice_url"] is None
    client.post(f"/api/patients/{s.pid}/consents", json={"kind": "photos", "granted": False}, headers=s.cg)
    assert client.get(base, headers=s.cg).json() == []
    assert list(db.scalars(select(MemoryEntry))) == []


def test_memory_edit_delete_and_timeline(client: TestClient, register: Register, clock: Clock) -> None:
    s = Setup(client, register)
    client.post(f"/api/patients/{s.pid}/consents", json={"kind": "photos", "granted": True}, headers=s.cg)
    base = f"/api/patients/{s.pid}/memories"
    entry = client.post(base, json={"title": "Diwali 1985"}, headers=s.cg).json()
    edited = client.put(f"{base}/{entry['id']}", json={"title": "Diwali 1985", "story": "Rangoli at the door."}, headers=s.cg).json()
    assert edited["story"] == "Rangoli at the door."
    assert client.delete(f"{base}/{entry['id']}", headers=s.cg).status_code == 204
    titles = [e["title"] for e in client.get(f"/api/patients/{s.pid}/timeline?kinds=settings", headers=s.cg).json()]
    assert "Memory added: Diwali 1985" in titles and "Memory removed: Diwali 1985" in titles


def test_account_deletion_removes_mood_and_memories(client: TestClient, register: Register, db: Session) -> None:
    s = Setup(client, register)
    client.post(f"/api/patients/{s.pid}/consents", json={"kind": "photos", "granted": True}, headers=s.cg)
    entry = client.post(f"/api/patients/{s.pid}/memories", json={"title": "Pune, 1990"}, headers=s.cg).json()
    client.post(f"/api/patients/{s.pid}/memories/{entry['id']}/photos", content=jpeg(), headers={**s.cg, "Content-Type": "image/jpeg"})
    client.post("/api/me/mood", json={"mood": "good"}, headers=s.patient)
    caregiver = db.scalar(select(User).where(User.email == "p@example.com"))
    assert caregiver is not None
    accounts.delete_account(db, caregiver)
    assert list(db.scalars(select(MemoryEntry))) == [] and list(db.scalars(select(MoodCheckin))) == []
