"""'Export my data': a zip with everything Khayal holds about a caregiver and the elders they
look after, as JSON, plus the photos and voice recordings as files."""

import io
import json
import zipfile
from datetime import date, datetime, time
from enum import Enum
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import (
    Alert,
    CareLink,
    DeviceSession,
    FamilyMember,
    Feedback,
    GameSession,
    PatientEvent,
    PlayerLevel,
    Reminder,
    ReminderLog,
    SpeechSample,
    User,
)
from app.services import care, consent, family, speech, storage


def _plain(value: Any) -> Any:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    return value


def _row(obj: object, skip: tuple[str, ...] = ()) -> dict[str, Any]:
    columns = obj.__table__.columns  # type: ignore[attr-defined]
    return {c.key: _plain(getattr(obj, c.key)) for c in columns if c.key not in skip}


def build(db: Session, user: User, now: datetime) -> bytes:
    out = io.BytesIO()
    store = storage.get()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        account = _row(user, skip=("password_hash", "token_version"))
        data: dict[str, Any] = {
            "exported_at": now.isoformat(),
            "policy_version": config.POLICY_VERSION,
            "account": account,
            "consents_given": [_row(c) for c in consent.for_user(db, user)],
            "feedback_sent": [_row(f, skip=("audio_key",)) for f in db.scalars(select(Feedback).where(Feedback.user_id == user.id))],
            "elders": [],
        }
        for elder in care.linked_patients(db, user):
            sessions = list(db.scalars(select(GameSession).where(GameSession.patient_id == elder.id).order_by(GameSession.started_at)))
            reminders = list(db.scalars(select(Reminder).where(Reminder.patient_id == elder.id)))
            members = family.members_for(db, elder.id)
            samples = speech.samples_for(db, elder.id)
            folder = f"elders/{elder.id}"
            entry = {
                "elder": _row(elder, skip=("password_hash", "token_version", "email")),
                "caregivers": [
                    _row(u, skip=("password_hash", "token_version", "city", "pinned_games", "voice_task_enabled",
                                  "voice_consent_at", "photos_enabled", "photo_key"))
                    for u in db.scalars(
                        select(User).join(CareLink, CareLink.caregiver_id == User.id).where(CareLink.patient_id == elder.id)
                    )
                ],
                "consents": [_row(c) for c in consent.for_patient(db, elder.id)],
                "levels": [_row(p) for p in db.scalars(select(PlayerLevel).where(PlayerLevel.patient_id == elder.id))],
                "game_sessions": [{**_row(s), "rounds": [_row(r) for r in s.rounds]} for s in sessions],
                "reminders": [
                    {**_row(r), "logs": [_row(log) for log in db.scalars(select(ReminderLog).where(ReminderLog.reminder_id == r.id))]}
                    for r in reminders
                ],
                "alerts": [_row(a) for a in db.scalars(select(Alert).where(Alert.patient_id == elder.id))],
                "family": [_row(m) for m in members],
                "voice_recordings": [_row(s) for s in samples],
                "devices": [_row(d) for d in db.scalars(select(DeviceSession).where(DeviceSession.patient_id == elder.id))],
                "feedback": [_row(f, skip=("audio_key",)) for f in db.scalars(select(Feedback).where(Feedback.user_id == elder.id))],
                "settings_changes": [_row(e) for e in db.scalars(select(PatientEvent).where(PatientEvent.patient_id == elder.id))],
            }
            data["elders"].append(entry)
            for m in members:
                for name in m.photo_paths:
                    blob = store.load(db, family.photo_key(elder.id, name))
                    if blob is not None:
                        z.writestr(f"{folder}/family-photos/{m.id}-{name}", blob)
            for s in samples:
                blob = store.load(db, speech.audio_key(elder.id, s.audio_path))
                if blob is not None:
                    z.writestr(f"{folder}/voice/{s.audio_path}", blob)
            if elder.photo_key:
                blob = store.load(db, elder.photo_key)
                if blob is not None:
                    z.writestr(f"{folder}/elder-photo.jpg", blob)
        z.writestr("khayal-data.json", json.dumps(data, indent=2, ensure_ascii=False))
        z.writestr(
            "README.txt",
            "Your Khayal data, exported " + now.strftime("%Y-%m-%d %H:%M UTC") + ".\n"
            "khayal-data.json holds your account, your consents and, for each elder you look after, their games,\n"
            "reminders, alerts, family, voice recordings and devices. Photos and recordings are in elders/<id>/.\n",
        )
    return out.getvalue()
