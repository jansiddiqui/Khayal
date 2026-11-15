"""90 days of simulated history for the demo patients (`python -m app.seed --demo-history`).

Sessions come from ml.decline.simulator, so every round goes through the real adaptive
engine. Alerts are replayed day by day with the real decline rule, so the alert list has
realistic dates. Reminder logs for the last 14 days give the adherence tile some data.

The replay runs in memory (services/decline.decide_alert, the same rule the app uses), and
the result for a (profile, seed, first day) is cached, so the public demo's "Try the demo"
can copy a 90-day history for three patients in a moment.
"""

from bisect import bisect_right
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import lru_cache

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    LEVELLED_GAMES,
    Alert,
    AlertType,
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
from ml.decline import zscore
from ml.decline.simulator import Profile, SimSession, simulate_patient

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


@dataclass(frozen=True)
class ReplayedAlert:
    created_at: datetime
    decision: decline.AlertDecision


@dataclass(frozen=True)
class History:
    sessions: tuple[SimSession, ...]
    alerts: tuple[ReplayedAlert, ...]


@lru_cache(maxsize=12)
def simulated_history(profile: Profile, seed: int, first_day: date) -> History:
    """DAYS days of simulated play from `first_day`, and the decline alerts the app's rule
    would have raised each evening. Deterministic, so it is computed once per day and profile."""
    sims = simulate_patient(0, profile, DAYS, np.random.default_rng(seed), local_day_start(first_day))
    ordered = sorted(enumerate(sims), key=lambda pair: (pair[1].started_at, pair[0]))
    by_game: dict[GameType, list[zscore.SessionSummary]] = {g: [] for g in GameType}
    for _, s in ordered:
        by_game[GameType(s.game_type)].append(s.summary())
    starts = {g: [x.started_at for x in xs] for g, xs in by_game.items()}

    alerts: list[ReplayedAlert] = []
    for offset in range(DAYS):
        evening = local_day_start(first_day + timedelta(days=offset)) + timedelta(hours=ALERT_CHECK_HOUR)
        upto = {g: xs[: bisect_right(starts[g], evening)] for g, xs in by_game.items()}
        recent = [(a.created_at, a.decision.severity) for a in alerts if a.created_at > evening - zscore.ALERT_COOLDOWN]
        decision = decline.decide_alert(decline.overview_of(upto), recent, evening)
        if decision is not None:
            alerts.append(ReplayedAlert(evening, decision))
    return History(tuple(sims), tuple(alerts))


def load_patient_history(db: Session, patient: User, profile: Profile, seed: int) -> int:
    """Insert DAYS days of play ending yesterday, with the decline alerts the rule would have
    raised along the way. Returns the number of sessions added."""
    today = local(utc_now()).date()
    history = simulated_history(profile, seed, today - timedelta(days=DAYS))
    sims = history.sessions

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
    for a in history.alerts:
        db.add(
            Alert(
                patient_id=patient.id,
                type=AlertType.decline,
                severity=a.decision.severity,
                message=a.decision.message,
                created_at=a.created_at,
            )
        )
    db.commit()
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


def reset_demo_history(db: Session, patients: list[User]) -> list[str]:
    """Remove the demo patients' play history so it can be reloaded: all game sessions (and
    their rounds), levels and decline alerts, and reminder logs dated before today. Today's
    reminder logs, reminders, family members and other alerts are kept."""
    report: list[str] = []
    today = local(utc_now()).date()
    for patient in patients:
        if patient.email not in DEMO_PROFILES:
            continue
        sessions = list(db.scalars(select(GameSession).where(GameSession.patient_id == patient.id)))
        for s in sessions:
            db.delete(s)  # rounds cascade
        db.execute(delete(PlayerLevel).where(PlayerLevel.patient_id == patient.id))
        alerts = db.execute(
            delete(Alert).where(Alert.patient_id == patient.id, Alert.type == AlertType.decline)
        ).rowcount
        reminder_ids = select(Reminder.id).where(Reminder.patient_id == patient.id)
        logs = db.execute(
            delete(ReminderLog).where(ReminderLog.reminder_id.in_(reminder_ids), ReminderLog.date < today)
        ).rowcount
        report.append(f"{patient.email}: removed {len(sessions)} sessions, {alerts} decline alerts, {logs} reminder logs")
    db.commit()
    return report


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
