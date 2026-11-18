"""Caregiver views (Round 2 batch 2): today at a glance, insights, weekly summary, timeline and
the doctor report. Caregivers only; each route checks the care link."""

from dataclasses import asdict
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status

from app.deps import CurrentCaregiver, DbSession, Now, ensure_patient_access
from app.models import User
from app.schemas import (
    AlertOut,
    DoseCountsOut,
    DoseWeekOut,
    GlanceOut,
    InsightOut,
    MoodCountsOut,
    MoodDayOut,
    NextActionOut,
    ReportGameOut,
    ReportOut,
    ReportPointOut,
    TimelineEventOut,
    WeeklyOut,
    WeekStatsOut,
)
from app.services import care, caregiver_views, decline

router = APIRouter(tags=["caregiver views"])

EventKind = Literal["session", "reminder", "alert", "recording", "settings", "mood"]


def _patient(db: DbSession, caregiver: User, patient_id: int) -> User:
    ensure_patient_access(db, caregiver, patient_id)
    patient = db.get(User, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


@router.get("/caregiver/glance", response_model=list[GlanceOut])
def glance_all(caregiver: CurrentCaregiver, db: DbSession, now: Now) -> list[GlanceOut]:
    """One "Today at a glance" card per linked elder."""
    out = []
    for patient in care.linked_patients(db, caregiver):
        g = caregiver_views.glance(db, patient, now)
        out.append(
            GlanceOut(
                patient_id=patient.id,
                name=patient.name,
                cognitive_status=decline.overview(db, patient.id, until=now).status,
                games_done=g.games_done,
                games_total=g.games_total,
                medicines=DoseCountsOut(**asdict(g.medicines)),
                alerts_open=g.alerts_open,
                last_active_at=g.last_active_at,
                next_action=NextActionOut(**asdict(g.next_action)),
            )
        )
    return out


@router.get("/patients/{patient_id}/insights", response_model=list[InsightOut])
def get_insights(patient_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> list[InsightOut]:
    patient = _patient(db, caregiver, patient_id)
    return [InsightOut(**asdict(i)) for i in caregiver_views.insights(db, patient, now)]


def _week(w: caregiver_views.WeekStats) -> WeekStatsOut:
    return WeekStatsOut(**{**asdict(w), "doses": DoseWeekOut(**asdict(w.doses)), "mood": MoodCountsOut(**asdict(w.mood))})


@router.get("/patients/{patient_id}/weekly", response_model=WeeklyOut)
def get_weekly(patient_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> WeeklyOut:
    """The last 7 days (including today) and the 7 days before."""
    _patient(db, caregiver, patient_id)
    this, before = caregiver_views.weekly(db, patient_id, now)
    return WeeklyOut(this_week=_week(this), last_week=_week(before))


@router.get("/patients/{patient_id}/timeline", response_model=list[TimelineEventOut])
def get_timeline(
    patient_id: int,
    caregiver: CurrentCaregiver,
    db: DbSession,
    now: Now,
    days: Annotated[int, Query(ge=1, le=365)] = 14,
    kinds: Annotated[list[EventKind] | None, Query()] = None,
) -> list[TimelineEventOut]:
    """Newest first, at most 500 events. `kinds` filters (repeat the parameter)."""
    _patient(db, caregiver, patient_id)
    events = caregiver_views.timeline(db, patient_id, now, days, kinds or caregiver_views.EVENT_KINDS)
    return [TimelineEventOut(**asdict(e)) for e in events]


@router.get("/patients/{patient_id}/report", response_model=ReportOut)
def get_report(
    patient_id: int,
    caregiver: CurrentCaregiver,
    db: DbSession,
    now: Now,
    days: Annotated[int, Query(ge=7, le=180)] = 30,
) -> ReportOut:
    """Data for the printable doctor report."""
    patient = _patient(db, caregiver, patient_id)
    r = caregiver_views.report(db, patient, now, days)
    return ReportOut(
        patient_id=patient.id,
        name=patient.name,
        start=r.start,
        end=r.end,
        days=days,
        generated_at=r.generated_at,
        cognitive_index=r.index,
        cognitive_status=r.index_status,  # type: ignore[arg-type]
        games=[
            ReportGameOut(
                game_type=g.game_type,
                sessions=g.sessions,
                first_half=g.first_half,
                second_half=g.second_half,
                z=g.z,
                status=g.status,  # type: ignore[arg-type]
                sessions_to_baseline=g.sessions_to_baseline,
                points=[ReportPointOut(day=p.day, composite=p.composite) for p in g.points],
            )
            for g in r.games
        ],
        doses=DoseWeekOut(**asdict(r.doses)),
        reminders_done=r.reminders_done,
        reminders_total=r.reminders_total,
        alerts=[AlertOut.model_validate(a) for a in r.alerts],
        recordings=r.recordings,
        days_played=r.days_played,
        mood=MoodCountsOut(**asdict(r.mood)),
        mood_days=[MoodDayOut(date=d, mood=m) for d, m in r.mood_days],  # type: ignore[arg-type]
    )
