"""Games v2: every new levelled game stores sessions, adapts its level and shows up in the trend."""

import pytest
from fastapi.testclient import TestClient

from app.models import LEVELLED_GAMES, GameType
from ml.decline import simulator, zscore

from tests.conftest import Register, bearer, link_patient
from tests.test_games import session_body

NEW_LEVELLED = ["colour_trails", "clock_setting", "money_handling", "spatial_span", "object_location"]


@pytest.mark.parametrize("game", NEW_LEVELLED)
def test_new_game_adapts_and_trends(client: TestClient, register: Register, game: str) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    caregiver = bearer(register("Ravi", "r@example.com", "caregiver"))
    link_patient(client, "k@example.com", caregiver)
    patient_id = client.get("/api/auth/me", headers=patient).json()["id"]

    assert GameType(game) in LEVELLED_GAMES
    level = client.get(f"/api/games/{game}/level", headers=patient).json()
    assert level == {"game_type": game, "level": 2, "tutorial": True}

    body = session_body("11111", game)
    body["rounds"][0]["errors"] = 1
    result = client.post("/api/sessions", json=body, headers=patient).json()
    assert (result["level_change"], result["new_level"]) == ("up", 3)

    trend = client.get(f"/api/patients/{patient_id}/trend", params={"game_type": game}, headers=caregiver).json()
    assert [g["game_type"] for g in trend["games"]] == [game]
    assert trend["games"][0]["sessions"] == 1
    assert zscore.GAME_NAMES[game]  # the caregiver sees the clinical name


@pytest.mark.parametrize("game", NEW_LEVELLED)
def test_simulator_plays_new_games(game: str) -> None:
    assert game in simulator.LEVELLED
    assert game in simulator.BASE_RT_MS
    assert simulator.difficulty(game, 1) < simulator.difficulty(game, 10)
