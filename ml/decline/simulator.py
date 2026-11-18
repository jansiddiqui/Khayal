"""Synthetic patients for decline tracking (CLAUDE.md section 6).

Each simulated patient has a latent cognitive ability that stays flat (`healthy`),
declines slowly (`mci`), or declines faster with more day-to-day variance (`moderate`).
Every day they may play the app's 3 games: About Today plus the 2 core-set games played
least recently (the "Today's games" rule; CLAUDE.md section 7, "Core set"). Each round is generated from ability vs.
difficulty, and levels move through the real adaptive engine (`ml.adaptive.rule_based`),
so the data looks like what the app records, not made-up final scores.

Learning-based difficulty (Round 2, batch 1): pass `options=SimOptions(engine=...)` to let an
`ml.adaptive.bandit` engine choose the levels instead, optionally with `frustration` (patients
stop early more often when the level is too hard for them) and a `log` of every decision with
its expected reward per action (for regret). Without options the output is unchanged.

CLI:  python -m ml.decline.simulator --patients 30 --days 90 --out data/sim.csv [--seed 42]

CSV columns (stable; also used to train the LSTM later):
patient_id, profile, day, game_type, level_start, level_end, rounds, correct, hints,
median_rt_ms, completed, composite
`composite` is empty for stopped-early sessions (they are excluded from scoring).
"""

import argparse
import csv
import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import numpy as np

from ml.adaptive.bandit import ACTIONS, STOP_PENALTY, Context, Decision, Engine, PlayedSession, build_context
from ml.adaptive.bandit import reward as bandit_reward
from ml.adaptive.bandit import success_reward
from ml.adaptive.rule_based import BLOCK_SIZE, MAX_LEVEL, MIN_LEVEL, START_LEVEL, Round, next_level
from ml.decline.zscore import RoundSummary, SessionSummary, trend

Profile = Literal["healthy", "mci", "moderate"]
PROFILES: tuple[Profile, ...] = ("healthy", "mci", "moderate")

CSV_COLUMNS = [
    "patient_id",
    "profile",
    "day",
    "game_type",
    "level_start",
    "level_end",
    "rounds",
    "correct",
    "hints",
    "median_rt_ms",
    "completed",
    "composite",
]

ORIENTATION = "daily_orientation"
# Games v2, D4: asked at the start of the next game, 3-30 minutes after Remember the Words.
DELAYED = "word_recall_delayed"
LEVELLED = ("memory_match", "sequence_recall", "word_recall", "reaction_tap", "colour_trails", "clock_setting", "money_handling", "spatial_span", "object_location")
# The core set the simulated patients play (the app's default, app/services/core_games.py).
CORE: tuple[str, ...] = ("word_recall", "object_location", "colour_trails", "money_handling")
# Games that record `errors` in the app (wrong taps / clock error bits / misplacements).
ERROR_GAMES = frozenset({"colour_trails", "clock_setting", "object_location"})
HINT_GAMES = frozenset({"memory_match", "sequence_recall", "word_recall", "spatial_span", "object_location"})
# Typical reaction time per round for a healthy older adult, by game (ms).
BASE_RT_MS = {
    "memory_match": 2600,
    "sequence_recall": 2300,
    "word_recall": 6500,
    "daily_orientation": 3800,
    "reaction_tap": 480,
    DELAYED: 7000,
    "object_location": 3000,
    "spatial_span": 2300,
    "money_handling": 8000,
    "clock_setting": 9000,
    "colour_trails": 1500,
}


@dataclass(frozen=True)
class ProfileParams:
    decline_per_day: float  # ability lost per day
    daily_noise: float  # day-to-day wobble in ability
    play_probability: float  # chance of using the app on a given day


PARAMS: dict[Profile, ProfileParams] = {
    "healthy": ProfileParams(decline_per_day=0.0, daily_noise=0.025, play_probability=0.9),
    "mci": ProfileParams(decline_per_day=0.0022, daily_noise=0.04, play_probability=0.85),
    "moderate": ProfileParams(decline_per_day=0.0050, daily_noise=0.07, play_probability=0.75),
}


@dataclass(frozen=True)
class SimSession:
    patient_id: int
    profile: Profile
    day: int
    game_type: str
    started_at: datetime
    level_start: int
    level_end: int
    rounds: tuple[RoundSummary, ...]
    completed: bool

    def summary(self, session_id: int | None = None) -> SessionSummary:
        return SessionSummary(self.game_type, self.started_at, self.level_start, self.rounds, self.completed, session_id)


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


# Games v2: each game's curve is the shared one shifted a little, so a level means a comparable
# challenge across games (docs/games/research.md section 4). Synthetic, not fitted to real data.
DIFFICULTY_OFFSET: dict[str, float] = {
    DELAYED: 0.08,  # recalling a few minutes later is harder than straight away (CERAD)
    "object_location": 0.02,
    "spatial_span": 0.02,
    "money_handling": 0.0,
    "clock_setting": 0.0,
    "colour_trails": 0.0,
}


def difficulty(game: str, level: int) -> float:
    """0..1 difficulty of a round; About Today questions are easy for a healthy adult."""
    if game == ORIENTATION:
        return 0.30
    return 0.35 + DIFFICULTY_OFFSET.get(game, 0.0) + 0.055 * (level - 1)


def red_chance(level: int) -> float:
    """Same rule as the frontend's Reaction Tap: no red below level 4, then 10% → 40%."""
    return 0.0 if level < 4 else min(0.4, 0.1 + (level - 4) * 0.05)


def play_round(game: str, level: int, ability: float, rng: np.random.Generator) -> RoundSummary:
    gap = ability - difficulty(game, level)
    p_correct = _sigmoid(9.0 * gap)
    hint = game in HINT_GAMES and rng.random() < min(0.45, 0.05 + max(0.0, -gap) * 1.6)
    if hint:
        p_correct = min(0.97, p_correct + 0.2)
    correct = bool(rng.random() < p_correct)

    slow = 1.0 + 1.3 * max(0.0, 0.8 - ability)  # slower as ability falls
    rt: int | None = int(BASE_RT_MS[game] * slow * rng.lognormal(0.0, 0.18))
    if game == "reaction_tap" and rng.random() < red_chance(level):
        rt = None  # a red circle correctly left alone has no reaction time
    return RoundSummary(correct=correct, hint_used=hint, reaction_ms=rt)


def hint_probability(game: str, level: int, ability: float) -> float:
    gap = ability - difficulty(game, level)
    return min(0.45, 0.05 + max(0.0, -gap) * 1.6) if game in HINT_GAMES else 0.0


def success_probability(game: str, level: int, ability: float) -> float:
    """Chance that one round is right, hints included (same model as `play_round`)."""
    p = _sigmoid(9.0 * (ability - difficulty(game, level)))
    h = hint_probability(game, level, ability)
    return (1 - h) * p + h * min(0.97, p + 0.2)


def stop_probability(game: str, level: int, ability: float, frustration: float = 0.0) -> float:
    """Chance of stopping a session early. `frustration` adds stops when the level is too hard:
    frustration x how far the expected success rate is below 60%."""
    p = float(np.clip(0.03 + 0.5 * max(0.0, 0.75 - ability), 0.02, 0.4))
    if frustration and game != ORIENTATION:
        p = min(0.7, p + frustration * max(0.0, 0.6 - success_probability(game, level, ability)))
    return p


def expected_reward(game: str, level: int, ability: float, frustration: float = 0.0) -> float:
    """Expected bandit reward of a session at `level` (ml.adaptive.bandit.reward): the success
    reward over Binomial(5, p) outcomes, minus the stop penalty times the stop probability."""
    p = success_probability(game, level, ability)
    full = sum(
        math.comb(BLOCK_SIZE, k) * p**k * (1 - p) ** (BLOCK_SIZE - k) * success_reward(k / BLOCK_SIZE)
        for k in range(BLOCK_SIZE + 1)
    )
    return full - STOP_PENALTY * stop_probability(game, level, ability, frustration)


@dataclass(frozen=True)
class DecisionLog:
    """One level decision of a simulated patient, with the oracle's view for regret."""

    patient_id: int
    profile: "Profile"
    day: int
    game_type: str
    level: int
    success: float
    completed: bool
    decision: Decision
    expected: dict[int, float]  # action -> expected reward of the next session (today's ability)

    @property
    def regret(self) -> float:
        return max(self.expected.values()) - self.expected[self.decision.action]


@dataclass
class SimOptions:
    """Let an adaptive engine pick the levels (Round 2, batch 1). The engine keeps learning
    across every patient simulated with the same options."""

    engine: Engine
    frustration: float = 0.0
    log: list[DecisionLog] | None = field(default=None)


def _engine_round(game: str, level: int, ability: float, r: RoundSummary) -> Round:
    """The round as the app stores it, with `errors` for the games that record them."""
    errors = None
    if game in ERROR_GAMES:
        errors = 0 if r.correct else 1 + int(round(10 * max(0.0, difficulty(game, level) - ability)))
    return Round(r.correct, r.reaction_ms, r.hint_used, errors=errors)


def words_at(level: int) -> int:
    """Remember the Words shows 3 words at level 1 up to 8 at level 10 (frontend wordCount)."""
    return 3 + (level - 1) * 5 // 9


def simulate_patient(
    patient_id: int,
    profile: Profile,
    days: int,
    rng: np.random.Generator,
    start: datetime,
    core: Sequence[str] = CORE,
    options: SimOptions | None = None,
) -> list[SimSession]:
    """`days` days of play for one patient, starting at local midnight `start` (tz-aware).
    Slots 2-3 rotate through `core` (4 levelled games). With `options`, `options.engine`
    chooses the levels (and learns from each next session's reward)."""
    params = PARAMS[profile]
    ability0 = float(rng.normal(0.80, 0.04))
    rotation = tuple(core)
    levels = {g: START_LEVEL for g in rotation}
    last_played = {g: -1 for g in rotation}
    out: list[SimSession] = []
    frustration = options.frustration if options else 0.0
    played: dict[str, list[PlayedSession]] = {g: [] for g in rotation}
    pending: dict[str, tuple[Context, int]] = {}  # game -> (context, action) awaiting its reward

    for day in range(days):
        if rng.random() > params.play_probability:
            continue
        ability = ability0 - params.decline_per_day * day + float(rng.normal(0.0, params.daily_noise))
        # Today's games: About Today + the 2 core games played least recently (ties random).
        tiebreak = rng.permutation(len(rotation))
        flex = sorted(rotation, key=lambda g: (last_played[g], tiebreak[rotation.index(g)]))[:2]
        clock = start + timedelta(days=day, hours=float(rng.uniform(9, 17)))

        todays = (ORIENTATION, *flex)
        for position, game in enumerate(todays):
            # Stopped early more often as ability falls.
            level = 1 if game == ORIENTATION else levels[game]
            p_stop = stop_probability(game, level, ability, frustration)
            stopped = rng.random() < p_stop
            n_rounds = int(rng.integers(1, BLOCK_SIZE)) if stopped else BLOCK_SIZE
            rounds = tuple(play_round(game, level, ability, rng) for _ in range(n_rounds))

            level_end = level
            if game != ORIENTATION and options is not None:
                step = _Step(patient_id, profile, day, game, level, ability, (clock - start).total_seconds() / 86400)
                level_end = _engine_step(options, played[game], pending, step, rounds, completed=not stopped)
                levels[game] = level_end
            elif game != ORIENTATION and not stopped:
                level_end = next_level(level, [Round(r.correct, r.reaction_ms, r.hint_used) for r in rounds])
                levels[game] = level_end
            if game != ORIENTATION:
                last_played[game] = day

            out.append(
                SimSession(patient_id, profile, day, game, clock, level, level_end, rounds, completed=not stopped)
            )
            clock += timedelta(minutes=float(rng.uniform(4, 9)))
            # The delayed check comes at the start of the next game, if there is one today.
            if game == "word_recall" and not stopped and position < len(todays) - 1:
                delayed = tuple(play_round(DELAYED, level, ability, rng) for _ in range(words_at(level)))
                out.append(SimSession(patient_id, profile, day, DELAYED, clock, level, level, delayed, completed=True))
                clock += timedelta(minutes=1)
    return out


@dataclass(frozen=True)
class _Step:
    patient_id: int
    profile: Profile
    day: int
    game: str
    level: int
    ability: float
    clock_days: float


def _engine_step(
    options: SimOptions,
    history: list[PlayedSession],
    pending: dict[str, tuple[Context, int]],
    step: _Step,
    rounds: tuple[RoundSummary, ...],
    *,
    completed: bool,
) -> int:
    """Reward the previous decision for this game, then let the engine choose the next level."""
    engine_rounds = tuple(_engine_round(step.game, step.level, step.ability, r) for r in rounds)
    if step.game in pending:
        ctx0, action0 = pending.pop(step.game)
        options.engine.learn(ctx0, action0, bandit_reward(engine_rounds, completed))
    history.append(PlayedSession(step.level, engine_rounds, completed, step.clock_days))
    ctx = build_context(history)
    decision = options.engine.decide(ctx)
    pending[step.game] = (ctx, decision.action)
    if options.log is not None:
        expected = {
            a: expected_reward(step.game, step.level + a, step.ability, options.frustration)
            for a in ACTIONS
            if MIN_LEVEL <= step.level + a <= MAX_LEVEL
        }
        options.log.append(
            DecisionLog(step.patient_id, step.profile, step.day, step.game, step.level, ctx.success, completed,
                        decision, expected)
        )
    return step.level + decision.action


def composites(sessions: Sequence[SimSession]) -> list[float | None]:
    """Composite per session of one patient (same order), with the real per-game formula.

    None for stopped-early sessions, which are excluded from scoring.
    """
    by_game: dict[str, list[int]] = {}
    for i, s in enumerate(sessions):
        by_game.setdefault(s.game_type, []).append(i)
    out: list[float | None] = [None] * len(sessions)
    for indexes in by_game.values():
        for point in trend(sessions[i].summary(session_id=i) for i in indexes):
            assert point.session.session_id is not None
            out[point.session.session_id] = point.composite
    return out


def simulate(n_patients: int, days: int, seed: int, start: datetime) -> list[SimSession]:
    rng = np.random.default_rng(seed)
    sessions: list[SimSession] = []
    for pid in range(1, n_patients + 1):
        profile = PROFILES[(pid - 1) % len(PROFILES)]
        sessions.extend(simulate_patient(pid, profile, days, rng, start))
    return sessions


def to_rows(sessions: list[SimSession]) -> list[dict[str, object]]:
    by_patient: dict[int, list[SimSession]] = {}
    for s in sessions:
        by_patient.setdefault(s.patient_id, []).append(s)
    rows: list[dict[str, object]] = []
    for patient_sessions in by_patient.values():
        scores = composites(patient_sessions)
        for s, score in zip(patient_sessions, scores):
            rts = [r.reaction_ms for r in s.rounds if r.reaction_ms is not None]
            rows.append(
                {
                    "patient_id": s.patient_id,
                    "profile": s.profile,
                    "day": s.day,
                    "game_type": s.game_type,
                    "level_start": s.level_start,
                    "level_end": s.level_end,
                    "rounds": len(s.rounds),
                    "correct": sum(r.correct for r in s.rounds),
                    "hints": sum(r.hint_used for r in s.rounds),
                    "median_rt_ms": round(float(np.median(rts))) if rts else "",
                    "completed": int(s.completed),
                    "composite": round(score, 4) if score is not None else "",
                }
            )
    return rows


def write_csv(rows: list[dict[str, object]], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Khayal patients.")
    parser.add_argument("--patients", type=int, default=30)
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--out", type=Path, default=Path("data/sim.csv"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = to_rows(simulate(args.patients, args.days, args.seed, start))
    write_csv(rows, args.out)
    print(f"Wrote {len(rows)} sessions for {args.patients} patients over {args.days} days to {args.out}")


if __name__ == "__main__":
    main()
