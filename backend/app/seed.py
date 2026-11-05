"""Seed demo accounts: 1 caregiver linked to 3 patients, plus demo reminders and family for the first patient.

Run from backend/ with the venv active, after `alembic upgrade head`:  python -m app.seed
Add 90 days of simulated play (healthy / mci / moderate):              python -m app.seed --demo-history
Safe to run repeatedly; existing accounts are reused.
"""

import argparse
import io
from datetime import time

from PIL import Image, ImageDraw, ImageFont

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal, ensure_schema_current
from app.demo_history import load_demo_history, reset_demo_history
from app.models import FamilyMember, Reminder, ReminderType, Role, User
from app.services import auth, care, family

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


# Demo family for the first patient: (name, relation, note, card colour).
DEMO_FAMILY = [
    ("Rahul", "Grandson", "Lives in Pune, visits on Sundays.", (37, 99, 235)),
    ("Meena", "Daughter", "Calls every evening after dinner.", (190, 24, 93)),
    ("Anil", "Son", "Lives nearby in Andheri.", (4, 120, 87)),
]


def placeholder_photo(name: str, colour: tuple[int, int, int]) -> bytes:
    """A plain card with the person's initial. Demo data only: real photos come from caregivers."""
    img = Image.new("RGB", (600, 600), colour)
    draw = ImageDraw.Draw(img)
    draw.ellipse((150, 90, 450, 390), fill=(255, 255, 255))
    draw.text((300, 240), name[0], fill=colour, anchor="mm", font=ImageFont.load_default(size=180))
    draw.text((300, 480), name, fill=(255, 255, 255), anchor="mm", font=ImageFont.load_default(size=72))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


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
    if not family.members_for(db, patients[0].id):
        for name, relation, note, colour in DEMO_FAMILY:
            member = FamilyMember(patient_id=patients[0].id, name=name, relation=relation, note=note)
            db.add(member)
            db.commit()
            family.add_photo(db, member, placeholder_photo(name, colour))
    return caregiver, patients


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Seed the Khayal demo accounts.")
    parser.add_argument("--demo-history", action="store_true", help="also load 90 days of simulated play")
    parser.add_argument(
        "--reset", action="store_true", help="with --demo-history: first remove the demo patients' play history"
    )
    args = parser.parse_args(argv)
    if args.reset and not args.demo_history:
        parser.error("--reset only works with --demo-history")

    ensure_schema_current()
    with SessionLocal() as db:
        caregiver, patients = seed(db)
        removed = reset_demo_history(db, patients) if args.reset else []
        history = load_demo_history(db, patients) if args.demo_history else []
    print(f"Caregiver: {caregiver.email}")
    for p in patients:
        print(f"Patient:   {p.email}")
    print(f"Password for all demo accounts: {DEMO_PASSWORD}")
    for line in removed:
        print(f"Reset:     {line}")
    for line in history:
        print(f"History:   {line}")


if __name__ == "__main__":
    main()
