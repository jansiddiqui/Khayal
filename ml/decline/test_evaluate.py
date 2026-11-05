from datetime import timedelta
from pathlib import Path

import pytest

from ml.decline import zscore
from ml.decline.evaluate import START, PatientOutcome, main, metrics, replay, run
from ml.decline.simulator import Profile, SimSession
from ml.decline.zscore import RoundSummary


def outcome(profile: Profile, final: zscore.IndexStatus, first_alert: int | None = None, seed: int = 0) -> PatientOutcome:
    alerts: tuple[tuple[int, zscore.Severity], ...] = () if first_alert is None else ((first_alert, "warning"),)
    return PatientOutcome(seed, profile, final, alerts)


def test_metrics_by_hand() -> None:
    outcomes = [
        outcome("healthy", "stable"),
        outcome("healthy", "watch", first_alert=40),
        outcome("mci", "watch", first_alert=30),
        outcome("mci", "declining", first_alert=50),
        outcome("moderate", "declining", first_alert=20),
        outcome("moderate", "declining"),
    ]
    m = metrics(outcomes)
    assert m.confusion["healthy"]["stable"] == 1 and m.confusion["mci"]["declining"] == 1
    assert m.accuracy == pytest.approx(4 / 6)
    assert m.precision["watch"] == pytest.approx(1 / 2) and m.recall["watch"] == pytest.approx(1 / 2)
    assert m.precision["declining"] == pytest.approx(2 / 3) and m.recall["declining"] == 1.0
    assert m.f1["declining"] == pytest.approx(0.8)
    assert m.false_alarm_rate == 0.5
    assert m.detected == {"mci": 1.0, "moderate": 0.5}
    assert m.delay["mci"] == (40.0, 35.0, 45.0)
    assert m.delay["moderate"] == (20.0, 20.0, 20.0)


def flat_then_crash(days: int, crash_from: int) -> list[SimSession]:
    """One About Today session a day: 5/5 right, then 0/5 from `crash_from`."""
    out: list[SimSession] = []
    for day in range(days):
        correct = 5 if day < crash_from else 0
        rounds = tuple(RoundSummary(correct=i < correct) for i in range(5))
        out.append(SimSession(0, "moderate", day, "daily_orientation", START + timedelta(days=day, hours=10), 1, 1, rounds, completed=True))
    return out


def test_replay_alerts_follow_the_backend_rules() -> None:
    sessions = flat_then_crash(40, crash_from=20)
    final, alerts = replay(sessions, 40, zscore.DEFAULT)
    assert final == "declining"
    # Day 20: one 0/5 session drops the rolling mean to 0.8, z = −1.33 (floor 0.15): no alert.
    # Day 21: 0.6, z = −2.7: critical straight away, then once per 7 days.
    assert alerts == ((21, "critical"), (28, "critical"), (35, "critical"))
    _, legacy = replay(sessions, 40, zscore.LEGACY)
    assert legacy[0] == (20, "critical")  # floor 0.02: the first bad session is already z = −10


def test_nothing_before_the_baseline_exists() -> None:
    final, alerts = replay(flat_then_crash(14, crash_from=0), 14, zscore.DEFAULT)
    assert (final, alerts) == ("insufficient", ())


def test_run_is_deterministic_and_cli_writes_both_files(tmp_path: Path) -> None:
    a = run(patients_per_profile=2, seeds=1, days=40)
    b = run(patients_per_profile=2, seeds=1, days=40)
    assert a == b and len(a["current"]) == len(a["legacy"]) == 6
    main(["--patients-per-profile", "2", "--seeds", "1", "--days", "40", "--out", str(tmp_path)])
    md = (tmp_path / "decline_eval.md").read_text(encoding="utf-8")
    assert "## Ablation" in md and "| current |" in md and "| legacy |" in md
    header = (tmp_path / "decline_eval.csv").read_text(encoding="utf-8").splitlines()[0]
    assert header == "setting,metric,group,value"
