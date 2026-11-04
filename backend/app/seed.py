"""Seed demo accounts: 1 caregiver linked to 3 patients, plus demo reminders for the first patient.

Run from backend/ with the venv active:  python -m app.seed
Safe to run repeatedly; existing accounts are reused.
"""

from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal, init_db
from app.models import Reminder, ReminderType, Role, User
from app.services import auth, care

DEMO_PASSWORD = "khayal-demo"

CAREGIVER = ("Priya Sharma", "caregiver@khayal.test")
PATIENTS = [
    ("Kamala Devi", "kamala@khayal.test"),
    ("Rahim Khan", "rahim@khayal.test"),
    ("Shanti Iyer", "shanti@khayal.test"),
]

EVERY_DAY = list(range(7))
# Demo reminders for the first patient: (title, type, time, weekdays 0 = Monday).
DEMO_REMINDERS = [
    ("Blood pressure tablet", ReminderType.medicine, time(9, 0), EVERY_DAY),
    ("Lunch", ReminderType.meal, time(13, 0), EVERY_DAY),
    ("Evening walk with Priya", ReminderType.other, time(18, 0), [0, 2, 4]),
    ("Dr. Mehta, eye check-up", ReminderType.appointment, time(11, 30), [4]),
]


def _get_or_create(db: Session, name: str, email: str, role: Role) -> User:
    existing = auth.get_user_by_email(db, email)
    if existing is not None:
        return existing
    return auth.register_user(db, name=name, email=email, password=DEMO_PASSWORD, role=role)


def seed(db: Session) -> tuple[User, list[User]]:
    caregiver = _get_or_create(db, *CAREGIVER, Role.caregiver)
    patients = [_get_or_create(db, name, email, Role.patient) for name, email in PATIENTS]
    for patient in patients:
        care.link_patient(db, caregiver, patient)
    if db.scalar(select(Reminder.id).where(Reminder.patient_id == patients[0].id)) is None:
        for title, kind, at, days in DEMO_REMINDERS:
            db.add(Reminder(patient_id=patients[0].id, title=title, type=kind, time_of_day=at, days_of_week=days))
        db.commit()
    return caregiver, patients


def main() -> None:
    init_db()
    with SessionLocal() as db:
        caregiver, patients = seed(db)
    print(f"Caregiver: {caregiver.email}")
    for p in patients:
        print(f"Patient:   {p.email}")
    print(f"Password for all demo accounts: {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
