"""Consent records (India DPDP Act 2023) and the optional per-elder features they switch on.

- processing: given at sign-up, against the current policy version.
- elder_on_behalf: given when a caregiver adds an elder (family or guardian, and the elder
  agreed or the caregiver is legally authorised).
- photos / voice: separate opt-ins per elder. Withdrawing one turns the feature off and
  deletes that data (all family photos and the elder's photo; all voice recordings).
Records are never edited except to mark them withdrawn.
"""

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import config
from app.models import Consent, ConsentKind, FamilyMember, SpeechSample, User
from app.services import family, feedback, memories, speech, storage

ELDER_BASES = ("elder_agreed", "legal_authority")


def record(
    db: Session, user: User, kind: ConsentKind, now: datetime, patient: User | None = None, basis: str | None = None
) -> Consent:
    consent = Consent(
        user_id=user.id,
        patient_id=patient.id if patient else None,
        kind=kind,
        basis=basis,
        policy_version=config.POLICY_VERSION,
        granted_at=now,
    )
    db.add(consent)
    return consent


def _withdraw(db: Session, patient_id: int, kind: ConsentKind, now: datetime) -> None:
    for consent in db.scalars(
        select(Consent).where(Consent.patient_id == patient_id, Consent.kind == kind, Consent.withdrawn_at.is_(None))
    ):
        consent.withdrawn_at = now


def set_photos(db: Session, caregiver: User, patient: User, enabled: bool, now: datetime) -> int:
    """Opt in or withdraw. Withdrawing deletes every family photo and the elder's photo; returns how many files."""
    removed = 0
    if enabled and not patient.photos_enabled:
        record(db, caregiver, ConsentKind.photos, now, patient)
        patient.photos_enabled = True
    elif not enabled and patient.photos_enabled:
        store = storage.get()
        for member in family.members_for(db, patient.id):
            for name in member.photo_paths:
                store.delete(db, family.photo_key(patient.id, name))
                removed += 1
            member.photo_paths = []
        if patient.photo_key:
            store.delete(db, patient.photo_key)
            patient.photo_key = None
            removed += 1
        removed += memories.withdraw_photos(db, patient.id)
        patient.photos_enabled = False
        _withdraw(db, patient.id, ConsentKind.photos, now)
    db.commit()
    return removed


def set_voice(db: Session, caregiver: User, patient: User, enabled: bool, now: datetime) -> int:
    """Opt in or withdraw. Withdrawing deletes every recording; returns how many."""
    removed = 0
    if enabled and not patient.voice_task_enabled:
        record(db, caregiver, ConsentKind.voice, now, patient)
        speech.set_enabled(db, patient, True, now)
    elif not enabled and patient.voice_task_enabled:
        store = storage.get()
        samples = speech.samples_for(db, patient.id)
        for sample in samples:
            store.delete(db, speech.audio_key(patient.id, sample.audio_path))
        removed = len(samples) + feedback.delete_voice_notes(db, patient.id) + memories.withdraw_voice(db, patient.id, now)
        db.execute(delete(SpeechSample).where(SpeechSample.patient_id == patient.id))
        _withdraw(db, patient.id, ConsentKind.voice, now)
        speech.set_enabled(db, patient, False, now)
    db.commit()
    return removed


def for_user(db: Session, user: User) -> list[Consent]:
    """Every consent this person gave (for their own records and export)."""
    return list(db.scalars(select(Consent).where(Consent.user_id == user.id).order_by(Consent.granted_at)))


def for_patient(db: Session, patient_id: int) -> list[Consent]:
    return list(db.scalars(select(Consent).where(Consent.patient_id == patient_id).order_by(Consent.granted_at)))


def has_family(db: Session, patient_id: int) -> bool:
    return db.scalar(select(FamilyMember.id).where(FamilyMember.patient_id == patient_id)) is not None
