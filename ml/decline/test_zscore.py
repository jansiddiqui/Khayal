from datetime import datetime, timedelta

import pytest

from ml.decline.zscore import (
    DEFAULT,
    LEGACY,
    RoundSummary,
    SessionSummary,
    alert_decision,
    assess,
    baseline_reaction_ms,
    baseline_stats,
    composite,
    completed_in_order,
    index_status,
    overall_index,
    trend,
)

T0 = datetime(2026, 8, 1, 10)
WARMUP = DEFAULT.warmup_sessions  # 5
NEEDED = DEFAULT.sessions_needed  # 15


def session(
    i: int,
    correct: int = 5,
    hinted: int = 0,
    level: int = 5,
    rt: int | None = 1000,
    game: str = "memory_match",
    completed: bool = True,
    rounds: int = 5,
) -> SessionSummary:
    """`correct` correct rounds, of which `hinted` used a hint."""
    rs = [RoundSummary(correct=k < correct, hint_used=k < hinted, reaction_ms=rt) for k in range(rounds)]
    return SessionSummary(game, T0 + timedelta(days=i), level, tuple(rs), completed, session_id=i)


def warmup(n: int = WARMUP, **kw: object) -> list[SessionSummary]:
    """Warm-up sessions that must not affect the baseline: deliberately very different."""
    return [session(i, correct=0, level=2, rt=9000, **kw) for i in range(n)]  # type: ignore[arg-type]


class TestComposite:
    def test_accuracy_gives_half_credit_for_hinted_correct_rounds(self) -> None:
        assert session(0, correct=5, hinted=0).accuracy == 1.0
        assert session(0, correct=4, hinted=2).accuracy == pytest.approx((2 + 0.5 * 2) / 5)
        assert session(0, correct=0).accuracy == 0.0

    def test_level_scales_and_rt_is_one_without_a_baseline(self) -> None:
        assert composite(session(0, level=6), None) == pytest.approx(0.6)

    def test_rt_ratio_is_clamped(self) -> None:
        assert composite(session(0, level=10, rt=1000), 1000) == pytest.approx(1.0)
        assert composite(session(0, level=10, rt=500), 1000) == pytest.approx(1.5)  # 2.0 clamped
        assert composite(session(0, level=10, rt=4000), 1000) == pytest.approx(0.5)  # 0.25 clamped
        assert composite(session(0, level=10, rt=1250), 1000) == pytest.approx(0.8)

    def test_session_without_reaction_times_has_rt_one(self) -> None:
        assert composite(session(0, level=10, rt=None), 1000) == pytest.approx(1.0)

    def test_about_today_ignores_level_and_rt(self) -> None:
        assert composite(session(0, correct=4, level=1, rt=9000, game="daily_orientation"), 1000) == pytest.approx(0.8)

    def test_rt_baseline_uses_the_baseline_window_not_the_warm_up(self) -> None:
        done = warmup() + [session(WARMUP + i, rt=1000 + 100 * i) for i in range(12)]
        assert baseline_reaction_ms(done[: NEEDED - 1]) is None
        assert baseline_reaction_ms(done) == pytest.approx(1450)  # median of 1000..1900; 9000s ignored
        assert baseline_reaction_ms(done[5:], LEGACY) == pytest.approx(1450)  # legacy: first 10

    def test_stopped_early_sessions_are_excluded(self) -> None:
        assert [s.session_id for s in completed_in_order([session(1, completed=False, rounds=3), session(0)])] == [0]


class TestBaseline:
    def test_std_floors(self) -> None:
        flat_high = [1.0] * 10
        assert baseline_stats([0.0] * 5 + flat_high) == (1.0, pytest.approx(0.15))  # 0.15 × mean
        flat_low = [0.2] * 10
        assert baseline_stats([0.0] * 5 + flat_low) == (0.2, pytest.approx(0.05))  # absolute floor
        noisy = [0.2, 0.6] * 5
        mean, std = baseline_stats([0.0] * 5 + noisy)
        assert mean == pytest.approx(0.4) and std == pytest.approx(0.2108, abs=1e-4)  # sample std wins
        assert baseline_stats(flat_high, LEGACY) == (1.0, pytest.approx(0.02))

    def test_learning_until_fifteen_sessions(self) -> None:
        result = assess(warmup() + [session(WARMUP + i) for i in range(3)])
        assert (result.status, result.z, result.score) == ("insufficient", None, None)
        assert result.explanation == "Learning this patient's normal (8/15 sessions)"
        assert (result.sessions, result.sessions_needed) == (8, 15)
        result = assess(warmup() + [session(WARMUP + i) for i in range(9)])
        assert result.status == "insufficient" and all(p.z is None for p in result.trend)

    def test_trend_has_z_from_the_fifteenth_session(self) -> None:
        points = trend(warmup() + [session(WARMUP + i) for i in range(12)])
        assert [p.z is None for p in points] == [True] * (NEEDED - 1) + [False] * 3

    def test_warm_up_does_not_shape_the_baseline(self) -> None:
        steady = [session(WARMUP + i, correct=4 + i % 2, level=6) for i in range(15)]
        assert assess(warmup() + steady).status == "stable"  # a terrible warm-up is ignored


class TestDecline:
    def test_drop_raises_warning_then_critical_with_plain_explanation(self) -> None:
        base = warmup() + [session(WARMUP + i, correct=4 + i % 2, level=6) for i in range(10)]  # 0.48 / 0.6
        mild = base + [session(NEEDED + i, correct=4, level=5) for i in range(5)]  # 0.40
        result = assess(mild)
        assert result.status == "warning"
        assert result.explanation == (
            f"Memory Match average dropped from {result.baseline_mean:.2f} to {result.score:.2f} "
            f"over the last 5 sessions (z = {format(result.z, '.1f').replace('-', '−')})."
        )
        severe = base + [session(NEEDED + i, correct=2, level=4) for i in range(5)]  # 0.16
        assert assess(severe).status == "critical"

    def test_formula_matches_hand_calculation(self) -> None:
        base = warmup() + [session(WARMUP + i, correct=5 if i % 2 == 0 else 4, level=5) for i in range(10)]
        later = [session(NEEDED + i, correct=3, level=5) for i in range(5)]  # 0.3 each
        result = assess(base + later)
        scores = [0.5, 0.4] * 5
        mean = sum(scores) / 10
        std = max((sum((x - mean) ** 2 for x in scores) / 9) ** 0.5, 0.05, 0.15 * mean)
        assert result.baseline_mean == pytest.approx(mean)
        assert result.baseline_std == pytest.approx(std)
        assert result.score == pytest.approx(0.3)
        assert result.z == pytest.approx((0.3 - mean) / std)

    def test_one_bad_about_today_session_is_not_extreme(self) -> None:
        """The case that motivated the floors: perfect baseline, then one 0/5 session."""
        sessions = [session(i, game="daily_orientation", level=1) for i in range(NEEDED + 4)]
        sessions.append(session(NEEDED + 4, correct=0, game="daily_orientation", level=1))
        new = assess(sessions)
        assert new.z == pytest.approx((0.8 - 1.0) / 0.15)  # −1.33: stable, not an alert
        assert new.status == "stable"
        legacy = assess(sessions, LEGACY)
        assert legacy.z == pytest.approx(-10.0) and legacy.status == "critical"

    def test_z_is_clipped_but_raw_z_is_kept(self) -> None:
        base = [session(i, correct=4 + i % 2, level=8) for i in range(NEEDED)]
        crash = base + [session(NEEDED + i, correct=0, level=8) for i in range(5)]
        result = assess(crash)
        assert result.z == -4.0 and result.z_raw is not None and result.z_raw < -4.0
        assert "(z ≤ −4.0)" in result.explanation
        assert assess(crash, LEGACY).z == pytest.approx(assess(crash, LEGACY).z_raw)


class TestOverallIndex:
    def test_mean_of_games_with_a_baseline(self) -> None:
        assert overall_index([-1.0, None, -2.0]) == pytest.approx(-1.5)
        assert overall_index([None, None]) is None

    def test_clipping_limits_one_game(self) -> None:
        assert overall_index([-4.0, 0.2, 0.0, 0.4]) == pytest.approx(-0.85)  # one crash: Watch, not Declining

    @pytest.mark.parametrize(
        ("index", "status"),
        [(None, "insufficient"), (0.4, "stable"), (-0.5, "stable"), (-0.6, "watch"), (-1.5, "watch"), (-1.6, "declining")],
    )
    def test_status(self, index: float | None, status: str) -> None:
        assert index_status(index) == status


class TestAlertDecision:
    now = T0 + timedelta(days=30)

    def ago(self, days: float) -> datetime:
        return self.now - timedelta(days=days)

    def test_worst_game_decides(self) -> None:
        assert alert_decision(["stable", "insufficient"], [], self.now) is None
        assert alert_decision(["stable", "warning"], [], self.now) == "warning"
        assert alert_decision(["warning", "critical"], [], self.now) == "critical"

    def test_same_severity_once_per_7_days(self) -> None:
        assert alert_decision(["warning"], [(self.ago(6), "warning")], self.now) is None
        assert alert_decision(["warning"], [(self.ago(7.1), "warning")], self.now) == "warning"
        assert alert_decision(["critical"], [(self.ago(6), "critical")], self.now) is None

    def test_critical_escalates_within_7_days_of_a_warning(self) -> None:
        assert alert_decision(["critical"], [(self.ago(2), "warning")], self.now) == "critical"
        assert alert_decision(["warning"], [(self.ago(2), "critical")], self.now) is None  # no step down
        assert alert_decision(["critical"], [(self.ago(2), "warning")], self.now, LEGACY) is None

    def test_future_alerts_are_ignored_when_replaying(self) -> None:
        assert alert_decision(["warning"], [(self.now + timedelta(days=1), "warning")], self.now) == "warning"
