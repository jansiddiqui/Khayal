"""Synthetic patients for decline tracking (CLAUDE.md section 6).

Each simulated patient has a latent cognitive ability that stays flat (`healthy`),
declines slowly (`mci`), or declines faster with more day-to-day variance (`moderate`).
Every day they may play the app's 3 games: About Today plus the 2 levelled games played
least recently (the "Today's games" rule). Each round is generated from ability vs.
difficulty, and levels move through the real adaptive engine (`ml.adaptive.rule_based`),
so the data looks like what the app records, not made-up final scores.

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
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import numpy as np

from ml.adaptive.rule_based import BLOCK_SIZE, START_LEVEL, Round, next_level
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
LEVELLED = ("memory_match", "sequence_recall", "word_recall", "reaction_tap")
HINT_GAMES = frozenset({"memory_match", "sequence_recall", "word_recall"})
# Typical reaction time per round for a healthy older adult, by game (ms).
BASE_RT_MS = {
    "memory_match": 2600,
    "sequence_recall": 2300,
    "word_recall": 6500,
    "daily_orientation": 3800,
    "reaction_tap": 480,
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


def difficulty(game: str, level: int) -> float:
    """0..1 difficulty of a round; About Today questions are easy for a healthy adult."""
    if game == ORIENTATION:
        return 0.30
    return 0.35 + 0.055 * (level - 1)


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


def simulate_patient(
    patient_id: int,
    profile: Profile,
    days: int,
    rng: np.random.Generator,
    start: datetime,
) -> list[SimSession]:
    """`days` days of play for one patient, starting at local midnight `start` (tz-aware)."""
    params = PARAMS[profile]
    ability0 = float(rng.normal(0.80, 0.04))
    levels = {g: START_LEVEL for g in LEVELLED}
    last_played = {g: -1 for g in LEVELLED}
    out: list[SimSession] = []

    for day in range(days):
        if rng.random() > params.play_probability:
            continue
        ability = ability0 - params.decline_per_day * day + float(rng.normal(0.0, params.daily_noise))
        # Today's games: About Today + the 2 levelled games played least recently (ties random).
        tiebreak = rng.permutation(len(LEVELLED))
        flex = sorted(LEVELLED, key=lambda g: (last_played[g], tiebreak[LEVELLED.index(g)]))[:2]
        clock = start + timedelta(days=day, hours=float(rng.uniform(9, 17)))

        for game in (ORIENTATION, *flex):
            # Stopped early more often as ability falls.
            p_stop = float(np.clip(0.03 + 0.5 * max(0.0, 0.75 - ability), 0.02, 0.4))
            stopped = rng.random() < p_stop
            n_rounds = int(rng.integers(1, BLOCK_SIZE)) if stopped else BLOCK_SIZE
            level = 1 if game == ORIENTATION else levels[game]
            rounds = tuple(play_round(game, level, ability, rng) for _ in range(n_rounds))

            level_end = level
            if game != ORIENTATION and not stopped:
                level_end = next_level(level, [Round(r.correct, r.reaction_ms, r.hint_used) for r in rounds])
                levels[game] = level_end
            if game != ORIENTATION:
                last_played[game] = day

            out.append(
                SimSession(patient_id, profile, day, game, clock, level, level_end, rounds, completed=not stopped)
            )
            clock += timedelta(minutes=float(rng.uniform(4, 9)))
    return out


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
