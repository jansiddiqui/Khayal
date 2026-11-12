"""The weekly voice task: consent, recordings and when it is due (CLAUDE.md sections 6-7).

Recordings are WebM or Ogg audio (Opus) up to 10 MB, stored under
data/uploads/speech/{patient_id}/ and only ever served by an authenticated route. Each one
goes through ml/speech (a stub for now: no transcript, no score).
"""

import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import SpeechSample, User
from app.services.clock import as_utc, local_day_start
from ml.speech import stub

MAX_AUDIO_BYTES = 10 * 1024 * 1024
# The patient screen stops by itself after 3 minutes; allow some slack for the browser.
MAX_DURATION_MS = 4 * 60 * 1000
DUE_EVERY_DAYS = 7
# Content type -> (file extension, the bytes such a file starts with).
AUDIO_TYPES: dict[str, tuple[str, bytes]] = {
    "audio/webm": ("webm", b"\x1a\x45\xdf\xa3"),
    "audio/ogg": ("ogg", b"OggS"),
}
_FILE_NAME = re.compile(r"^[0-9a-f]{32}\.(webm|ogg)$")


class AudioError(Exception):
    """A recording that can't be accepted; the message is safe to show."""


class VoiceTaskOffError(Exception):
    """The caregiver has not turned the voice task on for this patient."""


def audio_dir(patient_id: int) -> Path:
    return config.UPLOAD_DIR / "speech" / str(patient_id)


def set_enabled(db: Session, patient: User, enabled: bool, now: datetime) -> None:
    """Turn the voice task on (recording the consent date) or off."""
    if enabled and not patient.voice_task_enabled:
        patient.voice_consent_at = now
    elif not enabled:
        patient.voice_consent_at = None
    patient.voice_task_enabled = enabled
    db.commit()


def samples_for(db: Session, patient_id: int) -> list[SpeechSample]:
    return list(
        db.scalars(
            select(SpeechSample).where(SpeechSample.patient_id == patient_id).order_by(SpeechSample.recorded_at.desc())
        )
    )


def save_recording(
    db: Session, patient: User, data: bytes, content_type: str, duration_ms: int, now: datetime
) -> SpeechSample:
    if not patient.voice_task_enabled:
        raise VoiceTaskOffError()
    if content_type not in AUDIO_TYPES:
        raise AudioError("Recordings must be WebM or Ogg audio.")
    extension, magic = AUDIO_TYPES[content_type]
    if len(data) > MAX_AUDIO_BYTES:
        raise AudioError("Recordings must be 10 MB or smaller.")
    if not data.startswith(magic):
        raise AudioError("That file is not a recording we can open.")
    if not 0 < duration_ms <= MAX_DURATION_MS:
        raise AudioError("The recording length is not valid.")

    folder = audio_dir(patient.id)
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{extension}"
    path = folder / name
    path.write_bytes(data)
    result = stub.score(path)
    sample = SpeechSample(
        patient_id=patient.id,
        audio_path=name,
        content_type=content_type,
        recorded_at=now,
        duration_ms=duration_ms,
        transcript=result.transcript,
        risk_score=result.risk_score,
        model_version=result.model_version,
    )
    db.add(sample)
    db.commit()
    return sample


def audio_file(sample: SpeechSample) -> Path | None:
    """The sample's file, never a path outside the patient's folder."""
    if not _FILE_NAME.match(sample.audio_path):
        return None
    path = audio_dir(sample.patient_id) / sample.audio_path
    return path if path.is_file() else None


def voice_task_status(db: Session, patient: User, today: date) -> tuple[bool, bool]:
    """(offered today, recorded today).

    Weekly: the task is due when the patient has made no recording in the 6 days before
    today (so a Monday recording makes it due again next Monday). It stays on today's list,
    marked done, once recorded today. Never offered without the caregiver's consent.
    """
    if not patient.voice_task_enabled:
        return False, False
    day_start = local_day_start(today)
    window_start = local_day_start(today - timedelta(days=DUE_EVERY_DAYS - 1))
    recent = list(
        db.scalars(
            select(SpeechSample.recorded_at).where(
                SpeechSample.patient_id == patient.id, SpeechSample.recorded_at >= window_start
            )
        )
    )
    recorded_today = any(_naive(r) >= _naive(day_start) for r in recent)
    recorded_before_today = any(_naive(r) < _naive(day_start) for r in recent)
    return (recorded_today or not recorded_before_today), recorded_today


def _naive(dt: datetime) -> datetime:
    """SQLite returns naive UTC datetimes; compare everything as naive UTC."""
    return as_utc(dt).replace(tzinfo=None)
