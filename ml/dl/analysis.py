"""Extra analyses over saved predictions: matched false-alarm thresholds, threshold sweeps,
robustness on shifted simulators, and what separates the profiles early on.

- Matched threshold: for each model and seed, the lowest flag threshold whose false-alarm
  rate on the VALIDATION patients is at most rule B's false-alarm rate on the same
  validation patients. Test results are then reported at that threshold.
- Sweep: the false-alarm rate and median detection delay on test patients for many
  thresholds (pooled over seeds), to draw each model's trade-off curve.
"""

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from ml.decline.simulator import PARAMS, PROFILES, Profile
from ml.dl import data as D
from ml.dl.metrics import Scores, alarm_days, score
from ml.dl.run import MODELS, EvalSet, SeedResult

# Flag thresholds to sweep: fine steps, plus values close to 1 (models can be very confident).
THRESHOLDS = np.unique(np.concatenate([np.linspace(0.02, 0.98, 49), 1 - np.logspace(-1.3, -4, 28)]))


def _false_alarm(es: EvalSet, method: str, threshold: float) -> float:
    healthy = np.array([p == "healthy" for p in es.profiles])
    return float((alarm_days(es.p_decline[method][healthy], threshold) >= 0).mean())


def rule_b_false_alarm(es: EvalSet) -> float:
    return score(es.rule["B"]).false_alarm_rate


def matched_threshold(r: SeedResult, method: str) -> float:
    """Lowest threshold whose validation false-alarm rate is ≤ rule B's on the same validation patients."""
    target = rule_b_false_alarm(r.val)
    for t in THRESHOLDS:
        if _false_alarm(r.val, method, float(t)) <= target + 1e-9:
            return float(t)
    return float(THRESHOLDS[-1])


def matched_scores(r: SeedResult, es: EvalSet, method: str) -> Scores:
    return score(es.outcomes(method, threshold=matched_threshold(r, method)))


@dataclass(frozen=True)
class SweepPoint:
    threshold: float
    false_alarm: float
    detected: dict[Profile, float]
    delay_median: dict[Profile, float | None]


def sweep(results: Sequence[SeedResult], method: str) -> list[SweepPoint]:
    """Test false-alarm rate and median delay per threshold, pooled over seeds."""
    points = []
    for t in THRESHOLDS:
        fa_hits, fa_n = 0, 0
        delays: dict[Profile, list[int]] = {"mci": [], "moderate": []}
        counts: dict[Profile, int] = {"mci": 0, "moderate": 0}
        for r in results:
            es = r.test
            days = alarm_days(es.p_decline[method], float(t))
            for i, prof in enumerate(es.profiles):
                if prof == "healthy":
                    fa_hits += int(days[i] >= 0)
                    fa_n += 1
                else:
                    counts[prof] += 1
                    if days[i] >= es.onsets[i]:
                        delays[prof].append(int(days[i]) - es.onsets[i])
        points.append(SweepPoint(
            float(t), fa_hits / fa_n,
            {p: len(delays[p]) / counts[p] for p in delays},
            {p: float(np.median(delays[p])) if delays[p] else None for p in delays},
        ))
    return points


def rule_points(results: Sequence[SeedResult]) -> dict[str, SweepPoint]:
    """Rule variants A–E on the same test patients, pooled over seeds."""
    out = {}
    for label in results[0].test.rule:
        s = score([o for r in results for o in r.test.rule[label]])
        out[label] = SweepPoint(float("nan"), s.false_alarm_rate, s.detected, s.delay_median)
    return out


@dataclass(frozen=True)
class EarlyStats:
    """What the profiles look like in the first 15 days (days 0–14) of the default simulator."""

    ability_drop: dict[Profile, float]  # expected ability lost by day 14
    daily_noise: dict[Profile, float]
    play_probability: dict[Profile, float]
    play_days: dict[Profile, float]  # mean days played in days 0–14
    stopped_early: dict[Profile, float]  # share of sessions stopped early, days 0–14
    composite_sd: dict[Profile, float]  # mean within-patient SD of About Today composite, days 0–14


def early_stats(per_profile: int = 300, seed: int = 0, day: int = 14) -> EarlyStats:
    cohort = D.simulate_cohort(seed, per_profile, day + 1)
    play_days: dict[Profile, float] = {}
    stopped: dict[Profile, float] = {}
    sd: dict[Profile, float] = {}
    for prof in PROFILES:
        group = [p for p in cohort if p.profile == prof]
        play_days[prof] = float(np.mean([len({s.day for s in p.sessions}) for p in group]))
        sessions = [s for p in group for s in p.sessions]
        stopped[prof] = float(np.mean([not s.completed for s in sessions]))
        sds = []
        for p in group:
            values = [c for s, c in zip(p.sessions, p.composites) if s.game_type == "daily_orientation" and c is not None]
            if len(values) >= 3:
                sds.append(float(np.std(values, ddof=1)))
        sd[prof] = float(np.mean(sds))
    return EarlyStats(
        {p: PARAMS[p].decline_per_day * day for p in PROFILES},
        {p: PARAMS[p].daily_noise for p in PROFILES},
        {p: PARAMS[p].play_probability for p in PROFILES},
        play_days, stopped, sd,
    )


ROBUSTNESS_METHODS = ("rule_b", "gru", "mlp")
__all__ = ["MODELS", "ROBUSTNESS_METHODS", "THRESHOLDS", "alarm_days", "early_stats", "matched_scores",
           "matched_threshold", "rule_b_false_alarm", "rule_points", "sweep"]
