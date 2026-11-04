"""Care links and the access rule every patient-data route must use (CLAUDE.md section 8)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CareLink, Role, User


class NotAPatientError(Exception):
    pass


def linked_patients(db: Session, caregiver: User) -> list[User]:
    stmt = (
        select(User)
        .join(CareLink, CareLink.patient_id == User.id)
        .where(CareLink.caregiver_id == caregiver.id)
        .order_by(User.name)
    )
    return list(db.scalars(stmt))


def is_linked(db: Session, caregiver_id: int, patient_id: int) -> bool:
    stmt = select(CareLink.id).where(CareLink.caregiver_id == caregiver_id, CareLink.patient_id == patient_id)
    return db.scalar(stmt) is not None


def link_patient(db: Session, caregiver: User, patient: User) -> None:
    """Idempotently link a caregiver to a patient."""
    if patient.role != Role.patient:
        raise NotAPatientError(patient.email)
    if not is_linked(db, caregiver.id, patient.id):
        db.add(CareLink(caregiver_id=caregiver.id, patient_id=patient.id))
        db.commit()


def can_access_patient(db: Session, user: User, patient_id: int) -> bool:
    """A patient sees only their own data; a caregiver sees only linked patients."""
    if user.role == Role.patient:
        return user.id == patient_id
    return is_linked(db, user.id, patient_id)
