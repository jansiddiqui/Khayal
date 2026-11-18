"""Settings changes about an elder, recorded for the caregiver timeline (Round 2 batch 2)."""

from datetime import datetime, time

from sqlalchemy.orm import Session

from app.models import PatientEvent, User
from app.services.clock import utc_now

MAX_SUMMARY = 300


def record(db: Session, patient_id: int, actor: User | None, kind: str, summary: str, at: datetime | None = None) -> None:
    """Add an event to the session; the caller commits."""
    db.add(
        PatientEvent(
            patient_id=patient_id,
            actor_id=actor.id if actor is not None else None,
            at=at or utc_now(),
            kind=kind,
            summary=summary[:MAX_SUMMARY],
        )
    )


def clock_text(t: time) -> str:
    hour = t.hour % 12 or 12
    return f"{hour}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"
