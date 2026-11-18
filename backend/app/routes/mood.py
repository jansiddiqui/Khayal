"""Daily mood check-in (Round 2 batch 4)."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentCaregiver, CurrentPatient, DbSession, Now, ensure_patient_access
from app.models import Mood
from app.schemas import MoodDayOut, MoodIn, MoodTodayOut
from app.services import mood

router = APIRouter(tags=["mood"])


@router.get("/me/mood/today", response_model=MoodTodayOut)
def mood_today(patient: CurrentPatient, db: DbSession, now: Now) -> MoodTodayOut:
    entry = mood.today_entry(db, patient, now)
    return MoodTodayOut(asked=entry is not None, mood=entry.mood.value if entry and entry.mood else None)


@router.post("/me/mood", response_model=MoodTodayOut)
def answer_mood(body: MoodIn, patient: CurrentPatient, db: DbSession, now: Now) -> MoodTodayOut:
    """Today's answer, or `{"mood": null}` for Skip."""
    entry = mood.answer(db, patient, Mood(body.mood) if body.mood else None, now)
    return MoodTodayOut(asked=True, mood=entry.mood.value if entry.mood else None)


@router.get("/patients/{patient_id}/mood", response_model=list[MoodDayOut])
def mood_history(
    patient_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now, days: Annotated[int, Query(ge=1, le=365)] = 30
) -> list[MoodDayOut]:
    ensure_patient_access(db, caregiver, patient_id)
    return [MoodDayOut(date=e.date, mood=e.mood.value if e.mood else None) for e in mood.recent(db, patient_id, now, days)]
