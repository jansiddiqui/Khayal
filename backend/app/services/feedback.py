"""Feedback inbox (Round 2 batch 3): "Send feedback" from caregivers and patients, read by admins.

Patients choose "Something was hard" or "I liked this", optionally with a few words or, when
their voice opt-in is on, a short voice note. Caregivers choose a kind and write. Feedback is
deleted with its sender's account; voice notes follow the voice opt-in (withdrawing it deletes them).
"""

import secrets
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Feedback, FeedbackKind, FeedbackStatus, Role, User
from app.services import speech, storage

MAX_NOTE_BYTES = 2 * 1024 * 1024  # about 2 minutes of Opus


class VoiceNotAllowedError(Exception):
    """Voice notes need a patient with the voice opt-in."""


class AudioError(ValueError):
    pass


def create(db: Session, user: User, kind: FeedbackKind, text: str | None, page: str | None, now: datetime) -> Feedback:
    item = Feedback(
        user_id=user.id,
        role=user.role,
        kind=kind,
        text=(text or "").strip() or None,
        page=(page or "").strip()[:200] or None,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    db.commit()
    return item


def attach_voice(db: Session, item: Feedback, user: User, data: bytes, content_type: str, now: datetime) -> Feedback:
    if user.role != Role.patient or not user.voice_task_enabled:
        raise VoiceNotAllowedError()
    if item.audio_key is not None:
        raise AudioError("This feedback already has a voice note.")
    if content_type not in speech.AUDIO_TYPES:
        raise AudioError("Voice notes must be WebM or Ogg audio.")
    extension, magic = speech.AUDIO_TYPES[content_type]
    if len(data) > MAX_NOTE_BYTES:
        raise AudioError("That voice note is too long.")
    if not data.startswith(magic):
        raise AudioError("That file is not a recording we can open.")
    key = f"feedback/{user.id}/{secrets.token_hex(16)}.{extension}"
    storage.get().save(db, key, user.id, data, content_type)
    item.audio_key, item.audio_type, item.updated_at = key, content_type, now
    db.commit()
    return item


def mine(db: Session, user: User, feedback_id: int) -> Feedback | None:
    item = db.get(Feedback, feedback_id)
    return item if item is not None and item.user_id == user.id else None


def inbox(db: Session, status: FeedbackStatus | None = None) -> list[Feedback]:
    stmt = select(Feedback).order_by(Feedback.created_at.desc(), Feedback.id.desc()).limit(500)
    if status is not None:
        stmt = stmt.where(Feedback.status == status)
    return list(db.scalars(stmt))


def set_status(db: Session, item: Feedback, status: FeedbackStatus, now: datetime) -> Feedback:
    item.status, item.updated_at = status, now
    db.commit()
    return item


def delete_voice_notes(db: Session, user_id: int) -> int:
    """Remove a patient's feedback voice notes (voice opt-in withdrawn); the text stays."""
    store = storage.get()
    items = list(db.scalars(select(Feedback).where(Feedback.user_id == user_id, Feedback.audio_key.is_not(None))))
    for item in items:
        assert item.audio_key is not None
        store.delete(db, item.audio_key)
        item.audio_key = item.audio_type = None
    return len(items)


def audio_keys(db: Session, user_id: int) -> list[str]:
    return [k for k in db.scalars(select(Feedback.audio_key).where(Feedback.user_id == user_id)) if k]
