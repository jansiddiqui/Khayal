"""Decline tracking for the dashboard and alerts. The scoring itself is ml.decline.zscore."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Alert, AlertType, GameRound, GameSession, GameType, Severity, User
from app.services import reminders
from app.services.clock import as_utc, local
from ml.decline import zscore

SIGNAL_WINDOW_DAYS = 14


def _summary(session: GameSession) -> zscore.SessionSummary:
    rounds: list[GameRound] = session.rounds
    return zscore.SessionSummary(
        game_type=session.game_type.value,
        started_at=as_utc(session.started_at),
        level_start=session.level_start,
        rounds=tuple(zscore.RoundSummary(r.correct, r.hint_used, r.reaction_ms) for r in rounds),
        completed=session.completed,
        session_id=session.id,
    )


def summaries_by_game(
    db: Session, patient_id: int, until: datetime | None = None
) -> dict[GameType, list[zscore.SessionSummary]]:
    stmt = (
        select(GameSession)
        .where(GameSession.patient_id == patient_id)
        .options(selectinload(GameSession.rounds))
        .order_by(GameSession.started_at, GameSession.id)
    )
    if until is not None:
        stmt = stmt.where(GameSession.started_at <= until)
    out: dict[GameType, list[zscore.SessionSummary]] = {g: [] for g in GameType}
    for s in db.scalars(stmt):
        out[s.game_type].append(_summary(s))
    return out


@dataclass(frozen=True)
class Overview:
    index: float | None
    status: zscore.IndexStatus
    games: dict[GameType, zscore.DeclineResult]


def overview(db: Session, patient_id: int, until: datetime | None = None) -> Overview:
    games = {g: zscore.assess(s) if s else _empty(g) for g, s in summaries_by_game(db, patient_id, until).items()}
    index = zscore.overall_index(r.z for r in games.values())
    return Overview(index=index, status=zscore.index_status(index), games=games)


def shared_status(z: float | None) -> zscore.IndexStatus:
    """One scale for a game and for the overall index: Stable / Watch / Declining."""
    return zscore.index_status(z)


def _empty(game: GameType) -> zscore.DeclineResult:
    name = zscore.GAME_NAMES.get(game.value, game.value)
    return zscore.DeclineResult(
        score=None, z=None, status="insufficient", explanation=f"{name}: not played yet.", sessions=0
    )


def index_history(result: Overview) -> list[tuple[date, float]]:
    """The overall index at the end of each day that had a scored session."""
    events = sorted(
        ((p.session.started_at, game, p.z) for game, r in result.games.items() for p in r.trend if p.z is not None),
        key=lambda e: e[0],
    )
    latest: dict[GameType, float] = {}
    by_day: dict[date, float] = {}
    for when, game, z in events:
        assert z is not None
        latest[game] = z
        index = zscore.overall_index(latest.values())
        if index is not None:
            by_day[local(when).date()] = index
    return sorted(by_day.items())


_SEVERITY = {"warning": Severity.warning, "critical": Severity.critical}


def evaluate_and_alert(db: Session, patient: User, now: datetime) -> Alert | None:
    """Raise one decline alert (worst severity, every declining game explained) when
    `zscore.alert_decision` allows it: each severity at most once per 7 days, and a
    critical alert may follow a warning inside that window."""
    result = overview(db, patient.id, until=now)
    declining = [r for r in result.games.values() if r.status in ("warning", "critical")]
    recent = db.execute(
        select(Alert.created_at, Alert.severity).where(
            Alert.patient_id == patient.id,
            Alert.type == AlertType.decline,
            Alert.created_at > now - zscore.ALERT_COOLDOWN,
        )
    ).all()
    z_history = {g.value: [p.z for p in r.trend if p.z is not None] for g, r in result.games.items()}
    candidate = zscore.candidate_alert(z_history)
    severity = zscore.alert_decision(
        [candidate] if candidate is not None else [],
        [(as_utc(created), "critical" if sev == Severity.critical else "warning") for created, sev in recent if sev != Severity.info],
        as_utc(now),
    )
    if severity is None:
        return None
    alert = Alert(
        patient_id=patient.id,
        type=AlertType.decline,
        severity=_SEVERITY[severity],
        message=" ".join(r.explanation for r in sorted(declining, key=lambda r: r.z or 0.0)),
        created_at=now,
    )
    db.add(alert)
    db.commit()
    return alert


@dataclass(frozen=True)
class Signals:
    days: int
    sessions: int
    stopped_early_rate: float | None
    hint_rate: float | None
    adherence: reminders.Adherence


def signals(db: Session, patient_id: int, now: datetime, days: int = SIGNAL_WINDOW_DAYS) -> Signals:
    """Secondary signals over the last `days` days. Shown on the dashboard; no alerts yet."""
    since = now - timedelta(days=days)
    sessions = list(
        db.scalars(
            select(GameSession)
            .where(GameSession.patient_id == patient_id, GameSession.started_at >= since, GameSession.started_at <= now)
            .options(selectinload(GameSession.rounds))
        )
    )
    rounds = [r for s in sessions for r in s.rounds]
    return Signals(
        days=days,
        sessions=len(sessions),
        stopped_early_rate=sum(not s.completed for s in sessions) / len(sessions) if sessions else None,
        hint_rate=sum(r.hint_used for r in rounds) / len(rounds) if rounds else None,
        adherence=reminders.adherence(db, patient_id, now, days),
    )
