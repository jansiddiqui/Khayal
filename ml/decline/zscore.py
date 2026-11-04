"""Decline tracking: composite score and rolling-baseline z-score (CLAUDE.md section 6).

Composite score, per completed session (stopped-early sessions are excluded):

    acc = (correct rounds without hint + 0.5 × correct rounds with hint) / rounds
    lvl = level_start / 10                       (About Today / Daily Orientation: lvl = 1)
    rt  = clamp(baseline median RT / session median RT, 0.5, 1.5)
          baseline median RT = median of the per-session median reaction times over the
          patient's first 10 completed sessions of this game. Until 10 exist, rt = 1.
          About Today: rt = 1. A session with no reaction times at all: rt = 1.
    composite = acc × lvl × rt

    Faster than usual (lower RT) gives rt > 1, slower gives rt < 1. Once the RT baseline
    exists it applies to every session of that game, including the first 10, so all
    composites of a game are on the same scale.

Decline, per patient per game, over completed sessions in time order:

    baseline mean, std = mean and sample standard deviation (n − 1) of the composites of
                         the first 10 sessions. The std is floored at STD_FLOOR so a very
                         steady patient's tiny wobbles don't become large z values.
    No z (and no alerts) until 10 sessions exist.
    rolling mean = mean composite of the last 5 sessions
    z = (rolling mean − baseline mean) / baseline std
    z < −1.5 → warning, z < −2.5 → critical. (Alert throttling lives in the backend.)

Overall cognitive index = mean of the latest z across games that have a baseline.
The interface `assess(sessions) -> DeclineResult(score, z, status, explanation)` stays the
same when the LSTM/GRU model replaces this rule.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from statistics import mean, median, stdev
from typing import Literal

BASELINE_SESSIONS = 10
ROLLING_WINDOW = 5
WARNING_Z = -1.5
CRITICAL_Z = -2.5
STD_FLOOR = 0.02
RT_CLAMP = (0.5, 1.5)
HINT_CREDIT = 0.5
# Games without difficulty levels or meaningful reaction times.
UNLEVELLED_GAMES = frozenset({"daily_orientation"})
# Index status: Stable at or above WATCH_BELOW, Watch down to DECLINING_BELOW, Declining under it.
WATCH_BELOW = -0.5
DECLINING_BELOW = WARNING_Z

GAME_NAMES = {
    "memory_match": "Memory Match",
    "sequence_recall": "Sequence Recall",
    "word_recall": "Word Recall",
    "daily_orientation": "About Today",
    "reaction_tap": "Reaction Tap",
}

Status = Literal["insufficient", "stable", "warning", "critical"]
IndexStatus = Literal["insufficient", "stable", "watch", "declining"]


@dataclass(frozen=True)
class RoundSummary:
    correct: bool
    hint_used: bool = False
    reaction_ms: int | None = None


@dataclass(frozen=True)
class SessionSummary:
    game_type: str
    started_at: datetime
    level_start: int
    rounds: tuple[RoundSummary, ...]
    completed: bool = True
    session_id: int | None = None

    @property
    def accuracy(self) -> float:
        if not self.rounds:
            return 0.0
        credit = sum(1.0 if not r.hint_used else HINT_CREDIT for r in self.rounds if r.correct)
        return credit / len(self.rounds)

    @property
    def median_reaction_ms(self) -> float | None:
        times = [r.reaction_ms for r in self.rounds if r.reaction_ms is not None]
        return float(median(times)) if times else None


@dataclass(frozen=True)
class TrendPoint:
    session: SessionSummary
    composite: float
    rolling_mean: float | None  # once a baseline exists
    z: float | None  # once a baseline exists


@dataclass(frozen=True)
class DeclineResult:
    score: float | None  # rolling mean of the last 5 composites (None before a baseline)
    z: float | None
    status: Status
    explanation: str
    baseline_mean: float | None = None
    baseline_std: float | None = None
    sessions: int = 0
    trend: list[TrendPoint] = field(default_factory=list)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def completed_in_order(sessions: Iterable[SessionSummary]) -> list[SessionSummary]:
    return sorted((s for s in sessions if s.completed and s.rounds), key=lambda s: s.started_at)


def baseline_reaction_ms(completed: Sequence[SessionSummary]) -> float | None:
    """Median of per-session median RTs over the first 10 completed sessions, or None."""
    if len(completed) < BASELINE_SESSIONS:
        return None
    medians = [m for s in completed[:BASELINE_SESSIONS] if (m := s.median_reaction_ms) is not None]
    return float(median(medians)) if medians else None


def composite(session: SessionSummary, baseline_rt_ms: float | None) -> float:
    unlevelled = session.game_type in UNLEVELLED_GAMES
    lvl = 1.0 if unlevelled else session.level_start / 10
    rt = 1.0
    session_rt = session.median_reaction_ms
    if not unlevelled and baseline_rt_ms is not None and session_rt:
        rt = _clamp(baseline_rt_ms / session_rt, *RT_CLAMP)
    return session.accuracy * lvl * rt


def trend(sessions: Iterable[SessionSummary]) -> list[TrendPoint]:
    """Composite, rolling mean and z for every completed session of one game, in time order."""
    done = completed_in_order(sessions)
    base_rt = baseline_reaction_ms(done)
    scores = [composite(s, base_rt) for s in done]
    if len(scores) < BASELINE_SESSIONS:
        return [TrendPoint(s, c, None, None) for s, c in zip(done, scores)]
    base_mean = mean(scores[:BASELINE_SESSIONS])
    base_std = max(stdev(scores[:BASELINE_SESSIONS]), STD_FLOOR)
    points: list[TrendPoint] = []
    for i, (s, c) in enumerate(zip(done, scores)):
        if i < BASELINE_SESSIONS - 1:
            points.append(TrendPoint(s, c, None, None))
            continue
        rolling = mean(scores[max(0, i + 1 - ROLLING_WINDOW) : i + 1])
        points.append(TrendPoint(s, c, rolling, (rolling - base_mean) / base_std))
    return points


def status_for(z: float | None) -> Status:
    if z is None:
        return "insufficient"
    if z < CRITICAL_Z:
        return "critical"
    if z < WARNING_Z:
        return "warning"
    return "stable"


def format_z(z: float) -> str:
    return f"{z:.1f}".replace("-", "−")


def assess(sessions: list[SessionSummary]) -> DeclineResult:
    """Decline status of one game for one patient, from all its sessions."""
    points = trend(sessions)
    game = sessions[0].game_type if sessions else ""
    name = GAME_NAMES.get(game, game.replace("_", " ").title())
    if len(points) < BASELINE_SESSIONS:
        return DeclineResult(
            score=None,
            z=None,
            status="insufficient",
            explanation=f"{name}: {len(points)} of {BASELINE_SESSIONS} sessions played; no baseline yet.",
            sessions=len(points),
            trend=points,
        )
    scores = [p.composite for p in points]
    base_mean = mean(scores[:BASELINE_SESSIONS])
    base_std = max(stdev(scores[:BASELINE_SESSIONS]), STD_FLOOR)
    latest = points[-1]
    assert latest.z is not None and latest.rolling_mean is not None
    status = status_for(latest.z)
    if status in ("warning", "critical"):
        explanation = (
            f"{name} average dropped from {base_mean:.2f} to {latest.rolling_mean:.2f} "
            f"over the last {ROLLING_WINDOW} sessions (z = {format_z(latest.z)})."
        )
    else:
        explanation = (
            f"{name} average is {latest.rolling_mean:.2f} over the last {ROLLING_WINDOW} sessions, "
            f"against a baseline of {base_mean:.2f} (z = {format_z(latest.z)})."
        )
    return DeclineResult(
        score=latest.rolling_mean,
        z=latest.z,
        status=status,
        explanation=explanation,
        baseline_mean=base_mean,
        baseline_std=base_std,
        sessions=len(points),
        trend=points,
    )


def overall_index(latest_z: Iterable[float | None]) -> float | None:
    """Mean of the latest z across games that have a baseline; None if none do."""
    zs = [z for z in latest_z if z is not None]
    return mean(zs) if zs else None


def index_status(index: float | None) -> IndexStatus:
    if index is None:
        return "insufficient"
    if index < DECLINING_BELOW:
        return "declining"
    if index < WATCH_BELOW:
        return "watch"
    return "stable"
