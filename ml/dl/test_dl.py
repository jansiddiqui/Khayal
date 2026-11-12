"""Tests for the deep-learning experiment code. Model tests need torch (ml/requirements-dl.txt) and skip without it."""

import numpy as np
import pytest

from ml.decline.simulator import PROFILES
from ml.dl import data as D
from ml.dl.metrics import Outcome, alarm_day, score

DAYS = 30


@pytest.fixture(scope="module")
def cohort() -> list[D.Patient]:
    return D.simulate_cohort(seed=3, per_profile=20, days=DAYS)


def test_split_is_by_patient_stratified_and_seeded(cohort: list[D.Patient]) -> None:
    split = D.split_by_patient(cohort, seed=3)
    ids = {name: {p.pid for p in patients} for name, patients in split.items()}
    assert not ids["train"] & ids["val"] and not ids["train"] & ids["test"] and not ids["val"] & ids["test"]
    assert ids["train"] | ids["val"] | ids["test"] == {p.pid for p in cohort}
    for profile in PROFILES:
        counts = [sum(p.profile == profile for p in split[s]) for s in D.SPLITS]
        assert counts == [14, 3, 3]  # 70 / 15 / 15 of 20
    again = D.split_by_patient(cohort, seed=3)
    assert [p.pid for p in again["test"]] == [p.pid for p in split["test"]]


def test_same_seed_same_cohort() -> None:
    a = D.simulate_cohort(seed=5, per_profile=2, days=10)
    b = D.simulate_cohort(seed=5, per_profile=2, days=10)
    assert [(s.day, s.game_type, s.rounds, s.study_ms) for p in a for s in p.sessions] == [
        (s.day, s.game_type, s.rounds, s.study_ms) for p in b for s in p.sessions
    ]


def test_scaler_uses_training_patients_only(cohort: list[D.Patient]) -> None:
    split = D.split_by_patient(cohort, seed=3)
    train_raw = [D.raw_session_rows(p, DAYS) for p in split["train"]]
    scaler = D.Scaler.fit(train_raw)
    scaled = scaler.transform(np.concatenate(train_raw))
    col = D.SESSION_COLUMNS.index("accuracy")
    assert abs(scaled[:, col].mean()) < 1e-5 and abs(scaled[:, col].std() - 1) < 1e-4
    # Test patients don't move the scaler.
    test_raw = [D.raw_session_rows(p, DAYS) for p in split["test"]]
    assert D.Scaler.fit(train_raw).mean == D.Scaler.fit([*train_raw]).mean
    assert D.Scaler.fit(train_raw + test_raw).mean != scaler.mean


def test_session_features_and_study_columns(cohort: list[D.Patient]) -> None:
    p = cohort[0]
    raw = D.raw_session_rows(p, DAYS)
    col = {c: i for i, c in enumerate(D.SESSION_COLUMNS)}
    games = raw[:, [col[f"game_{g}"] for g in D.GAMES]]
    assert (games.sum(axis=1) == 1).all()
    study_games = (raw[:, col["game_memory_match"]] + raw[:, col["game_word_recall"]]) == 1
    assert (raw[study_games, col["study_missing"]] == 0).all()
    assert (raw[~study_games, col["study_missing"]] == 1).all()
    scaler = D.Scaler.fit([raw])
    assert scaler.transform(raw, use_study=False).shape[1] == len(D.SESSION_COLUMNS) - len(D.STUDY_COLUMNS)


def test_flag_target_switches_on_at_the_meaningful_drop() -> None:
    assert all(D.flag_target("healthy", d) == 0 for d in range(90))
    assert D.flag_onset_day("mci") == 23 and D.flag_onset_day("moderate") == 10
    assert D.flag_target("moderate", 9) == 0 and D.flag_target("moderate", 10) == 1


def test_last_session_by_day_carries_forward() -> None:
    by_day = D.last_session_index_by_day(np.array([1, 1, 3]), 5)
    assert by_day.tolist() == [-1, 1, 1, 2, 2]


def test_alarm_needs_three_days_in_a_row() -> None:
    assert alarm_day([0.6, 0.6, 0.4, 0.6, 0.6, 0.6]) == 5
    assert alarm_day([0.6, 0.6, 0.4, 0.6, 0.6]) is None
    assert alarm_day([0.5, 0.5, 0.5]) == 2


def test_scores() -> None:
    outcomes = [
        Outcome("healthy", "healthy", None),
        Outcome("healthy", "mci", 40),
        Outcome("mci", "mci", 30),
        Outcome("mci", None, None),  # rule still learning: counts as wrong
        Outcome("moderate", "moderate", 20),
        Outcome("moderate", "moderate", 10),
    ]
    s = score(outcomes)
    assert s.accuracy == pytest.approx(4 / 6)
    assert s.recall == {"healthy": 0.5, "mci": 0.5, "moderate": 1.0}
    assert s.false_alarm_rate == 0.5 and s.false_alarm_day_median == 40
    assert s.detected == {"mci": 0.5, "moderate": 1.0}
    assert s.delay_median == {"mci": 30, "moderate": 15}
    assert s.confusion[1, 3] == 1


def test_sequence_model_is_causal() -> None:
    torch = pytest.importorskip("torch")
    from ml.dl.models import SequenceModel

    torch.manual_seed(0)
    for kind in ("gru", "lstm"):
        model = SequenceModel(8, kind).eval()  # type: ignore[arg-type]
        x = torch.randn(1, 12, 8)
        changed = x.clone()
        changed[:, 8:] = torch.randn(1, 4, 8)
        a, _ = model(x)
        b, _ = model(changed)
        assert torch.allclose(a[:, :8], b[:, :8])  # later sessions never change earlier predictions
        assert not torch.allclose(a[:, 8:], b[:, 8:])


def test_tiny_end_to_end_run() -> None:
    pytest.importorskip("torch")
    from ml.dl.run import METHODS, run_seed
    from ml.dl.train import TrainConfig

    result = run_seed(seed=0, per_profile=8, days=20, cfg=TrainConfig(epochs=1), log=lambda *_: None)
    assert set(result.outcomes) == set(METHODS)
    assert result.n_patients == {"train": 18, "val": 3, "test": 3}  # 6 / 1 / 1 of each profile's 8
    assert all(len(result.outcomes[m]) == 3 for m in METHODS)
    assert all(len(result.checkpoints[m][14]) == 3 for m in METHODS)
    assert all(len(h.val_loss) >= 1 for h in result.histories.values())


def test_shifted_cohorts_change_only_what_they_claim() -> None:
    shifts = {s.name: s for s in D.SHIFTS}
    late = D.simulate_shifted_cohort(0, 10, 60, shifts["late_onset"])
    onsets = [p.onset_day for p in late if p.profile != "healthy"]
    assert all(30 <= d <= 50 for d in onsets) and len(set(onsets)) > 1
    assert all(p.onset_day == 0 for p in late if p.profile == "healthy")
    sparse = D.simulate_shifted_cohort(0, 5, 60, shifts["every_other_day"])
    assert all(s.day % 2 == 0 for p in sparse for s in p.sessions)
    same = shifts["same_nuisance"].params
    assert same is not None and len({(v.daily_noise, v.play_probability) for v in same.values()}) == 1
    assert len({v.decline_per_day for v in same.values()}) == 3  # the decline still differs
    # New patients, not the training cohort's.
    default = D.simulate_cohort(0, 5, 60)
    assert [s.rounds for s in default[0].sessions] != [s.rounds for s in sparse[0].sessions]


def test_delay_counts_from_onset_and_early_flags_are_not_detections() -> None:
    s = score([
        Outcome("healthy", "healthy", None),
        Outcome("mci", "mci", 50, onset_day=40),  # detected 10 days after onset
        Outcome("mci", "mci", 20, onset_day=40),  # flagged before the decline began
    ])
    assert s.delay_median["mci"] == 10 and s.detected["mci"] == 0.5 and s.flagged_before_onset == 0.5


def test_vectorised_alarm_days_match_the_reference() -> None:
    from ml.dl.metrics import alarm_days

    rng = np.random.default_rng(0)
    p = rng.random((40, 30))
    for t in (0.2, 0.5, 0.8):
        expected = [alarm_day(row, t) for row in p]
        assert alarm_days(p, t).tolist() == [-1 if e is None else e for e in expected]


def test_matched_threshold_keeps_validation_false_alarms_at_most_the_rules() -> None:
    pytest.importorskip("torch")
    from ml.dl.analysis import _false_alarm, matched_threshold, rule_b_false_alarm
    from ml.dl.run import MODELS, run_seed
    from ml.dl.train import TrainConfig

    r = run_seed(seed=1, per_profile=10, days=30, cfg=TrainConfig(epochs=1), log=lambda *_: None)
    for m in MODELS:
        t = matched_threshold(r, m)
        assert _false_alarm(r.val, m, t) <= rule_b_false_alarm(r.val) + 1e-9
