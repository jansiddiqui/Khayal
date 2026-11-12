from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import GameType, Role, User
from app.services import auth, speech
from app.services.clock import LOCAL_TZ
from app.services.today_games import todays_games
from ml.speech import stub
from tests.conftest import Clock, Register, bearer

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 2000
OGG = b"OggS" + b"\x00" * 2000
TODAY = date(2026, 11, 4)


def local_time(day: date, hour: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


class Setup:
    def __init__(self, client: TestClient, register: Register) -> None:
        self.client = client
        self.cg = bearer(register("Priya", "p@example.com", "caregiver"))
        payload = register("Kamala", "k@example.com", "patient")
        self.patient = bearer(payload)
        self.pid: int = payload["user"]["id"]  # type: ignore[index]
        client.post("/api/patients/link", json={"patient_email": "k@example.com"}, headers=self.cg)

    def enable(self, on: bool = True) -> dict[str, object]:
        response = self.client.patch(f"/api/patients/{self.pid}", json={"voice_task_enabled": on}, headers=self.cg)
        assert response.status_code == 200, response.text
        return dict(response.json())

    def upload(self, data: bytes = WEBM, content_type: str = "audio/webm;codecs=opus", duration_ms: int = 45_000):  # type: ignore[no-untyped-def]
        return self.client.post(
            f"/api/speech?duration_ms={duration_ms}", content=data, headers={**self.patient, "Content-Type": content_type}
        )


def test_stub_returns_no_transcript_and_no_score(tmp_path: Path) -> None:
    result = stub.score(tmp_path / "x.webm")
    assert result == stub.SpeechResult(transcript=None, risk_score=None, model_version="stub-0")


def test_voice_task_is_off_by_default_and_consent_date_is_recorded(
    client: TestClient, register: Register, clock: Clock
) -> None:
    s = Setup(client, register)
    assert s.upload().status_code == 403
    clock.now = datetime(2026, 11, 4, 5, 0, tzinfo=timezone.utc)
    patient = s.enable()
    assert patient["voice_task_enabled"] is True
    assert patient["voice_consent_at"].startswith("2026-11-04T05:00")  # type: ignore[union-attr]
    off = s.enable(False)
    assert off["voice_task_enabled"] is False and off["voice_consent_at"] is None
    assert s.upload().status_code == 403


def test_patient_uploads_and_caregiver_lists_and_plays_back(
    client: TestClient, register: Register, upload_dir: Path
) -> None:
    s = Setup(client, register)
    s.enable()
    response = s.upload()
    assert response.status_code == 201, response.text
    sample = response.json()
    # No made-up numbers: the stub leaves transcript and score empty.
    assert sample["duration_ms"] == 45_000
    assert sample["transcript"] is None and sample["risk_score"] is None
    assert sample["model_version"] == "stub-0"

    files = list((upload_dir / "speech" / str(s.pid)).iterdir())
    assert len(files) == 1 and files[0].suffix == ".webm"

    listed = client.get(f"/api/patients/{s.pid}/speech", headers=s.cg).json()
    assert [r["id"] for r in listed] == [sample["id"]]
    audio = client.get(f"/api/{sample['audio_url'].lstrip('/')}", headers=s.cg)
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/webm"
    assert audio.content == WEBM
    assert s.upload(OGG, "audio/ogg").status_code == 201


def test_recordings_are_private(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    s.enable()
    sample = s.upload().json()
    stranger = bearer(register("Other", "o@example.com", "caregiver"))
    assert client.get(f"/api/patients/{s.pid}/speech", headers=stranger).status_code == 403
    assert client.get(f"/api/{sample['audio_url'].lstrip('/')}", headers=stranger).status_code == 403
    assert client.get(f"/api/{sample['audio_url'].lstrip('/')}").status_code == 401
    # A caregiver cannot upload as if they were the patient.
    assert client.post("/api/speech?duration_ms=1000", content=WEBM, headers={**s.cg, "Content-Type": "audio/webm"}).status_code == 403


def test_rejects_wrong_type_fake_audio_bad_length_and_large_files(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    s.enable()
    assert s.upload(content_type="audio/mpeg").status_code == 415
    assert s.upload(b"not audio at all", "audio/webm").status_code == 422
    assert s.upload(duration_ms=0).status_code == 422
    assert s.upload(duration_ms=speech.MAX_DURATION_MS + 1).status_code == 422
    big = b"\x1a\x45\xdf\xa3" + b"\x00" * speech.MAX_AUDIO_BYTES
    assert s.upload(big).status_code == 413
    assert client.get(f"/api/patients/{s.pid}/speech", headers=s.cg).json() == []


def new_patient(db: Session, enabled: bool = True) -> User:
    patient = auth.register_user(db, name="Kamala", email="k@example.com", password="password123", role=Role.patient)
    speech.set_enabled(db, patient, enabled, local_time(TODAY - timedelta(days=30), 9))
    return patient


def record(db: Session, patient: User, when: datetime) -> None:
    speech.save_recording(db, patient, WEBM, "audio/webm", 30_000, when)


def test_voice_task_replaces_slot_three_when_due(db: Session) -> None:
    patient = new_patient(db)
    games = todays_games(db, patient, TODAY)
    assert games[0].game_type == GameType.daily_orientation
    assert games[2].game_type == "voice_task" and not games[2].done_today

    # Recorded today: it stays in slot 3, marked done.
    record(db, patient, local_time(TODAY, 10))
    games = todays_games(db, patient, TODAY)
    assert games[2].game_type == "voice_task" and games[2].done_today

    # Not due for the next 6 days, due again a week later.
    for offset in range(1, 7):
        assert "voice_task" not in [g.game_type for g in todays_games(db, patient, TODAY + timedelta(days=offset))]
    assert todays_games(db, patient, TODAY + timedelta(days=7))[2].game_type == "voice_task"


def test_voice_task_never_offered_without_consent(db: Session) -> None:
    patient = new_patient(db, enabled=False)
    assert "voice_task" not in [g.game_type for g in todays_games(db, patient, TODAY)]


def test_todays_games_api_includes_the_voice_task(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    assert "voice_task" not in [g["game_type"] for g in client.get("/api/me/games/today", headers=s.patient).json()["games"]]
    s.enable()
    games = client.get("/api/me/games/today", headers=s.patient).json()["games"]
    assert [g["game_type"] for g in games][2] == "voice_task"
