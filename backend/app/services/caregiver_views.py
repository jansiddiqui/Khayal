"""Caregiver views (Round 2 batch 2): today at a glance, plain-language insights, the weekly
summary, the per-elder timeline and the doctor report. Read-only; numbers come from the same
services as the rest of the app (decline, reminders, today's games)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Alert,
    Consent,
    DeviceSession,
    GameSession,
    GameType,
    Mood,
    MoodCheckin,
    PatientEvent,
    Reminder,
    ReminderLog,
    ReminderStatus,
    ReminderType,
    Severity,
    SpeechSample,
    User,
)
from app.services import core_games, decline, devices, messages, mood, reminders, today_games
from app.services.clock import as_utc, local, local_day_start
from app.services.game_names import GAME_NAMES
from app.services.messages import Msg, msg, render_en

Tone = Literal["good", "neutral", "attention"]
ActionKind = Literal["check_dose", "missed_dose", "alerts", "pair", "add_reminders", "inactive", "all_good"]
EventKind = Literal["session", "reminder", "alert", "recording", "settings", "mood"]
EVENT_KINDS: tuple[EventKind, ...] = ("session", "reminder", "alert", "recording", "settings", "mood")

INACTIVE_DAYS = 3
TIMELINE_LIMIT = 500


def first_name(patient: User) -> str:
    return patient.name.split()[0] if patient.name.strip() else patient.name


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
    # The same text as message keys with values, for caregiver screens in Hindi (batch 5b).
    text_i18n: list[Msg] = field(default_factory=list)


def _action(kind: ActionKind, m: Msg) -> NextAction:
    return NextAction(kind, render_en([m]), [m])


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
        return _action(
            "check_dose", msg("next.check_dose", time=t.reminder.time_of_day.strftime("%H:%M"), title=t.reminder.title, name=name)
        )
    missed = [t for t in todays if t.status == "missed" and t.reminder.type == ReminderType.medicine]
    if missed:
        n = len(missed)
        return _action("missed_dose", msg("next.missed_dose", n=n, name=name))
    urgent = [a for a in open_alerts if a.severity != Severity.info]
    if open_alerts:
        n = len(urgent) or len(open_alerts)
        return _action("alerts", msg("next.alerts", n=n))
    if not any(d.revoked_at is None for d in devices.for_patient(db, patient.id)):
        return _action("pair", msg("next.pair", name=name))
    if not db.scalar(select(Reminder.id).where(Reminder.patient_id == patient.id, Reminder.active.is_(True)).limit(1)):
        return _action("add_reminders", msg("next.add_reminders", name=name))
    last = _last_session_at(db, patient.id)
    if last is not None and now - last >= timedelta(days=INACTIVE_DAYS):
        return _action("inactive", msg("next.inactive", name=name, day=local(last).date().isoformat()))
    return _action("all_good", msg("next.all_good"))


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
@dataclass(frozen=True)
class Insight:
    key: str
    tone: Tone
    text: str
    detail: str
    text_i18n: list[Msg] = field(default_factory=list)
    detail_i18n: list[Msg] = field(default_factory=list)


def _insight(key: str, tone: Tone, text: Sequence[Msg], detail: Sequence[Msg]) -> Insight:
    return Insight(key, tone, render_en(text), render_en(detail), list(text), list(detail))


def _items(msgs: list[Msg], last: str) -> list[Msg]:
    """Items of a list sentence: ";" after each, `last` after the final one."""
    return [Msg(m.key, {**m.params, "sep": ";" if i < len(msgs) - 1 else last}) for i, m in enumerate(msgs)]


def _group_of(game: GameType) -> str:
    if game == GameType.daily_orientation:
        return "orientation"
    return "memory" if game in MEMORY_GAMES else "thinking"


def _z_text(z: float) -> str:
    return f"{z:+.1f}".replace("-", "−")


def game_insights(overview: decline.Overview, patient: User) -> list[Insight]:
    out: list[Insight] = []
    learning: list[Msg] = []
    groups: dict[str, list[tuple[GameType, float, float | None]]] = {}
    for game, result in overview.games.items():
        if game not in overview.tracked or result.sessions == 0:
            continue
        if result.z is None:
            learning.append(
                msg("insight.learning_item", game=game.value, sessions=result.sessions, needed=result.sessions_needed)
            )
            continue
        groups.setdefault(_group_of(game), []).append((game, result.z, result.score))
    for group in ("memory", "thinking", "orientation"):
        members = groups.get(group)
        if not members:
            continue
        items = [
            msg("insight.z_item_score", game=g.value, z=_z_text(z), score=f"{score:.2f}")
            if score is not None
            else msg("insight.z_item", game=g.value, z=_z_text(z))
            for g, z, score in sorted(members, key=lambda m: m[1])
        ]
        detail = [*_items(items, "."), msg("insight.z_note")]
        worst_game, worst_z, _ = min(members, key=lambda m: m[1])
        if worst_z >= -0.5:
            out.append(_insight(f"games_{group}", "good", [msg(f"insight.steady.{group}")], detail))
            continue
        lower = "lower" if worst_z < -1.5 else "little_lower"
        if len([m for m in members if m[1] < -0.5]) == 1:
            title = msg(f"insight.game_{lower}", game=worst_game.value)
        else:
            title = msg(f"insight.{lower}.{group}")
        out.append(_insight(f"games_{group}", "attention", [title], detail))
    if learning:
        n = len(learning)
        out.append(
            _insight(
                "games_learning",
                "neutral",
                [msg("insight.learning", name=first_name(patient), n=n)],
                [msg("insight.learning_intro"), *_items(learning, ".")],
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
    detail = [
        msg("insight.doses_detail_late", taken=w.taken, late=w.taken_late, missed=w.missed, unsure=w.unsure)
        if w.taken_late
        else msg("insight.doses_detail", taken=w.taken, missed=w.missed, unsure=w.unsure)
    ]
    if w.unsure:
        return _insight("doses", "attention", [msg("insight.doses_unsure", n=w.unsure)], detail)
    if w.missed:
        return _insight("doses", "attention", [msg("insight.doses_missed", n=w.missed)], detail)
    return _insight("doses", "good", [msg("insight.doses_taken", n=w.taken)], detail)


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
    text = msg("insight.played", n=n) if n else msg("insight.not_played", name=first_name(patient))
    days = [d.isoformat() for d in sorted(played)]
    detail = msg("insight.played_days", days=days) if days else msg("insight.played_none")
    return _insight("activity", tone, [text], [detail])


CORE_IDLE_DAYS = 3


def core_idle_insight(db: Session, patient: User, now: datetime) -> Insight | None:
    """Core games not played for 3 days or more, while others were (pin-fairness). Pins are the usual
    cause: the 2 core games not pinned never come up in Today's games, so their tracking pauses.
    Nothing when no core game was played lately (the activity insight already says so)."""
    today = local(now).date()
    core = list(core_games.core_games(patient))
    rows = db.execute(
        select(GameSession.game_type, func.max(GameSession.started_at))
        .where(GameSession.patient_id == patient.id, GameSession.game_type.in_(core), GameSession.started_at <= now)
        .group_by(GameSession.game_type)
    ).all()
    last = {GameType(g): local(as_utc(at)).date() for g, at in rows}
    recent = [g for g in core if g in last and (today - last[g]).days < CORE_IDLE_DAYS]
    idle = [g for g in core if g not in last or (today - last[g]).days >= CORE_IDLE_DAYS]
    if not idle or not recent:
        return None
    idle.sort(key=lambda g: last.get(g, date.min))
    items = [
        msg("insight.core_idle_item", game=g.value, date=last[g].isoformat()) if g in last else msg("insight.core_idle_never", game=g.value)
        for g in idle
    ]
    detail = _items(items, ".")
    pins = today_games.pinned_games(patient)
    if pins and any(g not in pins for g in idle):
        detail.append(msg("insight.core_idle_pinned", game=pins[0].value, game2=pins[1].value))
    return _insight("core_idle", "attention", [msg("insight.core_idle", games=[g.value for g in idle])], detail)


def insights(db: Session, patient: User, now: datetime) -> list[Insight]:
    overview = decline.overview(db, patient.id, until=now)
    out = [activity_insight(db, patient, now)]
    dose = dose_insight(db, patient.id, local(now).date())
    if dose is not None:
        out.append(dose)
    idle = core_idle_insight(db, patient, now)
    if idle is not None:
        out.append(idle)
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
    mood: mood.MoodCounts


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
        mood=mood.counts(mood.entries(db, patient_id, start, end)),
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
    title_i18n: list[Msg] | None = None
    detail_i18n: list[Msg] | None = None


def _event(
    at: datetime,
    kind: EventKind,
    title: Msg,
    detail: Msg | None = None,
    tone: Tone = "neutral",
    game_type: GameType | None = None,
    detail_text: str = "",
) -> TimelineEvent:
    """A timeline line made from messages; `detail_text` is a detail with no message (a device name)."""
    return TimelineEvent(
        at,
        kind,
        render_en([title]),
        render_en([detail]) if detail else detail_text,
        tone,
        game_type,
        [title],
        [detail] if detail else None,
    )


def _session_event(s: GameSession) -> TimelineEvent:
    game = s.game_type.value
    at = as_utc(s.started_at)
    if not s.completed:
        detail = msg("tl.stopped_detail", right=s.rounds_correct, played=s.rounds_played)
        return _event(at, "session", msg("tl.stopped", game=game), detail, "neutral", s.game_type)
    level = (
        msg("tl.level", level=s.level_start)
        if s.level_start == s.level_end
        else msg("tl.level_change", level=s.level_start, level_end=s.level_end)
    )
    title = msg("tl.session", game=game, right=s.rounds_correct, played=s.rounds_played)
    return _event(at, "session", title, level, "neutral", s.game_type)


def _reminder_event(log: ReminderLog) -> TimelineEvent:
    r = log.reminder
    when = r.time_of_day.strftime("%H:%M")
    # When it was marked; a log written on another day (a backfill, the missed-sweep after midnight)
    # sits at the reminder's own time on its day instead.
    at = as_utc(log.logged_at)
    if local(at).date() != log.date:
        at = reminders.occurrence(r, log.date)
    if log.status == ReminderStatus.done:
        how = "late" if log.late else "done"
        who = "_family" if log.marked_by is not None and log.marked_by.value == "caregiver" else ""
        return _event(at, "reminder", msg(f"tl.reminder_{how}{who}", title=r.title, time=when), tone="good")
    if log.status == ReminderStatus.unsure:
        title = msg("tl.reminder_unsure", title=r.title, time=when)
        return _event(at, "reminder", title, msg("tl.reminder_unsure_detail"), "attention")
    return _event(at, "reminder", msg("tl.reminder_missed", title=r.title, time=when), tone="attention")


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
            title = msg("tl.alert", severity=a.severity.value)
            out.append(
                TimelineEvent(
                    as_utc(a.created_at), "alert", render_en([title]), a.message, SEVERITY_TONE[a.severity], None,
                    [title], messages.parse_alert(a.message),
                )
            )
    if "recording" in wanted:
        for r in db.scalars(
            select(SpeechSample).where(SpeechSample.patient_id == patient_id, SpeechSample.recorded_at >= since)
        ):
            minutes, seconds = divmod(round(r.duration_ms / 1000), 60)
            detail = msg("tl.recording_detail", length=f"{minutes}:{seconds:02d}")
            out.append(_event(as_utc(r.recorded_at), "recording", msg("tl.recording"), detail, "good"))
    if "settings" in wanted:
        for e in db.scalars(select(PatientEvent).where(PatientEvent.patient_id == patient_id, PatientEvent.at >= since)):
            out.append(TimelineEvent(as_utc(e.at), "settings", e.summary, title_i18n=messages.parse_event(e.summary)))
        for c in db.scalars(select(Consent).where(Consent.patient_id == patient_id)):
            kind = c.kind.value
            if as_utc(c.granted_at) >= since:
                out.append(_event(as_utc(c.granted_at), "settings", msg("tl.consent_given", consent=kind)))
            if c.withdrawn_at is not None and as_utc(c.withdrawn_at) >= since:
                out.append(_event(as_utc(c.withdrawn_at), "settings", msg("tl.consent_withdrawn", consent=kind)))
        for d in db.scalars(select(DeviceSession).where(DeviceSession.patient_id == patient_id)):
            if as_utc(d.created_at) >= since:
                out.append(_event(as_utc(d.created_at), "settings", msg("tl.device_paired"), detail_text=_label(d)))
            if d.revoked_at is not None and as_utc(d.revoked_at) >= since:
                out.append(_event(as_utc(d.revoked_at), "settings", msg("tl.device_signed_out"), detail_text=_label(d)))
    if "mood" in wanted:
        for m in db.scalars(select(MoodCheckin).where(MoodCheckin.patient_id == patient_id, MoodCheckin.answered_at >= since)):
            if m.mood is None:
                out.append(_event(as_utc(m.answered_at), "mood", msg("tl.mood_skipped")))
            else:
                tone: Tone = "good" if m.mood == Mood.good else "neutral"
                out.append(_event(as_utc(m.answered_at), "mood", msg("tl.mood", mood=m.mood.value), tone=tone))
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
    mood: mood.MoodCounts
    mood_days: list[tuple[date, str | None]]


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
        mood=stats.mood,
        mood_days=[(m.date, m.mood.value if m.mood else None) for m in mood.entries(db, patient.id, start, end)],
    )
