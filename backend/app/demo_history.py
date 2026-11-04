"""90 days of simulated history for the demo patients (`python -m app.seed --demo-history`).

Sessions come from ml.decline.simulator, so every round goes through the real adaptive
engine. Alerts are replayed day by day with the real decline rule, so the alert list has
realistic dates. Reminder logs for the last 14 days give the adherence tile some data.
"""

from datetime import datetime, timedelta

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    LEVELLED_GAMES,
    GameRound,
    GameSession,
    GameType,
    MarkedBy,
    PlayerLevel,
    Reminder,
    ReminderLog,
    ReminderStatus,
    User,
)
from app.services import decline, reminders
from app.services.clock import local, local_day_start, utc_now
from ml.decline.simulator import Profile, simulate_patient

DAYS = 90
# Demo patient email -> simulated profile.
DEMO_PROFILES: dict[str, Profile] = {
    "rahim@khayal.test": "healthy",
    "kamala@khayal.test": "mci",
    "shanti@khayal.test": "moderate",
}
# Chance a scheduled reminder was marked done by the patient / by a caregiver (else missed).
REMINDER_ODDS: dict[Profile, tuple[float, float]] = {
    "healthy": (0.92, 0.05),
    "mci": (0.75, 0.12),
    "moderate": (0.5, 0.2),
}
REMINDER_DAYS = 14
ALERT_CHECK_HOUR = 20  # replay the decline check each evening, local time


def has_history(db: Session, patient: User, before: datetime) -> bool:
    return db.scalar(select(GameSession.id).where(GameSession.patient_id == patient.id, GameSession.started_at < before)) is not None


def load_patient_history(db: Session, patient: User, profile: Profile, seed: int) -> int:
    """Insert DAYS days of play ending yesterday. Returns the number of sessions added."""
    today = local(utc_now()).date()
    first_day = today - timedelta(days=DAYS)
    sims = simulate_patient(patient.id, profile, DAYS, np.random.default_rng(seed), local_day_start(first_day))

    for s in sims:
        rts = [r.reaction_ms for r in s.rounds if r.reaction_ms is not None]
        db.add(
            GameSession(
                patient_id=patient.id,
                game_type=GameType(s.game_type),
                level_start=s.level_start,
                level_end=s.level_end,
                started_at=s.started_at,
                ended_at=s.started_at + timedelta(minutes=4),
                rounds_played=len(s.rounds),
                rounds_correct=sum(r.correct for r in s.rounds),
                avg_reaction_ms=sum(rts) / len(rts) if rts else None,
                hints_used=sum(r.hint_used for r in s.rounds),
                completed=s.completed,
                rounds=[
                    GameRound(level=s.level_start, correct=r.correct, reaction_ms=r.reaction_ms, hint_used=r.hint_used)
                    for r in s.rounds
                ],
            )
        )

    # Current levels = where the simulation ended.
    final = {GameType(s.game_type): s.level_end for s in sims if GameType(s.game_type) in LEVELLED_GAMES}
    for game, level in final.items():
        row = db.get(PlayerLevel, (patient.id, game))
        if row is None:
            db.add(PlayerLevel(patient_id=patient.id, game_type=game, current_level=level))
        else:
            row.current_level = level
    db.commit()

    for back in range(DAYS, 0, -1):
        day = today - timedelta(days=back)
        evening = local_day_start(day) + timedelta(hours=ALERT_CHECK_HOUR)
        decline.evaluate_and_alert(db, patient, evening)
    return len(sims)


def load_reminder_logs(db: Session, patient: User, profile: Profile, seed: int) -> int:
    """Done/missed logs for the patient's reminders over the last REMINDER_DAYS days (not today)."""
    rng = np.random.default_rng(seed + 1000)
    p_patient, p_caregiver = REMINDER_ODDS[profile]
    today = local(utc_now()).date()
    added = 0
    for reminder in db.scalars(select(Reminder).where(Reminder.patient_id == patient.id, Reminder.active.is_(True))):
        for back in range(REMINDER_DAYS, 0, -1):
            day = today - timedelta(days=back)
            if not reminders.scheduled_on(reminder, day):
                continue
            if db.scalar(select(ReminderLog.id).where(ReminderLog.reminder_id == reminder.id, ReminderLog.date == day)):
                continue
            roll = rng.random()
            if roll < p_patient:
                status, by = ReminderStatus.done, MarkedBy.patient
            elif roll < p_patient + p_caregiver:
                status, by = ReminderStatus.done, MarkedBy.caregiver
            else:
                status, by = ReminderStatus.missed, None
            db.add(ReminderLog(reminder_id=reminder.id, date=day, status=status, marked_by=by))
            added += 1
    db.commit()
    return added


def load_demo_history(db: Session, patients: list[User]) -> list[str]:
    """Load history for each demo patient that has none yet. Returns a line per patient."""
    report: list[str] = []
    today_start = local_day_start(local(utc_now()).date())
    for seed, patient in enumerate(patients):
        profile = DEMO_PROFILES.get(patient.email)
        if profile is None:
            continue
        if has_history(db, patient, today_start):
            report.append(f"{patient.email}: already has history, skipped")
            continue
        n = load_patient_history(db, patient, profile, seed)
        logs = load_reminder_logs(db, patient, profile, seed)
        report.append(f"{patient.email}: {profile}, {n} sessions, {logs} reminder logs")
    return report
