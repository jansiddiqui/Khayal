"""Caregiver views (Round 2 batch 2): today at a glance, plain-language insights, the weekly
summary, the per-elder timeline and the doctor report. Read-only; numbers come from the same
services as the rest of the app (decline, reminders, today's games)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Alert,
    Consent,
    DeviceSession,
    GameSession,
    GameType,
    PatientEvent,
    Reminder,
    ReminderLog,
    ReminderStatus,
    ReminderType,
    Severity,
    SpeechSample,
    User,
)
from app.services import decline, devices, reminders, today_games
from app.services.clock import as_utc, local, local_day_start
from app.services.game_names import GAME_NAMES

Tone = Literal["good", "neutral", "attention"]
ActionKind = Literal["check_dose", "missed_dose", "alerts", "pair", "add_reminders", "inactive", "all_good"]
EventKind = Literal["session", "reminder", "alert", "recording", "settings"]
EVENT_KINDS: tuple[EventKind, ...] = ("session", "reminder", "alert", "recording", "settings")

INACTIVE_DAYS = 3
TIMELINE_LIMIT = 500


def first_name(patient: User) -> str:
    return patient.name.split()[0] if patient.name.strip() else patient.name


def _day_text(d: date) -> str:
    return d.strftime("%A")


# --- today at a glance ------------------------------------------------------------------


@dataclass(frozen=True)
class DoseCounts:
    taken: int = 0
    missed: int = 0
    unsure: int = 0
    to_come: int = 0


@dataclass(frozen=True)
class NextAction:
    kind: ActionKind
    text: str


@dataclass(frozen=True)
class Glance:
    patient: User
    games_done: int
    games_total: int
    medicines: DoseCounts
    alerts_open: int
    last_active_at: datetime | None
    next_action: NextAction


def _last_session_at(db: Session, patient_id: int) -> datetime | None:
    at = db.scalar(
        select(GameSession.started_at)
        .where(GameSession.patient_id == patient_id)
        .order_by(GameSession.started_at.desc())
        .limit(1)
    )
    return as_utc(at) if at is not None else None


def glance(db: Session, patient: User, now: datetime) -> Glance:
    today = local(now).date()
    games = today_games.todays_games(db, patient, today)
    todays = reminders.today_for(db, patient, now)
    meds = [t for t in todays if t.reminder.type == ReminderType.medicine]
    counts = DoseCounts(
        taken=sum(t.status == "done" for t in meds),
        missed=sum(t.status == "missed" for t in meds),
        unsure=sum(t.status == "unsure" for t in meds),
        to_come=sum(t.status == "pending" for t in meds),
    )
    open_alerts = list(
        db.scalars(select(Alert).where(Alert.patient_id == patient.id, Alert.acknowledged.is_(False)))
    )
    return Glance(
        patient=patient,
        games_done=sum(g.done_today for g in games),
        games_total=len(games),
        medicines=counts,
        alerts_open=len(open_alerts),
        last_active_at=devices.last_active(db, patient.id),
        next_action=next_action(db, patient, now, todays, open_alerts),
    )


def next_action(
    db: Session, patient: User, now: datetime, todays: Sequence[reminders.TodayReminder], open_alerts: Sequence[Alert]
) -> NextAction:
    """The ONE thing to do next, most urgent first: a dose they weren't sure about, a missed dose,
    new alerts, an unpaired device, no reminders yet, no play for 3 days; otherwise all good."""
    name = first_name(patient)
    unsure = [t for t in todays if t.status == "unsure" and t.reminder.type == ReminderType.medicine]
    if unsure:
        t = unsure[0]
        return NextAction("check_dose", f"Check the {reminders.clock_label(t.reminder.time_of_day)} {t.reminder.title} with {name}")
    missed = [t for t in todays if t.status == "missed" and t.reminder.type == ReminderType.medicine]
    if missed:
        n = len(missed)
        return NextAction("missed_dose", f"{n} medicine {'dose' if n == 1 else 'doses'} missed today: check with {name}")
    urgent = [a for a in open_alerts if a.severity != Severity.info]
    if open_alerts:
        n = len(urgent) or len(open_alerts)
        return NextAction("alerts", f"Look at {n} new {'alert' if n == 1 else 'alerts'}")
    if not any(d.revoked_at is None for d in devices.for_patient(db, patient.id)):
        return NextAction("pair", f"Pair {name}'s phone or tablet")
    if not db.scalar(select(Reminder.id).where(Reminder.patient_id == patient.id, Reminder.active.is_(True)).limit(1)):
        return NextAction("add_reminders", f"Add {name}'s medicines and meals as reminders")
    last = _last_session_at(db, patient.id)
    if last is not None and now - last >= timedelta(days=INACTIVE_DAYS):
        return NextAction("inactive", f"{name} hasn't played since {_day_text(local(last).date())}. A gentle word may help.")
    return NextAction("all_good", "Nothing needs you today")


# --- insights ---------------------------------------------------------------------------

MEMORY_GAMES = frozenset(
    {
        GameType.word_recall,
        GameType.word_recall_delayed,
        GameType.memory_match,
        GameType.object_location,
        GameType.spatial_span,
        GameType.sequence_recall,
    }
)
GROUP_TITLES = {"memory": "Memory games", "thinking": "Thinking and everyday games", "orientation": "About Today"}


@dataclass(frozen=True)
class Insight:
    key: str
    tone: Tone
    text: str
    detail: str


def _group_of(game: GameType) -> str:
    if game == GameType.daily_orientation:
        return "orientation"
    return "memory" if game in MEMORY_GAMES else "thinking"


def _z_text(z: float) -> str:
    return f"{z:+.1f}".replace("-", "−")


def game_insights(overview: decline.Overview, patient: User) -> list[Insight]:
    out: list[Insight] = []
    learning: list[str] = []
    groups: dict[str, list[tuple[GameType, float, float | None]]] = {}
    for game, result in overview.games.items():
        if game not in overview.tracked or result.sessions == 0:
            continue
        if result.z is None:
            learning.append(f"{GAME_NAMES[game]} {result.sessions}/{result.sessions_needed} sessions")
            continue
        groups.setdefault(_group_of(game), []).append((game, result.z, result.score))
    for group in ("memory", "thinking", "orientation"):
        members = groups.get(group)
        if not members:
            continue
        detail = "; ".join(
            f"{GAME_NAMES[g]}: z = {_z_text(z)}" + (f", recent average {score:.2f}" if score is not None else "")
            for g, z, score in sorted(members, key=lambda m: m[1])
        )
        detail += ". z compares the last 5 sessions with their own normal; below −0.5 is Watch, below −1.5 Declining."
        worst_game, worst_z, _ = min(members, key=lambda m: m[1])
        title = GROUP_TITLES[group]
        if worst_z >= -0.5:
            out.append(Insight(f"games_{group}", "good", f"{title} steady this month", detail))
            continue
        lower = "lower" if worst_z < -1.5 else "a little lower"
        subject = GAME_NAMES[worst_game] if len([m for m in members if m[1] < -0.5]) == 1 else title
        out.append(Insight(f"games_{group}", "attention", f"{subject} {lower} this month", detail))
    if learning:
        n = len(learning)
        out.append(
            Insight(
                "games_learning",
                "neutral",
                f"Still learning {first_name(patient)}'s normal for {n} {'game' if n == 1 else 'games'}",
                "Each game needs 15 finished sessions before it is compared: " + "; ".join(learning) + ".",
            )
        )
    return out


@dataclass(frozen=True)
class DoseWeek:
    taken: int
    taken_late: int
    missed: int
    unsure: int


def dose_counts(db: Session, patient_id: int, start: date, end: date, medicine_only: bool = True) -> DoseWeek:
    """Reminder logs on days start..end (inclusive)."""
    stmt = (
        select(ReminderLog)
        .join(Reminder, Reminder.id == ReminderLog.reminder_id)
        .where(Reminder.patient_id == patient_id, ReminderLog.date >= start, ReminderLog.date <= end)
    )
    if medicine_only:
        stmt = stmt.where(Reminder.type == ReminderType.medicine)
    logs = list(db.scalars(stmt))
    done = [log for log in logs if log.status == ReminderStatus.done]
    return DoseWeek(
        taken=len(done),
        taken_late=sum(log.late for log in done),
        missed=sum(log.status == ReminderStatus.missed for log in logs),
        unsure=sum(log.status == ReminderStatus.unsure for log in logs),
    )


def dose_insight(db: Session, patient_id: int, today: date) -> Insight | None:
    w = dose_counts(db, patient_id, today - timedelta(days=6), today)
    if w.taken + w.missed + w.unsure == 0:
        return None
    detail = (
        f"Last 7 days, medicine reminders only: taken {w.taken}"
        + (f" ({w.taken_late} confirmed later)" if w.taken_late else "")
        + f", missed {w.missed}, not sure {w.unsure}."
    )
    if w.unsure:
        return Insight("doses", "attention", f"{w.unsure} {'dose' if w.unsure == 1 else 'doses'} unsure this week", detail)
    if w.missed:
        return Insight("doses", "attention", f"{w.missed} {'dose' if w.missed == 1 else 'doses'} missed this week", detail)
    return Insight("doses", "good", f"All {w.taken} {'dose' if w.taken == 1 else 'doses'} taken this week", detail)


def _days_played(db: Session, patient_id: int, start: datetime, end: datetime) -> set[date]:
    times = db.scalars(
        select(GameSession.started_at).where(
            GameSession.patient_id == patient_id, GameSession.started_at >= start, GameSession.started_at < end
        )
    )
    return {local(as_utc(t)).date() for t in times}


def activity_insight(db: Session, patient: User, now: datetime) -> Insight:
    today = local(now).date()
    start = local_day_start(today - timedelta(days=6))
    played = _days_played(db, patient.id, start, now + timedelta(seconds=1))
    n = len(played)
    tone: Tone = "good" if n >= 4 else ("neutral" if n else "attention")
    text = f"Played on {n} of the last 7 days" if n else f"{first_name(patient)} didn't play this week"
    days = ", ".join(_day_text(d) for d in sorted(played)) or "none"
    return Insight("activity", tone, text, f"Days with at least one game: {days}.")


def insights(db: Session, patient: User, now: datetime) -> list[Insight]:
    overview = decline.overview(db, patient.id, until=now)
    out = [activity_insight(db, patient, now)]
    dose = dose_insight(db, patient.id, local(now).date())
    if dose is not None:
        out.append(dose)
    out += game_insights(overview, patient)
    # Things that need attention first, then good news, then the rest.
    order = {"attention": 0, "good": 1, "neutral": 2}
    return sorted(out, key=lambda i: order[i.tone])


# --- weekly summary ---------------------------------------------------------------------


@dataclass(frozen=True)
class WeekStats:
    start: date
    end: date
    days_played: int
    sessions: int
    completed: int
    accuracy: float | None  # share of rounds right in finished sessions
    doses: DoseWeek
    reminders_done: int
    reminders_total: int
    alerts: int
    recordings: int


def week_stats(db: Session, patient_id: int, start: date, end: date) -> WeekStats:
    t0, t1 = local_day_start(start), local_day_start(end + timedelta(days=1))
    sessions = list(
        db.scalars(
            select(GameSession).where(
                GameSession.patient_id == patient_id, GameSession.started_at >= t0, GameSession.started_at < t1
            )
        )
    )
    finished = [s for s in sessions if s.completed]
    rounds = sum(s.rounds_played for s in finished)
    every = dose_counts(db, patient_id, start, end, medicine_only=False)
    return WeekStats(
        start=start,
        end=end,
        days_played=len({local(as_utc(s.started_at)).date() for s in sessions}),
        sessions=len(sessions),
        completed=len(finished),
        accuracy=sum(s.rounds_correct for s in finished) / rounds if rounds else None,
        doses=dose_counts(db, patient_id, start, end),
        reminders_done=every.taken,
        reminders_total=every.taken + every.missed + every.unsure,
        alerts=len(
            list(
                db.scalars(
                    select(Alert.id).where(Alert.patient_id == patient_id, Alert.created_at >= t0, Alert.created_at < t1)
                )
            )
        ),
        recordings=len(
            list(
                db.scalars(
                    select(SpeechSample.id).where(
                        SpeechSample.patient_id == patient_id, SpeechSample.recorded_at >= t0, SpeechSample.recorded_at < t1
                    )
                )
            )
        ),
    )


def weekly(db: Session, patient_id: int, now: datetime) -> tuple[WeekStats, WeekStats]:
    """(last 7 days including today, the 7 days before)."""
    today = local(now).date()
    this = week_stats(db, patient_id, today - timedelta(days=6), today)
    before = week_stats(db, patient_id, today - timedelta(days=13), today - timedelta(days=7))
    return this, before


# --- timeline ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TimelineEvent:
    at: datetime
    kind: EventKind
    title: str
    detail: str = ""
    tone: Tone = "neutral"
    game_type: GameType | None = None


def _session_event(s: GameSession) -> TimelineEvent:
    name = GAME_NAMES[s.game_type]
    if not s.completed:
        return TimelineEvent(as_utc(s.started_at), "session", f"{name}: stopped early",
                             f"{s.rounds_correct} of {s.rounds_played} right before stopping", "neutral", s.game_type)
    level = "" if s.level_start == s.level_end else f", level {s.level_start} → {s.level_end}"
    return TimelineEvent(as_utc(s.started_at), "session", f"{name}: {s.rounds_correct} of {s.rounds_played} right",
                         f"Level {s.level_start}{level}" if level else f"Level {s.level_start}", "neutral", s.game_type)


def _reminder_event(log: ReminderLog) -> TimelineEvent:
    r = log.reminder
    when = reminders.clock_label(r.time_of_day)
    # When it was marked; a log written on another day (a backfill, the missed-sweep after midnight)
    # sits at the reminder's own time on its day instead.
    at = as_utc(log.logged_at)
    if local(at).date() != log.date:
        at = reminders.occurrence(r, log.date)
    if log.status == ReminderStatus.done:
        how = "confirmed later" if log.late else "done"
        who = " (marked by family)" if log.marked_by is not None and log.marked_by.value == "caregiver" else ""
        return TimelineEvent(at, "reminder", f"{r.title} ({when}): {how}{who}", "", "good")
    if log.status == ReminderStatus.unsure:
        return TimelineEvent(at, "reminder", f"{r.title} ({when}): not sure", "They were asked to check with family.",
                             "attention")
    return TimelineEvent(at, "reminder", f"{r.title} ({when}): missed", "", "attention")


def _label(d: DeviceSession) -> str:
    return "" if d.device_label in ("", "Device") else d.device_label


SEVERITY_TONE: dict[Severity, Tone] = {Severity.info: "neutral", Severity.warning: "attention", Severity.critical: "attention"}


def timeline(
    db: Session, patient_id: int, now: datetime, days: int = 14, kinds: Iterable[EventKind] = EVENT_KINDS
) -> list[TimelineEvent]:
    wanted = set(kinds)
    since = now - timedelta(days=days)
    out: list[TimelineEvent] = []
    if "session" in wanted:
        out += [
            _session_event(s)
            for s in db.scalars(
                select(GameSession).where(GameSession.patient_id == patient_id, GameSession.started_at >= since)
            )
        ]
    if "reminder" in wanted:
        logs = db.scalars(
            select(ReminderLog)
            .join(Reminder, Reminder.id == ReminderLog.reminder_id)
            .where(Reminder.patient_id == patient_id, ReminderLog.date >= local(since).date())
        )
        out += [e for e in (_reminder_event(log) for log in logs) if e.at >= since]
    if "alert" in wanted:
        for a in db.scalars(select(Alert).where(Alert.patient_id == patient_id, Alert.created_at >= since)):
            out.append(TimelineEvent(as_utc(a.created_at), "alert", f"Alert ({a.severity.value})", a.message,
                                     SEVERITY_TONE[a.severity]))
    if "recording" in wanted:
        for r in db.scalars(
            select(SpeechSample).where(SpeechSample.patient_id == patient_id, SpeechSample.recorded_at >= since)
        ):
            minutes, seconds = divmod(round(r.duration_ms / 1000), 60)
            out.append(TimelineEvent(as_utc(r.recorded_at), "recording", "Voice task recorded",
                                     f"Length {minutes}:{seconds:02d}", "good"))
    if "settings" in wanted:
        for e in db.scalars(select(PatientEvent).where(PatientEvent.patient_id == patient_id, PatientEvent.at >= since)):
            out.append(TimelineEvent(as_utc(e.at), "settings", e.summary))
        consent_names = {"photos": "Family photos", "voice": "Voice task", "elder_on_behalf": "Using Khayal"}
        for c in db.scalars(select(Consent).where(Consent.patient_id == patient_id)):
            label = consent_names.get(c.kind.value, c.kind.value)
            if as_utc(c.granted_at) >= since:
                out.append(TimelineEvent(as_utc(c.granted_at), "settings", f"Consent given: {label}"))
            if c.withdrawn_at is not None and as_utc(c.withdrawn_at) >= since:
                out.append(TimelineEvent(as_utc(c.withdrawn_at), "settings", f"Consent withdrawn: {label}"))
        for d in db.scalars(select(DeviceSession).where(DeviceSession.patient_id == patient_id)):
            if as_utc(d.created_at) >= since:
                out.append(TimelineEvent(as_utc(d.created_at), "settings", "Device paired", _label(d)))
            if d.revoked_at is not None and as_utc(d.revoked_at) >= since:
                out.append(TimelineEvent(as_utc(d.revoked_at), "settings", "Device signed out", _label(d)))
    out.sort(key=lambda e: e.at, reverse=True)
    return out[:TIMELINE_LIMIT]


# --- doctor report ----------------------------------------------------------------------


@dataclass(frozen=True)
class ReportPoint:
    day: date
    composite: float


@dataclass(frozen=True)
class ReportGame:
    game_type: GameType
    sessions: int  # finished sessions in the period
    first_half: float | None  # mean composite, first half of the period
    second_half: float | None
    z: float | None
    status: str  # stable / watch / declining / insufficient (the shared caregiver scale)
    sessions_to_baseline: int  # 0 once the game has a baseline
    points: list[ReportPoint] = field(default_factory=list)


@dataclass(frozen=True)
class Report:
    patient: User
    start: date
    end: date
    generated_at: datetime
    index: float | None
    index_status: str
    games: list[ReportGame]
    doses: DoseWeek
    reminders_done: int
    reminders_total: int
    alerts: list[Alert]
    recordings: int
    days_played: int


def report(db: Session, patient: User, now: datetime, days: int) -> Report:
    end = local(now).date()
    start = end - timedelta(days=days - 1)
    t0 = local_day_start(start)
    middle = t0 + (now - t0) / 2
    overview = decline.overview(db, patient.id, until=now)
    games: list[ReportGame] = []
    for game in sorted(overview.tracked, key=lambda g: (g != GameType.daily_orientation, GAME_NAMES[g])):
        result = overview.games[game]
        points = [p for p in result.trend if as_utc(p.session.started_at) >= t0]
        first = [p.composite for p in points if as_utc(p.session.started_at) < middle]
        second = [p.composite for p in points if as_utc(p.session.started_at) >= middle]
        games.append(
            ReportGame(
                game_type=game,
                sessions=len(points),
                first_half=mean(first) if first else None,
                second_half=mean(second) if second else None,
                z=result.z,
                status=decline.shared_status(result.z),
                sessions_to_baseline=max(0, result.sessions_needed - result.sessions) if result.z is None else 0,
                points=[ReportPoint(local(as_utc(p.session.started_at)).date(), p.composite) for p in points],
            )
        )
    stats = week_stats(db, patient.id, start, end)
    alerts = list(
        db.scalars(
            select(Alert)
            .where(Alert.patient_id == patient.id, Alert.created_at >= t0)
            .order_by(Alert.created_at.desc())
        )
    )
    return Report(
        patient=patient,
        start=start,
        end=end,
        generated_at=now,
        index=overview.index,
        index_status=overview.status,
        games=games,
        doses=stats.doses,
        reminders_done=stats.reminders_done,
        reminders_total=stats.reminders_total,
        alerts=alerts,
        recordings=stats.recordings,
        days_played=stats.days_played,
    )
