"""Daily mood check-in (Round 2 batch 4): "How are you feeling today?" once a day on Home.

Optional: Skip stores a row without a mood, so the question is not asked again that day. Mood
is shown to the family (timeline, next to the charts, doctor report) and goes into research
exports for consented families. It changes no alert rule (ml/notes/mood_covariate.md).
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Mood, MoodCheckin, User
from app.services.clock import local


def today_entry(db: Session, patient: User, now: datetime) -> MoodCheckin | None:
    return db.scalar(
        select(MoodCheckin).where(MoodCheckin.patient_id == patient.id, MoodCheckin.date == local(now).date())
    )


def answer(db: Session, patient: User, mood: Mood | None, now: datetime) -> MoodCheckin:
    """Store today's answer (None = skipped). Answering again the same day changes it."""
    entry = today_entry(db, patient, now)
    if entry is None:
        entry = MoodCheckin(patient_id=patient.id, date=local(now).date(), mood=mood, answered_at=now)
        db.add(entry)
    else:
        entry.mood, entry.answered_at = mood, now
    db.commit()
    return entry


def entries(db: Session, patient_id: int, start: date, end: date) -> list[MoodCheckin]:
    return list(
        db.scalars(
            select(MoodCheckin)
            .where(MoodCheckin.patient_id == patient_id, MoodCheckin.date >= start, MoodCheckin.date <= end)
            .order_by(MoodCheckin.date)
        )
    )


@dataclass(frozen=True)
class MoodCounts:
    good: int = 0
    okay: int = 0
    not_so_good: int = 0
    skipped: int = 0

    @property
    def answered(self) -> int:
        return self.good + self.okay + self.not_so_good


def counts(rows: list[MoodCheckin]) -> MoodCounts:
    return MoodCounts(
        good=sum(r.mood == Mood.good for r in rows),
        okay=sum(r.mood == Mood.okay for r in rows),
        not_so_good=sum(r.mood == Mood.not_so_good for r in rows),
        skipped=sum(r.mood is None for r in rows),
    )


def recent(db: Session, patient_id: int, now: datetime, days: int) -> list[MoodCheckin]:
    today = local(now).date()
    return entries(db, patient_id, today - timedelta(days=days - 1), today)
