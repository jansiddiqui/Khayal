"""Deleting accounts and all their data: expired demo accounts in the public demo.

In demo mode (KHAYAL_DEMO_MODE=1) every new account gets `demo_expires_at`, 7 days after it
was made. `delete_expired` removes those accounts with everything that belongs to them. It
runs at startup, in the background loop, after sign-ins and from POST /api/internal/tick.

Rows are deleted explicitly, child tables first, so this works the same on SQLite (which
does not enforce ON DELETE CASCADE here) and on Postgres.
"""

from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app import config
from app.models import (
    Alert,
    CareLink,
    FamilyMember,
    GameRound,
    GameSession,
    PairingCode,
    PlayerLevel,
    Reminder,
    ReminderLog,
    Role,
    SpeechSample,
    StoredFile,
    User,
)
from app.services import family, speech, storage


def demo_expiry(now: datetime) -> datetime | None:
    """When an account made now should be removed (None outside the public demo)."""
    return now + timedelta(days=config.DEMO_ACCOUNT_DAYS) if config.DEMO_MODE else None


def _file_keys(db: Session, user_id: int) -> list[str]:
    keys = [
        family.photo_key(user_id, name)
        for paths in db.scalars(select(FamilyMember.photo_paths).where(FamilyMember.patient_id == user_id))
        for name in paths
    ]
    keys += [
        speech.audio_key(user_id, name)
        for name in db.scalars(select(SpeechSample.audio_path).where(SpeechSample.patient_id == user_id))
    ]
    return keys


def delete_user(db: Session, user_id: int) -> None:
    """Remove one account and everything that belongs to it (caller commits)."""
    storage.get().delete_owner(db, user_id, _file_keys(db, user_id))
    db.execute(delete(StoredFile).where(StoredFile.owner_id == user_id))
    session_ids = select(GameSession.id).where(GameSession.patient_id == user_id)
    db.execute(delete(GameRound).where(GameRound.session_id.in_(session_ids)))
    db.execute(delete(GameSession).where(GameSession.patient_id == user_id))
    db.execute(delete(PlayerLevel).where(PlayerLevel.patient_id == user_id))
    reminder_ids = select(Reminder.id).where(Reminder.patient_id == user_id)
    db.execute(delete(ReminderLog).where(ReminderLog.reminder_id.in_(reminder_ids)))
    db.execute(delete(Reminder).where(Reminder.patient_id == user_id))
    db.execute(delete(Alert).where(Alert.patient_id == user_id))
    db.execute(delete(PairingCode).where(or_(PairingCode.patient_id == user_id, PairingCode.created_by == user_id)))
    db.execute(delete(FamilyMember).where(FamilyMember.patient_id == user_id))
    db.execute(delete(SpeechSample).where(SpeechSample.patient_id == user_id))
    db.execute(delete(CareLink).where(or_(CareLink.caregiver_id == user_id, CareLink.patient_id == user_id)))
    db.execute(delete(User).where(User.id == user_id))


def _private_demo_patients(db: Session, caregiver_id: int) -> list[int]:
    """Demo patients linked to this caregiver and to no other caregiver."""
    linked = select(CareLink.patient_id).where(CareLink.caregiver_id == caregiver_id)
    rows = db.execute(
        select(User.id)
        .where(User.id.in_(linked), User.demo_expires_at.is_not(None))
        .where(~select(CareLink.id).where(CareLink.patient_id == User.id, CareLink.caregiver_id != caregiver_id).exists())
    )
    return list(rows.scalars())


def delete_expired(db: Session, now: datetime) -> int:
    """Delete demo accounts past their expiry, and the oldest demo caregivers (with their
    private demo patients) beyond DEMO_MAX_CAREGIVERS. Returns how many accounts were removed."""
    doomed = set(db.scalars(select(User.id).where(User.demo_expires_at.is_not(None), User.demo_expires_at <= now)))

    demo_caregivers = select(User.id).where(User.role == Role.caregiver, User.demo_expires_at.is_not(None))
    alive = db.scalar(select(func.count()).select_from(demo_caregivers.where(User.id.not_in(doomed)).subquery())) or 0
    if alive > config.DEMO_MAX_CAREGIVERS:
        oldest = db.scalars(
            demo_caregivers.where(User.id.not_in(doomed)).order_by(User.demo_expires_at, User.id).limit(alive - config.DEMO_MAX_CAREGIVERS)
        )
        doomed.update(oldest)

    # A removed demo caregiver takes their private demo patients along.
    for caregiver_id in list(db.scalars(select(User.id).where(User.id.in_(doomed), User.role == Role.caregiver))):
        doomed.update(_private_demo_patients(db, caregiver_id))

    for user_id in sorted(doomed):
        delete_user(db, user_id)
    db.commit()
    return len(doomed)
