import pytest

from ml.adaptive.rule_based import START_LEVEL, Round, next_level, success_rate


def rounds(pattern: str) -> list[Round]:
    """'11010' -> five rounds, 1 = correct."""
    return [Round(correct=c == "1", reaction_ms=1000) for c in pattern]


def test_start_level_is_two() -> None:
    assert START_LEVEL == 2


@pytest.mark.parametrize(
    ("pattern", "expected"),
    [
        ("11111", 6),  # 1.0  -> up
        ("11110", 5),  # 0.8  -> stay (target zone)
        ("11100", 5),  # 0.6  -> stay
        ("11000", 4),  # 0.4  -> down
        ("00000", 4),  # 0.0  -> down
    ],
)
def test_thresholds(pattern: str, expected: int) -> None:
    assert next_level(5, rounds(pattern)) == expected


def test_clamps_at_bounds() -> None:
    assert next_level(10, rounds("11111")) == 10
    assert next_level(1, rounds("00000")) == 1
    assert next_level(42, rounds("11100")) == 10
    assert next_level(0, rounds("11100")) == 1


def test_needs_a_full_block_of_five() -> None:
    assert next_level(3, rounds("1111")) == 3
    assert next_level(3, []) == 3


def test_only_last_five_rounds_count() -> None:
    # Old failures are ignored; the last five are all correct.
    assert next_level(3, rounds("00000" + "11111")) == 4


def test_hints_do_not_change_the_rule() -> None:
    hinted = [Round(correct=True, reaction_ms=900, hint_used=True) for _ in range(5)]
    assert next_level(4, hinted) == 5


def test_success_rate() -> None:
    assert success_rate(rounds("11010")) == pytest.approx(0.6)
    with pytest.raises(ValueError):
        success_rate([])
