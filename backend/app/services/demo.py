"""'Try the demo' for the public demo (KHAYAL_DEMO_MODE=1).

Each visitor gets a fresh caregiver account with private copies of the three demo
patients (Kamala: MCI, Rahim: healthy, Shanti: moderate), each with 90 days of simulated
play, plus Kamala's reminders, placeholder family photos and the voice task turned on. The
visitor is signed in as the caregiver and shown a pairing code for Kamala, so they can try
the patient side on a second device or a private window. Everything is deleted after
DEMO_ACCOUNT_DAYS days (services/accounts.py).

Demo accounts have no password anyone knows: they all share the hash of one random password
made at startup, so creating a demo costs one bcrypt hash per process, not four per visitor.
"""

import secrets
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache

from sqlalchemy.orm import Session

from app import seed
from app.demo_history import load_patient_history, load_reminder_logs
from app.models import FamilyMember, Reminder, Role, User
from app.services import accounts, auth, care, family, pairing, speech
from ml.decline.simulator import Profile

DEMO_EMAIL_DOMAIN = "demo.khayal.example"
# (name, profile, simulation seed), in the same order and seeds as `python -m app.seed --demo-history`.
DEMO_PATIENTS: tuple[tuple[str, Profile, int], ...] = (
    ("Kamala Devi", "mci", 0),
    ("Rahim Khan", "healthy", 1),
    ("Shanti Iyer", "moderate", 2),
)
CAREGIVER_NAME = "Demo caregiver"


class DemoModeOffError(Exception):
    pass


@dataclass(frozen=True)
class DemoStart:
    caregiver: User
    patients: list[User]
    paired_patient: User
    code: pairing.NewCode


@lru_cache(maxsize=1)
def _shared_password_hash() -> str:
    return auth.hash_password(secrets.token_urlsafe(32))


def _email(tag: str, label: str) -> str:
    return f"{label}-{tag}@{DEMO_EMAIL_DOMAIN}"


def _add_care_plan(db: Session, patient: User, now: datetime) -> None:
    """Kamala's demo reminders, family (placeholder silhouettes) and voice task, as in app.seed."""
    for title, kind, at, days in seed.DEMO_REMINDERS:
        db.add(Reminder(patient_id=patient.id, title=title, type=kind, time_of_day=at, days_of_week=days, created_at=now))
    for name, relation, note, colour in seed.DEMO_FAMILY:
        member = FamilyMember(patient_id=patient.id, name=name, relation=relation, note=note)
        db.add(member)
        db.flush()
        family.add_photo(db, member, seed.placeholder_photo(colour))
    speech.set_enabled(db, patient, True, now)


def start_demo(db: Session, now: datetime) -> DemoStart:
    expires = accounts.demo_expiry(now)
    if expires is None:
        raise DemoModeOffError()
    tag = secrets.token_hex(6)
    password_hash = _shared_password_hash()
    caregiver = auth.register_user(
        db, name=CAREGIVER_NAME, email=_email(tag, "caregiver"), password_hash=password_hash,
        role=Role.caregiver, demo_expires_at=expires, commit=False,
    )
    patients: list[User] = []
    for name, profile, sim_seed in DEMO_PATIENTS:
        patient = auth.register_user(
            db, name=name, email=_email(tag, name.split()[0].lower()), password_hash=password_hash,
            role=Role.patient, demo_expires_at=expires, commit=False,
        )
        care.link_patient(db, caregiver, patient)
        if not patients:
            _add_care_plan(db, patient, now)
        load_patient_history(db, patient, profile, sim_seed)
        load_reminder_logs(db, patient, profile, sim_seed)
        patients.append(patient)
    code = pairing.create_code(db, caregiver, patients[0], now)
    return DemoStart(caregiver=caregiver, patients=patients, paired_patient=patients[0], code=code)
