"""Simulated cohorts, a patient-level split and model inputs for the deep-learning decline models.

No torch here: these are plain NumPy arrays, so the split and feature code is testable anywhere.

- Cohort: `per_profile` patients of each profile (healthy / mci / moderate) from
  `ml.decline.simulator`, `days` days each, with study time (`study_ms`) drawn from a
  separate generator. Seeded, so the same seed always gives the same patients.
- Split: by patient, stratified by profile, 70 / 15 / 15 (train / val / test). A patient's
  sessions never appear in two splits.
- Session features (one row per session, in time order): composite, accuracy, level, median
  reaction time, hint rate, study time, completed, rounds, day, days since the previous
  session, missing-value flags, and a one-hot game. Continuous features are standardised
  with statistics from the training patients only (reaction and study time per game).
- Summary features (for the MLP): per game, statistics of all sessions up to a given day.
- Labels: the profile (3 classes) and the early-warning flag (see `flag_target`).
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass, field, replace

import numpy as np

from ml.decline.evaluate import START
from ml.decline.simulator import PARAMS, PROFILES, Profile, ProfileParams, SimSession, composites, simulate_patient

GAMES = ("daily_orientation", "memory_match", "sequence_recall", "word_recall", "reaction_tap")
SPLITS = ("train", "val", "test")
SPLIT_FRACTIONS = (0.70, 0.15, 0.15)
# Early-warning target: a declining patient counts as "flag" once the simulated ability has
# dropped by this much since day 0 (about one day of healthy day-to-day noise is 0.025).
FLAG_ABILITY_DROP = 0.05

# Session feature layout. Continuous columns are standardised; flags and one-hots are not.
CONTINUOUS = ("composite", "accuracy", "level", "log_rt", "hint_rate", "log_study", "rounds", "day", "gap_days")
FLAGS = ("completed", "composite_missing", "rt_missing", "study_missing")
SESSION_COLUMNS = (*CONTINUOUS, *FLAGS, *(f"game_{g}" for g in GAMES))
STUDY_COLUMNS = ("log_study", "study_missing")
# Per-game standardisation for these (reaction and study times differ a lot between games).
PER_GAME = ("log_rt", "log_study")


@dataclass
class Patient:
    pid: int
    profile: Profile
    sessions: list[SimSession]
    composites: list[float | None] = field(default_factory=list)
    onset_day: int = 0  # day the decline starts (0 unless a robustness shift moves it)

    @property
    def label(self) -> int:
        return PROFILES.index(self.profile)

    @property
    def declining(self) -> bool:
        return self.profile != "healthy"


def simulate_cohort(seed: int, per_profile: int, days: int) -> list[Patient]:
    """`per_profile` patients of each profile, in profile order. Same seed and size → same patients."""
    rng = np.random.default_rng(seed)
    study_rng = np.random.default_rng([seed, 1])
    patients: list[Patient] = []
    for profile in PROFILES:
        for k in range(per_profile):
            pid = len(patients)
            sessions = simulate_patient(k, profile, days, rng, START, study_rng)
            patients.append(Patient(pid, profile, sessions, composites(sessions)))
    return patients


@dataclass(frozen=True)
class Shift:
    """A changed simulator for out-of-distribution tests: models trained on the default are tested on it."""

    name: str
    title: str
    params: dict[Profile, ProfileParams] | None = None
    onset_range: tuple[int, int] | None = None  # decline starts on a random day in this range (inclusive)
    play_every: int = 1


SHIFTS: tuple[Shift, ...] = (
    Shift("late_onset", "Decline starts later (day 30–50)", onset_range=(30, 50)),
    Shift("noise_1_5x", "1.5× day-to-day noise",
          params={p: replace(PARAMS[p], daily_noise=1.5 * PARAMS[p].daily_noise) for p in PROFILES}),
    Shift("slow_mci", "Slower MCI decline (0.5× rate)",
          params={**PARAMS, "mci": replace(PARAMS["mci"], decline_per_day=0.5 * PARAMS["mci"].decline_per_day)}),
    Shift("every_other_day", "Plays every other day at most", play_every=2),
    Shift("same_nuisance", "Same noise and play rate for every profile (only the decline differs)",
          params={p: replace(PARAMS[p], daily_noise=PARAMS["healthy"].daily_noise,
                             play_probability=PARAMS["healthy"].play_probability) for p in PROFILES}),
)


def simulate_shifted_cohort(seed: int, per_profile: int, days: int, shift: Shift) -> list[Patient]:
    """New patients (not the training cohort's) from a changed simulator, seeded per seed and shift."""
    k = [s.name for s in SHIFTS].index(shift.name)
    rng = np.random.default_rng([seed, 100, k])
    study_rng = np.random.default_rng([seed, 101, k])
    onset_rng = np.random.default_rng([seed, 102, k])
    patients: list[Patient] = []
    for profile in PROFILES:
        for i in range(per_profile):
            onset = 0
            if shift.onset_range is not None and profile != "healthy":
                onset = int(onset_rng.integers(shift.onset_range[0], shift.onset_range[1] + 1))
            params = shift.params[profile] if shift.params is not None else None
            sessions = simulate_patient(i, profile, days, rng, START, study_rng, params=params, onset_day=onset,
                                        play_every=shift.play_every)
            patients.append(Patient(len(patients), profile, sessions, composites(sessions), onset))
    return patients


def split_by_patient(patients: Sequence[Patient], seed: int) -> dict[str, list[Patient]]:
    """70 / 15 / 15 by patient, stratified by profile, shuffled with `seed`."""
    rng = np.random.default_rng([seed, 2])
    out: dict[str, list[Patient]] = {s: [] for s in SPLITS}
    for profile in PROFILES:
        group = [p for p in patients if p.profile == profile]
        order = rng.permutation(len(group))
        n_train = round(SPLIT_FRACTIONS[0] * len(group))
        n_val = round(SPLIT_FRACTIONS[1] * len(group))
        out["train"] += [group[i] for i in order[:n_train]]
        out["val"] += [group[i] for i in order[n_train : n_train + n_val]]
        out["test"] += [group[i] for i in order[n_train + n_val :]]
    return out


def flag_onset_day(profile: Profile) -> int | None:
    """First day the early-warning target is on: when the simulated ability drop reaches FLAG_ABILITY_DROP."""
    rate = PARAMS[profile].decline_per_day
    return math.ceil(FLAG_ABILITY_DROP / rate) if rate > 0 else None


def flag_target(profile: Profile, day: int) -> int:
    """1 once a declining patient's decline has become meaningful (see FLAG_ABILITY_DROP); healthy: always 0."""
    onset = flag_onset_day(profile)
    return int(onset is not None and day >= onset)


def raw_session_rows(patient: Patient, days: int) -> np.ndarray:
    """Unscaled session features (rows in time order, columns as SESSION_COLUMNS)."""
    rows = np.zeros((len(patient.sessions), len(SESSION_COLUMNS)), dtype=np.float64)
    col = {name: i for i, name in enumerate(SESSION_COLUMNS)}
    previous_day: int | None = None
    for i, (s, composite) in enumerate(zip(patient.sessions, patient.composites)):
        n = len(s.rounds)
        correct_no_hint = sum(r.correct and not r.hint_used for r in s.rounds)
        correct_hint = sum(r.correct and r.hint_used for r in s.rounds)
        rts = [r.reaction_ms for r in s.rounds if r.reaction_ms is not None]
        studies = [t for t in s.study_ms if t is not None]
        row = rows[i]
        row[col["composite"]] = composite if composite is not None else 0.0
        row[col["composite_missing"]] = composite is None
        row[col["accuracy"]] = (correct_no_hint + 0.5 * correct_hint) / n
        row[col["level"]] = s.level_start / 10
        row[col["log_rt"]] = math.log(float(np.median(rts))) if rts else 0.0
        row[col["rt_missing"]] = not rts
        row[col["hint_rate"]] = sum(r.hint_used for r in s.rounds) / n
        row[col["log_study"]] = math.log(float(np.mean(studies))) if studies else 0.0
        row[col["study_missing"]] = not studies
        row[col["completed"]] = s.completed
        row[col["rounds"]] = n
        row[col["day"]] = s.day / days
        row[col["gap_days"]] = 0.0 if previous_day is None else s.day - previous_day
        row[col[f"game_{s.game_type}"]] = 1.0
        previous_day = s.day
    return rows


@dataclass
class Scaler:
    """Standardisation fitted on training patients only. Missing values become 0 (the mean)."""

    mean: dict[str, float]
    std: dict[str, float]
    game_mean: dict[tuple[str, str], float]
    game_std: dict[tuple[str, str], float]

    @staticmethod
    def fit(train_rows: Sequence[np.ndarray]) -> "Scaler":
        rows = np.concatenate(train_rows)
        col = {name: i for i, name in enumerate(SESSION_COLUMNS)}
        missing = {"composite": "composite_missing", "log_rt": "rt_missing", "log_study": "study_missing"}
        mean: dict[str, float] = {}
        std: dict[str, float] = {}
        game_mean: dict[tuple[str, str], float] = {}
        game_std: dict[tuple[str, str], float] = {}
        for name in CONTINUOUS:
            present = rows[:, col[missing[name]]] == 0 if name in missing else np.ones(len(rows), bool)
            if name in PER_GAME:
                for g in GAMES:
                    sel = present & (rows[:, col[f"game_{g}"]] == 1)
                    values = rows[sel, col[name]]
                    game_mean[(name, g)] = float(values.mean()) if len(values) else 0.0
                    game_std[(name, g)] = float(values.std()) if len(values) > 1 and values.std() > 0 else 1.0
            values = rows[present, col[name]]
            mean[name] = float(values.mean())
            std[name] = float(values.std()) if values.std() > 0 else 1.0
        return Scaler(mean, std, game_mean, game_std)

    def transform(self, rows: np.ndarray, use_study: bool = True) -> np.ndarray:
        col = {name: i for i, name in enumerate(SESSION_COLUMNS)}
        out = rows.copy()
        missing = {"composite": "composite_missing", "log_rt": "rt_missing", "log_study": "study_missing"}
        for name in CONTINUOUS:
            c = col[name]
            if name in PER_GAME:
                for g in GAMES:
                    sel = rows[:, col[f"game_{g}"]] == 1
                    out[sel, c] = (rows[sel, c] - self.game_mean[(name, g)]) / self.game_std[(name, g)]
            else:
                out[:, c] = (rows[:, c] - self.mean[name]) / self.std[name]
            if name in missing:
                out[rows[:, col[missing[name]]] == 1, c] = 0.0
        if not use_study:
            keep = [i for i, name in enumerate(SESSION_COLUMNS) if name not in STUDY_COLUMNS]
            out = out[:, keep]
        return out.astype(np.float32)


def session_columns(use_study: bool = True) -> tuple[str, ...]:
    return SESSION_COLUMNS if use_study else tuple(c for c in SESSION_COLUMNS if c not in STUDY_COLUMNS)


@dataclass
class Sequences:
    """Model inputs for one split: per patient, scaled session rows and per-step targets."""

    x: list[np.ndarray]  # (n_sessions, n_features) float32
    session_day: list[np.ndarray]  # (n_sessions,) int
    profile: np.ndarray  # (n_patients,) int
    flag: list[np.ndarray]  # (n_sessions,) float32, target per session
    patients: list[Patient]


def build_sequences(patients: Sequence[Patient], scaler: Scaler, days: int, use_study: bool = True) -> Sequences:
    xs, session_days, flags = [], [], []
    for p in patients:
        xs.append(scaler.transform(raw_session_rows(p, days), use_study))
        d = np.array([s.day for s in p.sessions], dtype=np.int64)
        session_days.append(d)
        flags.append(np.array([flag_target(p.profile, int(day)) for day in d], dtype=np.float32))
    return Sequences(xs, session_days, np.array([p.label for p in patients]), flags, list(patients))


def last_session_index_by_day(session_day: np.ndarray, days: int) -> np.ndarray:
    """For each day 0..days-1: index of the last session on or before that day, or -1 if none yet."""
    return np.searchsorted(session_day, np.arange(days), side="right") - 1


# ---------------------------------------------------------------------------
# Summary features for the MLP baseline: per game, statistics of all sessions up to a day.

SUMMARY_PER_GAME = (
    "played",
    "n_completed",
    "mean_composite",
    "recent_composite",
    "early_composite",
    "slope_composite",
    "mean_accuracy",
    "last_level",
    "mean_log_rt",
    "hint_rate",
    "completed_rate",
    "mean_log_study",
)
SUMMARY_COLUMNS = (
    "days_observed",
    "sessions_per_day",
    *(f"{g}:{name}" for g in GAMES for name in SUMMARY_PER_GAME),
)


def summary_at(raw: np.ndarray, session_day: np.ndarray, day: int, use_study: bool = True) -> np.ndarray:
    """Summary features from the sessions on or before `day` (raw, unscaled session rows)."""
    col = {name: i for i, name in enumerate(SESSION_COLUMNS)}
    upto = raw[session_day <= day]
    out = [float(day + 1), len(upto) / (day + 1)]
    for g in GAMES:
        rows = upto[upto[:, col[f"game_{g}"]] == 1]
        done = rows[rows[:, col["composite_missing"]] == 0]
        comp = done[:, col["composite"]]
        when = done[:, col["day"]]
        if len(comp) >= 2 and np.ptp(when) > 0:
            slope = float(np.polyfit(when, comp, 1)[0])
        else:
            slope = 0.0
        rt = rows[rows[:, col["rt_missing"]] == 0, col["log_rt"]]
        study = rows[rows[:, col["study_missing"]] == 0, col["log_study"]]
        out += [
            float(len(rows) > 0),
            float(len(done)),
            float(comp.mean()) if len(comp) else 0.0,
            float(comp[-5:].mean()) if len(comp) else 0.0,
            float(comp[:10].mean()) if len(comp) else 0.0,
            slope,
            float(rows[:, col["accuracy"]].mean()) if len(rows) else 0.0,
            float(rows[-1, col["level"]]) if len(rows) else 0.0,
            float(rt.mean()) if len(rt) else 0.0,
            float(rows[:, col["hint_rate"]].mean()) if len(rows) else 0.0,
            float(rows[:, col["completed"]].mean()) if len(rows) else 0.0,
            float(study.mean()) if (len(study) and use_study) else 0.0,
        ]
    return np.array(out, dtype=np.float64)


@dataclass
class Summaries:
    """MLP inputs for one split: one row per (patient, day) snapshot."""

    x: np.ndarray  # (n_rows, n_summary) float32, scaled
    patient: np.ndarray  # (n_rows,) index into `patients`
    day: np.ndarray  # (n_rows,)
    profile: np.ndarray  # (n_rows,)
    flag: np.ndarray  # (n_rows,) float32
    patients: list[Patient]


def summary_rows(
    patients: Sequence[Patient], days: int, snapshot_days: Sequence[int], use_study: bool = True
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    xs, pid, day_col, prof, flag = [], [], [], [], []
    for i, p in enumerate(patients):
        raw = raw_session_rows(p, days)
        sday = np.array([s.day for s in p.sessions])
        for d in snapshot_days:
            xs.append(summary_at(raw, sday, d, use_study))
            pid.append(i)
            day_col.append(d)
            prof.append(p.label)
            flag.append(flag_target(p.profile, d))
    return np.array(xs), np.array(pid), np.array(day_col), np.array(prof), np.array(flag, dtype=np.float32)


@dataclass
class SummaryScaler:
    mean: np.ndarray
    std: np.ndarray

    @staticmethod
    def fit(train_x: np.ndarray) -> "SummaryScaler":
        std = train_x.std(axis=0)
        return SummaryScaler(train_x.mean(axis=0), np.where(std > 0, std, 1.0))

    def transform(self, x: np.ndarray) -> np.ndarray:
        return ((x - self.mean) / self.std).astype(np.float32)


def build_summaries(
    patients: Sequence[Patient], days: int, snapshot_days: Sequence[int], scaler: SummaryScaler, use_study: bool = True
) -> Summaries:
    x, pid, day, prof, flag = summary_rows(patients, days, snapshot_days, use_study)
    return Summaries(scaler.transform(x), pid, day, prof, flag, list(patients))
