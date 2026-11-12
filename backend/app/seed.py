"""Seed demo accounts: 1 caregiver linked to 3 patients, plus demo reminders and family for the first patient.
The first patient (Kamala) also has the weekly voice task turned on.

Run from backend/ with the venv active, after `alembic upgrade head`:  python -m app.seed
Add 90 days of simulated play (healthy / mci / moderate):              python -m app.seed --demo-history
Safe to run repeatedly; existing accounts are reused.
"""

import argparse
import io
from datetime import time

from PIL import Image, ImageDraw

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal, ensure_schema_current
from app.demo_history import load_demo_history, reset_demo_history
from app.models import FamilyMember, Reminder, ReminderType, Role, User
from app.services import auth, care, family, speech
from app.services.clock import utc_now

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


def placeholder_photo(colour: tuple[int, int, int]) -> bytes:
    """A plain coloured silhouette (head and shoulders), with no name or initial, so a demo
    photo never gives away the answer (CLAUDE.md section 4). Real photos come from caregivers."""
    img = Image.new("RGB", (600, 600), colour)
    draw = ImageDraw.Draw(img)
    shape = tuple(round(c + (255 - c) * 0.55) for c in colour)  # a lighter tint of the same colour
    draw.ellipse((190, 110, 410, 330), fill=shape)  # head
    draw.ellipse((90, 360, 510, 780), fill=shape)  # shoulders, running off the bottom edge
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def refresh_demo_photos(db: Session, patient: User) -> int:
    """Replace the photos of the demo family members with the current placeholder.
    Only members whose name and relation match DEMO_FAMILY are touched. Returns how many."""
    demo = {(name, relation): colour for name, relation, _, colour in DEMO_FAMILY}
    refreshed = 0
    for member in family.members_for(db, patient.id):
        colour = demo.get((member.name, member.relation))
        if colour is None:
            continue
        for photo_id in family.photo_ids(member):
            family.remove_photo(db, member, photo_id)
        family.add_photo(db, member, placeholder_photo(colour))
        refreshed += 1
    return refreshed


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
            family.add_photo(db, member, placeholder_photo(colour))
    # Voice task consent for the demo: on for Kamala, off (the default) for the others.
    if not patients[0].voice_task_enabled:
        speech.set_enabled(db, patients[0], True, utc_now())
    return caregiver, patients


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Seed the Khayal demo accounts.")
    parser.add_argument("--demo-history", action="store_true", help="also load 90 days of simulated play")
    parser.add_argument(
        "--reset", action="store_true", help="with --demo-history: first remove the demo patients' play history"
    )
    parser.add_argument(
        "--refresh-demo-photos",
        action="store_true",
        help="replace the demo family's photos with the current placeholder silhouettes",
    )
    args = parser.parse_args(argv)
    if args.reset and not args.demo_history:
        parser.error("--reset only works with --demo-history")

    ensure_schema_current()
    with SessionLocal() as db:
        caregiver, patients = seed(db)
        removed = reset_demo_history(db, patients) if args.reset else []
        history = load_demo_history(db, patients) if args.demo_history else []
        photos = refresh_demo_photos(db, patients[0]) if args.refresh_demo_photos else None
    print(f"Caregiver: {caregiver.email}")
    for p in patients:
        print(f"Patient:   {p.email}")
    print(f"Password for all demo accounts: {DEMO_PASSWORD}")
    for line in removed:
        print(f"Reset:     {line}")
    for line in history:
        print(f"History:   {line}")
    if photos is not None:
        print(f"Photos:    replaced {photos} demo family photos with silhouettes")


if __name__ == "__main__":
    main()
