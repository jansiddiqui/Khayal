"""Learning-based difficulty: contextual bandits (CLAUDE.md section 12, Round 2 batch 1).

Research code. The app keeps the rule engine (`rule_based.next_level`) unless
KHAYAL_ADAPTIVE_ENGINE=bandit is set, and production is not switched.

Every engine keeps the rule engine's interface,

    engine.next_level(current_level, recent_rounds)            -> int
    engine.next_level(current_level, recent_rounds, context)   -> int   (richer context)

and chooses one of three actions after a session: level -1, stay, or +1.

Context (`Context.features`, 10 numbers):
    bias, success rate of the session just played, its square, success trend (this session
    minus the mean of up to 3 earlier ones), log of median reaction time vs the patient's
    baseline for this game, hint rate, errors per round, stopped early, days since the
    previous session (capped at 14), current level / 10.

Reward (observed when the patient's NEXT session of the same game ends):
    r = clip(1 - |s - 0.70| / 0.30, -1, 1) - 0.5 if that session was stopped early,
    where s is its success rate. 0.70 is the middle of the 60-80% target zone, so a next
    session at 60% or 80% earns 2/3, at 40% or 100% earns 0.

Safety (`SafeBandit.decide`):
    - at most +-1 per session and levels clamped to 1-10 (actions that would leave 1-10 are
      not offered);
    - guardrails: never up after a stopped-early session or a success rate of 40% or less;
      never down after a completed 5/5;
    - the rule engine decides whenever the bandit is unsure: fewer than `min_obs` rewards
      seen, or the uncertainty of the chosen action above `max_uncertainty`.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np

from ml.adaptive.rule_based import BLOCK_SIZE, MAX_LEVEL, MIN_LEVEL, Round, clamp_level
from ml.adaptive.rule_based import next_level as rule_next_level

ACTIONS: tuple[int, ...] = (-1, 0, 1)
TARGET = 0.70
ZONE = (0.60, 0.80)
ZONE_HALF_WIDTH = 0.30  # reward reaches 0 at 0.40 and 1.00
STOP_PENALTY = 0.5
MAX_GAP_DAYS = 14.0
N_FEATURES = 10

Source = Literal["bandit", "rule", "only"]


@dataclass(frozen=True)
class PlayedSession:
    """One finished session of one game, as an engine sees it."""

    level: int
    rounds: tuple[Round, ...]
    completed: bool
    day: float  # days on any fixed clock (fractional), used for the gap between sessions

    @property
    def success(self) -> float:
        return sum(r.correct for r in self.rounds) / len(self.rounds) if self.rounds else 0.0

    @property
    def median_rt(self) -> float | None:
        times = [r.reaction_ms for r in self.rounds if r.reaction_ms is not None]
        return float(np.median(times)) if times else None


@dataclass(frozen=True)
class Context:
    level: int
    success: float
    trend: float = 0.0
    rt_log_ratio: float = 0.0  # log(median RT / baseline RT), 0 when unknown
    hint_rate: float = 0.0
    errors_per_round: float = 0.0
    stopped_early: bool = False
    days_since_last: float = 1.0
    rounds: int = BLOCK_SIZE

    def features(self) -> np.ndarray:
        return np.array(
            [
                1.0,
                self.success,
                self.success**2,
                self.trend,
                self.rt_log_ratio,
                self.hint_rate,
                min(self.errors_per_round, 3.0) / 3.0,
                float(self.stopped_early),
                min(self.days_since_last, MAX_GAP_DAYS) / MAX_GAP_DAYS,
                self.level / MAX_LEVEL,
            ]
        )


def _errors_per_round(rounds: Sequence[Round]) -> float:
    return sum(r.errors or 0 for r in rounds) / len(rounds) if rounds else 0.0


def context_from_rounds(level: int, rounds: Sequence[Round]) -> Context:
    """Context when only the rounds just played are known (the plain `next_level` call)."""
    n = len(rounds)
    return Context(
        level=clamp_level(level),
        success=sum(r.correct for r in rounds) / n if n else 0.0,
        hint_rate=sum(r.hint_used for r in rounds) / n if n else 0.0,
        errors_per_round=_errors_per_round(rounds),
        stopped_early=n < BLOCK_SIZE,
        rounds=n,
    )


def build_context(history: Sequence[PlayedSession], baseline_rt_ms: float | None = None) -> Context:
    """Context after the last session in `history` (one patient, one game, oldest first).

    The reaction-time baseline is the median of the per-session medians of the first 5
    sessions before the last one, unless given.
    """
    if not history:
        raise ValueError("build_context needs at least one session")
    last = history[-1]
    earlier = history[-4:-1]
    trend = last.success - float(np.mean([s.success for s in earlier])) if earlier else 0.0
    if baseline_rt_ms is None:
        firsts = [rt for s in history[:-1][:5] if (rt := s.median_rt) is not None]
        baseline_rt_ms = float(np.median(firsts)) if firsts else None
    rt = last.median_rt
    rt_log_ratio = float(np.clip(math.log(rt / baseline_rt_ms), -1.0, 1.0)) if rt and baseline_rt_ms else 0.0
    gap = last.day - history[-2].day if len(history) > 1 else 1.0
    n = len(last.rounds)
    return Context(
        level=clamp_level(last.level),
        success=last.success,
        trend=trend,
        rt_log_ratio=rt_log_ratio,
        hint_rate=sum(r.hint_used for r in last.rounds) / n if n else 0.0,
        errors_per_round=_errors_per_round(last.rounds),
        stopped_early=not last.completed,
        days_since_last=max(0.0, gap),
        rounds=n,
    )


def success_reward(success: float) -> float:
    return float(np.clip(1.0 - abs(success - TARGET) / ZONE_HALF_WIDTH, -1.0, 1.0))


def reward(rounds: Sequence[Round], completed: bool) -> float:
    """Reward for the decision made before this session (see the module docstring)."""
    s = sum(r.correct for r in rounds) / len(rounds) if rounds else 0.0
    return success_reward(s) - (0.0 if completed else STOP_PENALTY)


def rule_action(ctx: Context) -> int:
    """What the rule engine does: nothing after a stopped-early session, else the 5-round rule."""
    if ctx.stopped_early or ctx.rounds < BLOCK_SIZE:
        return 0
    correct = round(ctx.success * BLOCK_SIZE)
    rounds = [Round(correct=i < correct, reaction_ms=None) for i in range(BLOCK_SIZE)]
    return rule_next_level(ctx.level, rounds) - ctx.level


def allowed_actions(ctx: Context) -> tuple[int, ...]:
    """Actions that keep the level in 1-10 and pass the guardrails."""
    allowed = []
    for a in ACTIONS:
        if not MIN_LEVEL <= ctx.level + a <= MAX_LEVEL:
            continue
        if a > 0 and (ctx.stopped_early or ctx.success <= 0.4):
            continue
        if a < 0 and not ctx.stopped_early and ctx.rounds >= BLOCK_SIZE and ctx.success >= 1.0:
            continue
        allowed.append(a)
    return tuple(allowed)


@dataclass(frozen=True)
class Decision:
    action: int
    source: Source  # "bandit", "rule" (the bandit was unsure) or "only" (one allowed action)
    uncertainty: float = 0.0


class Engine(ABC):
    name: str

    @abstractmethod
    def decide(self, ctx: Context) -> Decision: ...

    def learn(self, ctx: Context, action: int, reward: float) -> None:  # noqa: B027 - optional
        """Record the reward for `action` taken in `ctx`. The rule engine ignores it."""

    def next_level(self, current_level: int, recent_rounds: list[Round], context: Context | None = None) -> int:
        ctx = context if context is not None else context_from_rounds(current_level, recent_rounds)
        return clamp_level(clamp_level(current_level) + self.decide(ctx).action)


class RuleEngine(Engine):
    name = "rule"

    def decide(self, ctx: Context) -> Decision:
        return Decision(rule_action(ctx), "rule")


class FixedEngine(Engine):
    """Reference only: never changes the level (no adaptation)."""

    name = "fixed"

    def decide(self, ctx: Context) -> Decision:
        return Decision(0, "only")


class SafeBandit(Engine):
    """Shared safety wrapper; subclasses score the allowed actions."""

    def __init__(self, *, min_obs: int, max_uncertainty: float, seed: int = 0) -> None:
        self.min_obs = min_obs
        self.max_uncertainty = max_uncertainty
        self.rng = np.random.default_rng(seed)
        self.n_obs = 0

    @abstractmethod
    def choose(self, x: np.ndarray, allowed: tuple[int, ...]) -> tuple[int, float]:
        """(action, uncertainty of that action's estimate)."""

    @abstractmethod
    def update(self, x: np.ndarray, action: int, reward: float) -> None: ...

    def decide(self, ctx: Context) -> Decision:
        allowed = allowed_actions(ctx)
        if len(allowed) == 1:
            return Decision(allowed[0], "only")
        action, uncertainty = self.choose(ctx.features(), allowed)
        if self.n_obs < self.min_obs or uncertainty > self.max_uncertainty:
            fallback = rule_action(ctx)
            return Decision(fallback if fallback in allowed else 0, "rule", uncertainty)
        return Decision(action, "bandit", uncertainty)

    def learn(self, ctx: Context, action: int, reward: float) -> None:
        self.update(ctx.features(), action, reward)
        self.n_obs += 1


class _LinearArms:
    """Ridge regression per action, kept as A^-1 (Sherman-Morrison) and b."""

    def __init__(self, lam: float) -> None:
        self.a_inv = {a: np.eye(N_FEATURES) / lam for a in ACTIONS}
        self.b = {a: np.zeros(N_FEATURES) for a in ACTIONS}

    def theta(self, a: int) -> np.ndarray:
        return self.a_inv[a] @ self.b[a]

    def width(self, a: int, x: np.ndarray) -> float:
        return float(math.sqrt(max(0.0, x @ self.a_inv[a] @ x)))

    def update(self, x: np.ndarray, a: int, r: float) -> None:
        ai = self.a_inv[a]
        ax = ai @ x
        self.a_inv[a] = ai - np.outer(ax, ax) / (1.0 + x @ ax)
        self.b[a] = self.b[a] + r * x


class LinUCB(SafeBandit):
    """Disjoint LinUCB (Li et al., 2010): pick argmax of theta_a.x + alpha * sqrt(x' A_a^-1 x).
    Uncertainty = the chosen action's confidence width sqrt(x' A_a^-1 x)."""

    name = "linucb"

    def __init__(self, *, alpha: float = 0.1, lam: float = 1.0, min_obs: int = 200, max_uncertainty: float = 0.5,
                 seed: int = 0) -> None:
        super().__init__(min_obs=min_obs, max_uncertainty=max_uncertainty, seed=seed)
        self.alpha = alpha
        self.arms = _LinearArms(lam)

    def choose(self, x: np.ndarray, allowed: tuple[int, ...]) -> tuple[int, float]:
        scores = {a: float(self.arms.theta(a) @ x) + self.alpha * self.arms.width(a, x) for a in allowed}
        best = max(allowed, key=lambda a: (scores[a], a == 0))  # ties: stay
        return best, self.arms.width(best, x)

    def update(self, x: np.ndarray, action: int, reward: float) -> None:
        self.arms.update(x, action, reward)


class LinearThompson(SafeBandit):
    """Linear Thompson sampling (Agrawal & Goyal, 2013): sample theta_a ~ N(A^-1 b, v^2 A^-1)
    per action and pick the best sampled score. Uncertainty = the posterior standard deviation
    of the chosen action's expected reward, v * sqrt(x' A_a^-1 x)."""

    name = "thompson"

    def __init__(self, *, v: float = 0.1, lam: float = 1.0, min_obs: int = 200, max_uncertainty: float = 0.08,
                 seed: int = 0) -> None:
        super().__init__(min_obs=min_obs, max_uncertainty=max_uncertainty, seed=seed)
        self.v = v
        self.arms = _LinearArms(lam)

    def choose(self, x: np.ndarray, allowed: tuple[int, ...]) -> tuple[int, float]:
        scores: dict[int, float] = {}
        for a in allowed:
            mean = float(self.arms.theta(a) @ x)
            sd = self.v * self.arms.width(a, x)
            scores[a] = mean + sd * float(self.rng.standard_normal())
        best = max(allowed, key=lambda a: (scores[a], a == 0))
        return best, self.v * self.arms.width(best, x)

    def update(self, x: np.ndarray, action: int, reward: float) -> None:
        self.arms.update(x, action, reward)


def make_engine(name: str, seed: int = 0) -> Engine:
    """'rule', 'fixed', 'linucb', 'thompson' or 'neural' (needs PyTorch: ml/.venv)."""
    if name == "rule":
        return RuleEngine()
    if name == "fixed":
        return FixedEngine()
    if name == "linucb":
        return LinUCB(seed=seed)
    if name == "thompson":
        return LinearThompson(seed=seed)
    if name == "neural":
        from ml.adaptive.neural import NeuralBandit

        return NeuralBandit(seed=seed)
    raise ValueError(f"Unknown adaptive engine: {name}")
