"""KHAYAL_ADAPTIVE_ENGINE: the rule engine stays the default; the bandit is opt-in and safe."""

import pytest
from fastapi.testclient import TestClient

from app import config

from tests.conftest import Register, bearer
from tests.test_games import level, session_body


def test_rule_engine_is_the_default() -> None:
    assert config.ADAPTIVE_ENGINE == "rule"


def test_bandit_engine_moves_at_most_one_level(
    client: TestClient, register: Register, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "ADAPTIVE_ENGINE", "bandit")
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    current = level(client, patient)
    for pattern in ["11111", "11111", "11110", "11100", "10000", "00000", "11111", "11110"]:
        result = client.post("/api/sessions", json=session_body(pattern), headers=patient).json()
        new = result["new_level"]
        assert abs(new - current) <= 1
        assert 1 <= new <= 10
        if pattern == "00000":
            assert new <= current  # never up after 0/5
        current = new
    assert level(client, patient) == current


def test_bandit_never_raises_after_stopping_early(
    client: TestClient, register: Register, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "ADAPTIVE_ENGINE", "bandit")
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    for _ in range(3):
        before = level(client, patient)
        result = client.post("/api/sessions", json=session_body("11"), headers=patient).json()
        assert result["new_level"] <= before


def test_bandit_leaves_unlevelled_games_alone(
    client: TestClient, register: Register, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "ADAPTIVE_ENGINE", "bandit")
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    result = client.post("/api/sessions", json=session_body("11111", "daily_orientation"), headers=patient).json()
    assert result["new_level"] == 1
