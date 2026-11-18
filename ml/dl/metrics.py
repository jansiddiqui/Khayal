"""Metrics shared by the rule and the learned models, computed on the same test patients.

- Profile: accuracy, macro F1 and per-class recall of the predicted profile on the last day.
  A method that can't decide yet (the rule's "Learning") counts as wrong.
- Early warning: a method "flags" a patient on the day its decline signal has been on for
  3 days in a row (models: P(decline) ≥ threshold at the end of each day, 0.5 unless a
  matched threshold is used; days without play keep the previous value). The rule flags on
  the day of its first decline alert. Detection delay = flag day − the day decline starts
  (day 0 in the default simulator). A declining patient flagged before their decline starts
  (only possible when a robustness shift delays the onset) is not counted as detected; that
  share is reported separately.
- False alarm rate: the share of healthy patients flagged at any time.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import mean, stdev

import numpy as np

from ml.decline.simulator import PROFILES, Profile

THRESHOLD = 0.5
CONSECUTIVE_DAYS = 3


def alarm_day(p_decline_by_day: Sequence[float], threshold: float = THRESHOLD, run: int = CONSECUTIVE_DAYS) -> int | None:
    """The day P(decline) has been ≥ threshold for `run` days in a row (the day the alarm can fire), or None."""
    streak = 0
    for day, p in enumerate(p_decline_by_day):
        streak = streak + 1 if p >= threshold else 0
        if streak >= run:
            return day
    return None


def alarm_days(p_decline: np.ndarray, threshold: float, run: int = CONSECUTIVE_DAYS) -> np.ndarray:
    """Vectorised `alarm_day` for (patients, days): flag day per patient, -1 if never."""
    on = p_decline >= threshold
    streak = on[:, run - 1 :].copy()
    for k in range(1, run):
        streak &= on[:, run - 1 - k : on.shape[1] - k]
    first = streak.argmax(axis=1)
    return np.where(streak.any(axis=1), first + run - 1, -1)


@dataclass(frozen=True)
class Outcome:
    """One test patient under one method."""

    profile: Profile
    predicted: Profile | None  # None: no decision yet (the rule's "Learning")
    alarm_day: int | None
    onset_day: int = 0  # day this patient's decline starts


@dataclass(frozen=True)
class Scores:
    accuracy: float
    macro_f1: float
    recall: dict[Profile, float]
    false_alarm_rate: float
    false_alarm_day_median: float | None  # when healthy patients get flagged
    detected: dict[Profile, float]  # share of mci / moderate patients flagged on or after their onset
    delay_median: dict[Profile, float | None]  # median (flag day − onset) over detected patients
    flagged_before_onset: float  # share of mci / moderate patients flagged before their decline began
    confusion: np.ndarray  # rows: true profile; columns: predicted profile, then "undecided"


def score(outcomes: Sequence[Outcome]) -> Scores:
    confusion = np.zeros((len(PROFILES), len(PROFILES) + 1), dtype=int)
    for o in outcomes:
        confusion[PROFILES.index(o.profile), PROFILES.index(o.predicted) if o.predicted else len(PROFILES)] += 1
    n = confusion.sum()
    accuracy = float(np.trace(confusion[:, : len(PROFILES)]) / n) if n else 0.0
    recall: dict[Profile, float] = {}
    f1s = []
    for i, profile in enumerate(PROFILES):
        tp = confusion[i, i]
        actual = confusion[i].sum()
        predicted = confusion[:, i].sum()
        r = tp / actual if actual else 0.0
        p = tp / predicted if predicted else 0.0
        recall[profile] = float(r)
        f1s.append(2 * p * r / (p + r) if p + r else 0.0)

    healthy = [o for o in outcomes if o.profile == "healthy"]
    false_alarm = sum(o.alarm_day is not None for o in healthy) / len(healthy) if healthy else 0.0
    fa_days = [o.alarm_day for o in healthy if o.alarm_day is not None]
    fa_day = float(np.median(fa_days)) if fa_days else None
    detected: dict[Profile, float] = {}
    delay: dict[Profile, float | None] = {}
    for profile in ("mci", "moderate"):
        group = [o for o in outcomes if o.profile == profile]
        delays = [o.alarm_day - o.onset_day for o in group if o.alarm_day is not None and o.alarm_day >= o.onset_day]
        detected[profile] = len(delays) / len(group) if group else 0.0
        delay[profile] = float(np.median(delays)) if delays else None
    declining = [o for o in outcomes if o.profile != "healthy"]
    early = sum(o.alarm_day is not None and o.alarm_day < o.onset_day for o in declining)
    before = early / len(declining) if declining else 0.0
    return Scores(accuracy, float(np.mean(f1s)), recall, float(false_alarm), fa_day, detected, delay, before, confusion)


def mean_std(values: Sequence[float | None]) -> tuple[float, float] | None:
    """Mean and sample std over seeds (std 0 for one seed); None if no seed has a value."""
    present = [v for v in values if v is not None]
    if not present:
        return None
    return mean(present), (stdev(present) if len(present) > 1 else 0.0)
