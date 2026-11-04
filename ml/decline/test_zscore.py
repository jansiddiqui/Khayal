from datetime import datetime, timedelta

import pytest

from ml.decline.zscore import (
    BASELINE_SESSIONS,
    STD_FLOOR,
    RoundSummary,
    SessionSummary,
    assess,
    baseline_reaction_ms,
    composite,
    completed_in_order,
    index_status,
    overall_index,
    trend,
)

T0 = datetime(2026, 8, 1, 10)


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
        s = session(0, correct=4, level=1, rt=9000, game="daily_orientation")
        assert composite(s, 1000) == pytest.approx(0.8)

    def test_baseline_rt_is_median_of_first_ten_session_medians(self) -> None:
        done = [session(i, rt=1000 + 100 * i) for i in range(12)]
        assert baseline_reaction_ms(done[:9]) is None
        assert baseline_reaction_ms(done) == pytest.approx(1450)  # median of 1000..1900

    def test_stopped_early_sessions_are_excluded(self) -> None:
        sessions = [session(1, completed=False, rounds=3), session(0)]
        assert [s.session_id for s in completed_in_order(sessions)] == [0]


class TestDecline:
    def test_no_baseline_before_ten_sessions(self) -> None:
        result = assess([session(i) for i in range(9)])
        assert (result.status, result.z, result.score) == ("insufficient", None, None)
        assert "9 of 10" in result.explanation
        assert all(p.z is None for p in result.trend)

    def test_steady_patient_is_stable(self) -> None:
        sessions = [session(i, correct=4 + i % 2) for i in range(20)]
        result = assess(sessions)
        assert result.status == "stable"
        assert result.z is not None and abs(result.z) < 1.5
        assert result.baseline_mean is not None

    def test_drop_raises_warning_then_critical(self) -> None:
        base = [session(i, correct=4 + i % 2, level=6) for i in range(10)]  # composites 0.48 / 0.6
        mild = base + [session(10 + i, correct=4, level=5) for i in range(5)]  # 0.40
        result = assess(mild)
        assert result.status == "warning"
        assert result.explanation == (
            f"Memory Match average dropped from {result.baseline_mean:.2f} to {result.score:.2f} "
            f"over the last 5 sessions (z = {format(result.z, '.1f').replace('-', '−')})."
        )
        severe = base + [session(10 + i, correct=2, level=4) for i in range(5)]  # 0.16
        assert assess(severe).status == "critical"

    def test_formula_matches_hand_calculation(self) -> None:
        # Baseline: alternating 1.0 and 0.8 accuracy at level 5 -> composites 0.5 / 0.4.
        base = [session(i, correct=5 if i % 2 == 0 else 4, level=5) for i in range(10)]
        later = [session(10 + i, correct=3, level=5) for i in range(5)]  # 0.3 each
        result = assess(base + later)
        scores = [0.5, 0.4] * 5
        mean = sum(scores) / 10
        std = (sum((x - mean) ** 2 for x in scores) / 9) ** 0.5
        assert result.baseline_mean == pytest.approx(mean)
        assert result.baseline_std == pytest.approx(std)
        assert result.score == pytest.approx(0.3)
        assert result.z == pytest.approx((0.3 - mean) / std)

    def test_std_floor_for_a_perfectly_flat_baseline(self) -> None:
        sessions = [session(i) for i in range(10)] + [session(10, correct=4)]
        result = assess(sessions)
        assert result.baseline_std == STD_FLOOR
        # rolling mean of last 5 = (4 × 0.5 + 0.4) / 5 = 0.48 -> z = −0.02 / 0.02 = −1.0
        assert result.z == pytest.approx(-1.0)

    def test_trend_has_z_from_the_tenth_session(self) -> None:
        points = trend([session(i) for i in range(12)])
        assert [p.z is None for p in points] == [True] * (BASELINE_SESSIONS - 1) + [False] * 3


class TestOverallIndex:
    def test_mean_of_games_with_a_baseline(self) -> None:
        assert overall_index([-1.0, None, -2.0]) == pytest.approx(-1.5)
        assert overall_index([None, None]) is None

    @pytest.mark.parametrize(
        ("index", "status"),
        [(None, "insufficient"), (0.4, "stable"), (-0.5, "stable"), (-0.6, "watch"), (-1.5, "watch"), (-1.6, "declining")],
    )
    def test_status(self, index: float | None, status: str) -> None:
        assert index_status(index) == status
