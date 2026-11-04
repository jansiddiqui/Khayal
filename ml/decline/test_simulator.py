import csv
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from ml.decline.simulator import CSV_COLUMNS, LEVELLED, main, simulate, simulate_patient, to_rows
from ml.decline.zscore import assess

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_levels_move_only_through_the_adaptive_engine() -> None:
    sessions = simulate_patient(1, "mci", 90, np.random.default_rng(3), START)
    last_level: dict[str, int] = {}
    for s in sessions:
        if s.game_type == "daily_orientation":
            assert (s.level_start, s.level_end) == (1, 1)
            continue
        assert s.level_start == last_level.get(s.game_type, 2)  # every game starts at level 2
        assert 1 <= s.level_end <= 10
        assert abs(s.level_end - s.level_start) <= 1  # one change per 5-round block at most
        if not s.completed:
            assert s.level_end == s.level_start and len(s.rounds) < 5
        last_level[s.game_type] = s.level_end


def test_each_day_offers_about_today_plus_two_levelled_games() -> None:
    sessions = simulate_patient(1, "healthy", 30, np.random.default_rng(1), START)
    by_day: dict[int, list[str]] = defaultdict(list)
    for s in sessions:
        by_day[s.day].append(s.game_type)
    for games in by_day.values():
        assert games[0] == "daily_orientation"
        assert len(games) == 3 and set(games[1:]) <= set(LEVELLED)


def test_profiles_separate_on_the_real_decline_rule() -> None:
    statuses: dict[str, list[str]] = defaultdict(list)
    for seed in range(6):
        for profile in ("healthy", "moderate"):
            sessions = simulate_patient(seed, profile, 90, np.random.default_rng(seed), START)
            for game in LEVELLED:
                result = assess([s.summary() for s in sessions if s.game_type == game])
                statuses[profile].append(result.status)
    flagged = {p: sum(st in ("warning", "critical") for st in s) / len(s) for p, s in statuses.items()}
    assert flagged["healthy"] < 0.15
    assert flagged["moderate"] > 0.6


def test_same_seed_same_data() -> None:
    a = to_rows(simulate(3, 20, seed=7, start=START))
    b = to_rows(simulate(3, 20, seed=7, start=START))
    assert a == b


def test_cli_writes_the_stable_columns(tmp_path: Path) -> None:
    out = tmp_path / "sim.csv"
    main(["--patients", "3", "--days", "15", "--out", str(out), "--seed", "1"])
    with out.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == CSV_COLUMNS
        rows = list(reader)
    assert {r["profile"] for r in rows} == {"healthy", "mci", "moderate"}
    for r in rows:
        if r["completed"] == "0":
            assert r["composite"] == ""
        else:
            assert 0.0 <= float(r["composite"]) <= 1.5
