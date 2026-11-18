"""Deleting accounts and all their data.

- "Delete my account": the caregiver, and every elder no other caregiver looks after.
- Demo mode (KHAYAL_DEMO_MODE=1, local development and the old public demo): every new
  account gets `demo_expires_at`, 7 days later, and `delete_expired` removes it (at startup,
  in the background loop, after sign-ins and from the tick). With demo mode off nothing
  expires on its own; an admin removes leftover demo accounts once ("Remove all demo accounts").

Rows are deleted explicitly, child tables first, so this works the same on SQLite (which
does not enforce ON DELETE CASCADE here) and on Postgres.
"""

from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from app import config
from app.models import (
    AdminLog,
    Feedback,
    MemoryEntry,
    MoodCheckin,
    PatientEvent,
    Alert,
    CareInvite,
    CareLink,
    Consent,
    DeviceSession,
    FamilyMember,
    GameRound,
    GameSession,
    PairingCode,
    PasswordReset,
    PlayerLevel,
    Reminder,
    TutorialState,
    ReminderLog,
    Role,
    SignupInvite,
    SpeechSample,
    StoredFile,
    User,
)
from app.services import family, feedback, memories, speech, storage


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
    photo = db.scalar(select(User.photo_key).where(User.id == user_id))
    if photo:
        keys.append(photo)
    return keys + feedback.audio_keys(db, user_id) + memories.file_keys(db, user_id)


def delete_user(db: Session, user_id: int) -> None:
    """Remove one account and everything that belongs to it (caller commits)."""
    storage.get().delete_owner(db, user_id, _file_keys(db, user_id))
    db.execute(delete(StoredFile).where(StoredFile.owner_id == user_id))
    session_ids = select(GameSession.id).where(GameSession.patient_id == user_id)
    db.execute(delete(GameRound).where(GameRound.session_id.in_(session_ids)))
    db.execute(delete(GameSession).where(GameSession.patient_id == user_id))
    db.execute(delete(PlayerLevel).where(PlayerLevel.patient_id == user_id))
    db.execute(delete(TutorialState).where(TutorialState.patient_id == user_id))
    reminder_ids = select(Reminder.id).where(Reminder.patient_id == user_id)
    db.execute(delete(ReminderLog).where(ReminderLog.reminder_id.in_(reminder_ids)))
    db.execute(delete(Reminder).where(Reminder.patient_id == user_id))
    db.execute(delete(Alert).where(Alert.patient_id == user_id))
    db.execute(delete(PairingCode).where(or_(PairingCode.patient_id == user_id, PairingCode.created_by == user_id)))
    db.execute(delete(FamilyMember).where(FamilyMember.patient_id == user_id))
    db.execute(delete(SpeechSample).where(SpeechSample.patient_id == user_id))
    db.execute(delete(CareLink).where(or_(CareLink.caregiver_id == user_id, CareLink.patient_id == user_id)))
    db.execute(delete(Consent).where(or_(Consent.user_id == user_id, Consent.patient_id == user_id)))
    db.execute(delete(DeviceSession).where(DeviceSession.patient_id == user_id))
    db.execute(delete(Feedback).where(Feedback.user_id == user_id))
    db.execute(delete(MoodCheckin).where(MoodCheckin.patient_id == user_id))
    db.execute(delete(MemoryEntry).where(MemoryEntry.patient_id == user_id))
    db.execute(update(MemoryEntry).where(MemoryEntry.created_by == user_id).values(created_by=None))
    db.execute(delete(PatientEvent).where(PatientEvent.patient_id == user_id))
    db.execute(update(PatientEvent).where(PatientEvent.actor_id == user_id).values(actor_id=None))
    db.execute(update(AdminLog).where(AdminLog.admin_id == user_id).values(admin_id=None))
    db.execute(update(DeviceSession).where(DeviceSession.paired_by == user_id).values(paired_by=None))
    db.execute(delete(CareInvite).where(or_(CareInvite.patient_id == user_id, CareInvite.created_by == user_id)))
    db.execute(update(CareInvite).where(CareInvite.used_by == user_id).values(used_by=None))
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user_id))
    db.execute(update(PasswordReset).where(PasswordReset.created_by == user_id).values(created_by=None))
    db.execute(update(SignupInvite).where(SignupInvite.created_by == user_id).values(created_by=None))
    db.execute(update(SignupInvite).where(SignupInvite.used_by == user_id).values(used_by=None))
    db.execute(delete(User).where(User.id == user_id))


def private_patients(db: Session, caregiver_id: int, demo_only: bool = False) -> list[int]:
    """Patients linked to this caregiver and to no other caregiver (optionally demo ones only)."""
    linked = select(CareLink.patient_id).where(CareLink.caregiver_id == caregiver_id)
    stmt = select(User.id).where(User.id.in_(linked)).where(
        ~select(CareLink.id).where(CareLink.patient_id == User.id, CareLink.caregiver_id != caregiver_id).exists()
    )
    if demo_only:
        stmt = stmt.where(User.demo_expires_at.is_not(None))
    return list(db.scalars(stmt))


def delete_account(db: Session, caregiver: User) -> list[int]:
    """'Delete my account': the caregiver and every elder no other caregiver looks after,
    with all their data and files. Returns the ids removed."""
    doomed = [caregiver.id, *private_patients(db, caregiver.id)]
    for user_id in doomed:
        delete_user(db, user_id)
    db.commit()
    return doomed


def demo_accounts(db: Session) -> list[User]:
    """Accounts made while demo mode was on (they carry demo_expires_at)."""
    return list(db.scalars(select(User).where(User.demo_expires_at.is_not(None)).order_by(User.id)))


def remove_demo_accounts(db: Session) -> int:
    """Remove every demo account and its data at once (admin, after turning demo mode off)."""
    ids = [u.id for u in demo_accounts(db)]
    for user_id in ids:
        delete_user(db, user_id)
    db.commit()
    return len(ids)


def delete_expired(db: Session, now: datetime) -> int:
    """Delete demo accounts past their expiry, and the oldest demo caregivers (with their
    private demo patients) beyond DEMO_MAX_CAREGIVERS. Returns how many accounts were removed.
    Does nothing unless demo mode is on: real accounts never expire."""
    if not config.DEMO_MODE:
        return 0
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
        doomed.update(private_patients(db, caregiver_id, demo_only=True))

    for user_id in sorted(doomed):
        delete_user(db, user_id)
    db.commit()
    return len(doomed)
