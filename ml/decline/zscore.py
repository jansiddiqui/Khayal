"""Decline tracking: composite score and rolling-baseline z-score (CLAUDE.md section 6).

Composite score, per completed session (stopped-early sessions are excluded):

    acc = (correct rounds without hint + 0.5 × correct rounds with hint) / rounds
    lvl = level_start / 10                       (About Today / Daily Orientation: lvl = 1)
    rt  = clamp(baseline median RT / session median RT, 0.5, 1.5)
          baseline median RT = median of the per-session median reaction times over the
          baseline sessions (below). Until the baseline exists, rt = 1.
          About Today: rt = 1. A session with no reaction times at all: rt = 1.
    composite = acc × lvl × rt

    Faster than usual (lower RT) gives rt > 1, slower gives rt < 1. Once the RT baseline
    exists it applies to every session of that game, so all composites are on one scale.

Decline, per patient per game, over completed sessions in time order:

    warm-up  = the first 5 completed sessions are ignored (levels are still climbing from
               the start level of 2, which would otherwise bias the baseline low).
    baseline = sessions 6-15: mean, and std = max(sample std (n − 1), 0.05, 0.15 × mean).
               The floors stop near-ceiling games (About Today) from turning one bad
               session into an extreme z.
    No z (and no alerts) for a game until it has 15 completed sessions; until then the
    dashboard shows "Learning this patient's normal (8/15 sessions)".
    rolling mean = mean composite of the last 5 sessions
    z = (rolling mean − baseline mean) / baseline std, clipped to [−4, 4]
    z < −1.5 → warning, z < −2.5 → critical.

Alerts: `candidate_alert` turns each game's z history into the severity to raise now
(the alert rule, below), and `alert_decision` throttles it: at most one decline alert per
severity per 7 days per patient. A critical alert may still be raised within 7 days of a
warning (escalation); a warning is not raised within 7 days of any decline alert.

Alert rules (`DeclineConfig.alert_rule`; the app default is "persistence", rule B, chosen
from the evaluation in ml/results/decline_eval.md; LEGACY keeps "any"):
    any          A: any game's latest z < −1.5 (critical if < −2.5); the worst game decides.
    persistence  B: the same game's z < −1.5 on its last 3 completed sessions; severity
                    from that game's latest z.
    two_games    C: at least 2 games with latest z < −1.5 at the same time; severity from
                    the worst of them.
    index        D: overall cognitive index < −1.5 (critical if < −2.5).
    persistence_or_index  E: B or D; the more severe of the two.

Overall cognitive index = mean of the latest (clipped) z across games that have a
baseline. Stable at −0.5 or above, Watch below −0.5, Declining below −1.5.

`LEGACY` keeps the first version (floor 0.02, no clipping, no warm-up, one decline alert
per 7 days) for the ablation in ml.decline.evaluate. The interface
`assess(sessions) -> DeclineResult(score, z, status, explanation)` stays the same when the
LSTM/GRU model replaces this rule.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from statistics import mean, median, stdev
from typing import Literal

RT_CLAMP = (0.5, 1.5)
HINT_CREDIT = 0.5
WARNING_Z = -1.5
CRITICAL_Z = -2.5
# Index status: Stable at or above WATCH_BELOW, Watch down to DECLINING_BELOW, Declining under it.
WATCH_BELOW = -0.5
DECLINING_BELOW = WARNING_Z
ALERT_COOLDOWN = timedelta(days=7)
# Games without difficulty levels or meaningful reaction times.
UNLEVELLED_GAMES = frozenset({"daily_orientation"})

GAME_NAMES = {
    "memory_match": "Memory Match",
    "sequence_recall": "Sequence Recall",
    "word_recall": "Word Recall",
    "daily_orientation": "About Today",
    "reaction_tap": "Reaction Tap",
}

Status = Literal["insufficient", "stable", "warning", "critical"]
AlertRule = Literal["any", "persistence", "two_games", "index", "persistence_or_index"]
IndexStatus = Literal["insufficient", "stable", "watch", "declining"]
Severity = Literal["warning", "critical"]


@dataclass(frozen=True)
class DeclineConfig:
    warmup_sessions: int = 5
    baseline_sessions: int = 10
    rolling_window: int = 5
    std_floor: float = 0.05  # absolute floor on the baseline std
    std_floor_relative: float = 0.15  # floor as a share of the baseline mean
    z_clip: float | None = 4.0
    escalation: bool = True  # critical may follow a warning within the cooldown
    alert_rule: AlertRule = "any"
    persistence_sessions: int = 3  # for the persistence rules

    @property
    def sessions_needed(self) -> int:
        return self.warmup_sessions + self.baseline_sessions


DEFAULT = DeclineConfig(alert_rule="persistence")
LEGACY = DeclineConfig(warmup_sessions=0, std_floor=0.02, std_floor_relative=0.0, z_clip=None, escalation=False)


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
    z: float | None  # clipped; once a baseline exists
    z_raw: float | None = None  # before clipping


@dataclass(frozen=True)
class DeclineResult:
    score: float | None  # rolling mean of the last composites (None before a baseline)
    z: float | None  # clipped
    status: Status
    explanation: str
    baseline_mean: float | None = None
    baseline_std: float | None = None
    sessions: int = 0
    sessions_needed: int = DEFAULT.sessions_needed
    z_raw: float | None = None
    trend: list[TrendPoint] = field(default_factory=list)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def completed_in_order(sessions: Iterable[SessionSummary]) -> list[SessionSummary]:
    return sorted((s for s in sessions if s.completed and s.rounds), key=lambda s: s.started_at)


def _baseline_window(config: DeclineConfig) -> slice:
    return slice(config.warmup_sessions, config.sessions_needed)


def baseline_reaction_ms(completed: Sequence[SessionSummary], config: DeclineConfig = DEFAULT) -> float | None:
    """Median of per-session median RTs over the baseline sessions, or None before they exist."""
    if len(completed) < config.sessions_needed:
        return None
    window = completed[_baseline_window(config)]
    medians = [m for s in window if (m := s.median_reaction_ms) is not None]
    return float(median(medians)) if medians else None


def composite(session: SessionSummary, baseline_rt_ms: float | None) -> float:
    unlevelled = session.game_type in UNLEVELLED_GAMES
    lvl = 1.0 if unlevelled else session.level_start / 10
    rt = 1.0
    session_rt = session.median_reaction_ms
    if not unlevelled and baseline_rt_ms is not None and session_rt:
        rt = _clamp(baseline_rt_ms / session_rt, *RT_CLAMP)
    return session.accuracy * lvl * rt


def baseline_stats(scores: Sequence[float], config: DeclineConfig = DEFAULT) -> tuple[float, float]:
    """(mean, floored std) of the baseline window."""
    window = list(scores[_baseline_window(config)])
    m = mean(window)
    return m, max(stdev(window), config.std_floor, config.std_floor_relative * abs(m))


def clip_z(z: float, config: DeclineConfig = DEFAULT) -> float:
    return z if config.z_clip is None else _clamp(z, -config.z_clip, config.z_clip)


def trend(sessions: Iterable[SessionSummary], config: DeclineConfig = DEFAULT) -> list[TrendPoint]:
    """Composite, rolling mean and z for every completed session of one game, in time order.

    Each point only depends on sessions up to it (once the baseline is fixed), so replaying
    history gives the same z values.
    """
    done = completed_in_order(sessions)
    base_rt = baseline_reaction_ms(done, config)
    scores = [composite(s, base_rt) for s in done]
    if len(scores) < config.sessions_needed:
        return [TrendPoint(s, c, None, None) for s, c in zip(done, scores)]
    base_mean, base_std = baseline_stats(scores, config)
    points: list[TrendPoint] = []
    for i, (s, c) in enumerate(zip(done, scores)):
        if i < config.sessions_needed - 1:
            points.append(TrendPoint(s, c, None, None))
            continue
        rolling = mean(scores[max(0, i + 1 - config.rolling_window) : i + 1])
        raw = (rolling - base_mean) / base_std
        points.append(TrendPoint(s, c, rolling, clip_z(raw, config), raw))
    return points


def status_for(z: float | None) -> Status:
    if z is None:
        return "insufficient"
    if z < CRITICAL_Z:
        return "critical"
    if z < WARNING_Z:
        return "warning"
    return "stable"


def format_z(z: float, config: DeclineConfig = DEFAULT) -> str:
    text = f"{z:.1f}".replace("-", "−")
    if config.z_clip is not None and abs(z) >= config.z_clip:
        return ("≤ " if z < 0 else "≥ ") + text
    return "= " + text


def learning_text(sessions: int, needed: int) -> str:
    return f"Learning this patient's normal ({sessions}/{needed} sessions)"


def assess(sessions: list[SessionSummary], config: DeclineConfig = DEFAULT) -> DeclineResult:
    """Decline status of one game for one patient, from all its sessions."""
    points = trend(sessions, config)
    game = sessions[0].game_type if sessions else ""
    name = GAME_NAMES.get(game, game.replace("_", " ").title())
    needed = config.sessions_needed
    if len(points) < needed:
        return DeclineResult(
            score=None,
            z=None,
            status="insufficient",
            explanation=learning_text(len(points), needed),
            sessions=len(points),
            sessions_needed=needed,
            trend=points,
        )
    base_mean, base_std = baseline_stats([p.composite for p in points], config)
    latest = points[-1]
    assert latest.z is not None and latest.rolling_mean is not None
    status = status_for(latest.z)
    window = config.rolling_window
    if status in ("warning", "critical"):
        explanation = (
            f"{name} average dropped from {base_mean:.2f} to {latest.rolling_mean:.2f} "
            f"over the last {window} sessions (z {format_z(latest.z, config)})."
        )
    else:
        explanation = (
            f"{name} average is {latest.rolling_mean:.2f} over the last {window} sessions, "
            f"against a baseline of {base_mean:.2f} (z {format_z(latest.z, config)})."
        )
    return DeclineResult(
        score=latest.rolling_mean,
        z=latest.z,
        status=status,
        explanation=explanation,
        baseline_mean=base_mean,
        baseline_std=base_std,
        sessions=len(points),
        sessions_needed=needed,
        z_raw=latest.z_raw,
        trend=points,
    )


def overall_index(latest_z: Iterable[float | None]) -> float | None:
    """Mean of the latest (clipped) z across games that have a baseline; None if none do."""
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


def _severity(z: float) -> Severity | None:
    if z < CRITICAL_Z:
        return "critical"
    if z < WARNING_Z:
        return "warning"
    return None


def _worse(a: Severity | None, b: Severity | None) -> Severity | None:
    if a == "critical" or b == "critical":
        return "critical"
    return a or b


def candidate_alert(z_history: Mapping[str, Sequence[float]], config: DeclineConfig = DEFAULT) -> Severity | None:
    """Severity the alert rule asks for now, before throttling (see the module docstring).

    `z_history`: per game, the (clipped) z of each completed session that has one, in time
    order, up to now.
    """
    latest = {g: zs[-1] for g, zs in z_history.items() if zs}
    rule = config.alert_rule

    def any_game() -> Severity | None:
        worst: Severity | None = None
        for z in latest.values():
            worst = _worse(worst, _severity(z))
        return worst

    def persistence() -> Severity | None:
        n = config.persistence_sessions
        worst: Severity | None = None
        for zs in z_history.values():
            if len(zs) >= n and all(z < WARNING_Z for z in zs[-n:]):
                worst = _worse(worst, _severity(zs[-1]))
        return worst

    def two_games() -> Severity | None:
        flagged = [sev for z in latest.values() if (sev := _severity(z)) is not None]
        if len(flagged) < 2:
            return None
        return "critical" if "critical" in flagged else "warning"

    def index() -> Severity | None:
        value = overall_index(latest.values())
        return None if value is None else _severity(value)

    if rule == "any":
        return any_game()
    if rule == "persistence":
        return persistence()
    if rule == "two_games":
        return two_games()
    if rule == "index":
        return index()
    return _worse(persistence(), index())


def alert_decision(
    statuses: Iterable[Status],
    recent_alerts: Iterable[tuple[datetime, Severity]],
    now: datetime,
    config: DeclineConfig = DEFAULT,
) -> Severity | None:
    """Severity of the decline alert to raise now, or None.

    `statuses`: current status of each game. `recent_alerts`: earlier decline alerts for
    this patient as (created_at, severity). The worst game decides the severity. Each
    severity is raised at most once per ALERT_COOLDOWN; with `escalation` a critical may
    follow a warning inside the cooldown, but a warning never follows any decline alert
    inside it. Without `escalation` (LEGACY) any decline alert blocks the next one.
    """
    statuses = list(statuses)
    worst: Severity | None = (
        "critical" if "critical" in statuses else "warning" if "warning" in statuses else None
    )
    if worst is None:
        return None
    window = [sev for when, sev in recent_alerts if now - ALERT_COOLDOWN < when <= now]
    if not config.escalation or worst == "warning":
        return None if window else worst
    return None if "critical" in window else "critical"
