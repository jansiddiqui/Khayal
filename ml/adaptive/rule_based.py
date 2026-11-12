"""Rule-based adaptive difficulty (CLAUDE.md section 6).

Levels run 1-10 per game per patient, starting at 2. After every block of 5 rounds
the success rate `s` over that block decides the next level:

    s >= 0.85  -> level + 1
    s <  0.55  -> level - 1
    otherwise  -> stay            (target zone is roughly 60-80% success)

A session is exactly one block of 5 rounds, so the level changes at most once per
session. The RL version (contextual bandit / DQN) will implement the same
`next_level` signature.
"""

from collections.abc import Sequence
from dataclasses import dataclass

MIN_LEVEL = 1
MAX_LEVEL = 10
START_LEVEL = 2
BLOCK_SIZE = 5
LEVEL_UP_AT = 0.85
LEVEL_DOWN_BELOW = 0.55


@dataclass(frozen=True)
class Round:
    correct: bool
    reaction_ms: int | None
    hint_used: bool = False
    # How long the patient looked before playing (Memory Match preview, Word Recall words).
    # Stored for the decline analysis; the adaptive rule ignores it.
    study_ms: int | None = None


def clamp_level(level: int) -> int:
    return max(MIN_LEVEL, min(MAX_LEVEL, level))


def success_rate(rounds: Sequence[Round]) -> float:
    if not rounds:
        raise ValueError("success_rate needs at least one round")
    return sum(r.correct for r in rounds) / len(rounds)


def next_level(current_level: int, recent_rounds: list[Round]) -> int:
    """Level to use next, given the rounds played at `current_level`.

    Only the last `BLOCK_SIZE` rounds count. With fewer than a full block the
    level stays the same (clamped to 1-10).
    """
    level = clamp_level(current_level)
    if len(recent_rounds) < BLOCK_SIZE:
        return level

    s = success_rate(recent_rounds[-BLOCK_SIZE:])
    if s >= LEVEL_UP_AT:
        level += 1
    elif s < LEVEL_DOWN_BELOW:
        level -= 1
    return clamp_level(level)
