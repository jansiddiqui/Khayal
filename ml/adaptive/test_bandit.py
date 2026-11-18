import importlib.util
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest

from ml.adaptive import evaluate
from ml.adaptive.bandit import (
    ACTIONS,
    N_FEATURES,
    Context,
    LinearThompson,
    LinUCB,
    PlayedSession,
    RuleEngine,
    allowed_actions,
    build_context,
    context_from_rounds,
    make_engine,
    reward,
    rule_action,
)
from ml.adaptive.rule_based import Round, next_level
from ml.decline.simulator import PROFILES, SimOptions, expected_reward, simulate_patient

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def rounds(pattern: str, rt: int = 1000) -> tuple[Round, ...]:
    return tuple(Round(correct=c == "1", reaction_ms=rt) for c in pattern)


def ctx(success: float, level: int = 5, stopped: bool = False) -> Context:
    return Context(level=level, success=success, stopped_early=stopped, rounds=3 if stopped else 5)


def test_reward_peaks_at_seventy_percent_and_penalises_stopping() -> None:
    assert reward(rounds("11110"), True) == pytest.approx(2 / 3)
    assert reward(rounds("11100"), True) == pytest.approx(2 / 3)
    assert reward(rounds("11111"), True) == pytest.approx(0.0)
    assert reward(rounds("11000"), True) == pytest.approx(0.0)
    assert reward(rounds("00000"), True) == pytest.approx(-1.0)
    assert reward(rounds("110"), False) == pytest.approx(1 - 0.0333 / 0.3 - 0.5, abs=1e-3)


def test_context_from_history() -> None:
    history = [
        PlayedSession(4, rounds("11100", 1000), True, 0.0),
        PlayedSession(4, rounds("11110", 1000), True, 1.0),
        PlayedSession(5, rounds("10", 2000), False, 4.0),
    ]
    c = build_context(history)
    assert c.level == 5
    assert c.success == 0.5
    assert c.trend == pytest.approx(0.5 - 0.7)
    assert c.rt_log_ratio == pytest.approx(np.log(2.0))
    assert c.stopped_early
    assert c.days_since_last == 3.0
    assert c.features().shape == (N_FEATURES,)


def test_rule_engine_matches_rule_based() -> None:
    for pattern in ("11111", "11110", "11100", "11000", "00000"):
        for level in (1, 5, 10):
            assert RuleEngine().next_level(level, list(rounds(pattern))) == next_level(level, list(rounds(pattern)))
    assert rule_action(context_from_rounds(5, rounds("111"))) == 0  # stopped early: no change


def test_allowed_actions_bounds_and_guardrails() -> None:
    assert allowed_actions(ctx(0.8, level=1)) == (0, 1)
    assert allowed_actions(ctx(0.8, level=10)) == (-1, 0)
    assert allowed_actions(ctx(0.4)) == (-1, 0)  # never up at 40% or less
    assert allowed_actions(ctx(1.0, stopped=True)) == (-1, 0)  # never up after stopping early
    assert allowed_actions(ctx(1.0)) == (0, 1)  # never down after 5/5


@pytest.mark.parametrize("name", ["linucb", "thompson"])
def test_bandit_moves_at_most_one_level_and_stays_in_range(name: str) -> None:
    engine = make_engine(name, seed=1)
    rng = np.random.default_rng(0)
    for _ in range(600):
        c = Context(level=int(rng.integers(1, 11)), success=float(rng.integers(0, 6)) / 5,
                    stopped_early=bool(rng.random() < 0.2), days_since_last=float(rng.uniform(0, 20)))
        d = engine.decide(c)
        assert d.action in allowed_actions(c)
        assert 1 <= c.level + d.action <= 10
        engine.learn(c, d.action, float(rng.uniform(-1, 1)))


def test_untrained_bandit_falls_back_to_the_rule_engine() -> None:
    engine = LinUCB(min_obs=10)
    for success, expected in ((1.0, 1), (0.8, 0), (0.2, -1)):
        d = engine.decide(ctx(success))
        assert d.source == "rule" and d.action == expected


def test_bandit_learns_a_clear_preference() -> None:
    """+1 pays after 5/5, -1 pays after 1/5, stay pays in between: the bandit should learn it."""
    engine = LinearThompson(min_obs=50, max_uncertainty=1.0, seed=3)
    rng = np.random.default_rng(3)

    def pay(c: Context, a: int) -> float:
        best = 1 if c.success >= 1.0 else (-1 if c.success <= 0.2 else 0)
        return (1.0 if a == best else 0.0) + float(rng.normal(0, 0.2))

    for _ in range(3000):
        c = ctx(float(rng.integers(1, 6)) / 5)
        d = engine.decide(c)
        engine.learn(c, d.action, pay(c, d.action))
    picks = {s: [engine.decide(ctx(s)).action for _ in range(30)] for s in (1.0, 0.6, 0.2)}
    assert np.mean([a == 1 for a in picks[1.0]]) > 0.8
    assert np.mean([a == 0 for a in picks[0.6]]) > 0.8
    assert np.mean([a == -1 for a in picks[0.2]]) > 0.8


def test_same_interface_as_the_rule_engine() -> None:
    engine = make_engine("thompson")
    level = engine.next_level(5, list(rounds("11111")))
    assert level in (5, 6)


def test_rule_engine_through_options_reproduces_the_default_simulator() -> None:
    a = simulate_patient(1, "mci", 40, np.random.default_rng(7), START)
    b = simulate_patient(1, "mci", 40, np.random.default_rng(7), START, options=SimOptions(RuleEngine()))
    assert [(s.game_type, s.level_start, s.level_end, s.rounds) for s in a] == [
        (s.game_type, s.level_start, s.level_end, s.rounds) for s in b
    ]


def test_expected_reward_peaks_near_the_target_level() -> None:
    values = [expected_reward("colour_trails", level, 0.8) for level in range(1, 11)]
    best = int(np.argmax(values)) + 1
    assert 5 <= best <= 9
    assert values[0] < values[best - 1] and values[-1] < values[best - 1]


def test_simulated_decisions_are_logged_with_regret() -> None:
    log: list = []
    options = SimOptions(make_engine("linucb"), frustration=0.6, log=log)
    sessions = simulate_patient(0, "healthy", 30, np.random.default_rng(0), START, options=options)
    levelled = [s for s in sessions if s.game_type not in ("daily_orientation", "word_recall_delayed")]
    assert len(log) == len(levelled)
    assert all(abs(s.level_end - s.level_start) <= 1 for s in levelled)
    assert all(d.regret >= 0 and set(d.expected) <= set(ACTIONS) for d in log)


@pytest.mark.skipif(importlib.util.find_spec("torch") is None, reason="PyTorch only in ml/.venv")
def test_neural_bandit_is_safe() -> None:
    engine = make_engine("neural", seed=0)
    rng = np.random.default_rng(0)
    for _ in range(300):
        c = ctx(float(rng.integers(0, 6)) / 5, level=int(rng.integers(1, 11)))
        d = engine.decide(c)
        assert d.action in allowed_actions(c)
        engine.learn(c, d.action, float(rng.uniform(-1, 1)))
    assert engine.n_obs == 300


def test_warmed_bandit_is_deterministic() -> None:
    from ml.adaptive.prior import warmed_bandit

    c = ctx(0.8)
    assert [warmed_bandit(seed=5).decide(c).action for _ in range(3)] == [warmed_bandit(seed=5).decide(c).action] * 3


def test_evaluate_writes_report(tmp_path: Path) -> None:
    evaluate.main(["--patients-per-profile", "1", "--seeds", "2", "--days", "30", "--engines", "rule,linucb,fixed",
                   "--out", str(tmp_path), "--no-plots"])
    md = (tmp_path / "adaptive_eval.md").read_text(encoding="utf-8")
    assert "## Does adaptive difficulty hide decline?" in md
    assert "## Interpretation" in md and "level-independent ability estimate" in md
    assert "LinUCB" in md and "Rule engine" in md
    csv = (tmp_path / "adaptive_eval.csv").read_text(encoding="utf-8")
    assert csv.startswith("engine,metric,group,value")
    assert len(PROFILES) == 3
