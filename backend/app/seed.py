"""Seed demo accounts: 1 caregiver linked to 3 patients.

Run from backend/ with the venv active:  python -m app.seed
Safe to run repeatedly; existing accounts are reused.
"""

from sqlalchemy.orm import Session

from app.db import SessionLocal, init_db
from app.models import Role, User
from app.services import auth, care

DEMO_PASSWORD = "khayal-demo"

CAREGIVER = ("Priya Sharma", "caregiver@khayal.test")
PATIENTS = [
    ("Kamala Devi", "kamala@khayal.test"),
    ("Rahim Khan", "rahim@khayal.test"),
    ("Shanti Iyer", "shanti@khayal.test"),
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
