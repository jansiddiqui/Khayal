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


def test_delayed_word_recall_is_scored_at_the_level_the_words_were_shown(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    # Remember the Words: 2 -> 3 after a perfect session (the words were shown at level 2).
    assert client.post("/api/sessions", json=session_body("11111", "word_recall"), headers=patient).json()["new_level"] == 3

    body = session_body("110", "word_recall_delayed", completed=True)
    body["rounds"][0]["errors"] = 1  # a word picked that wasn't shown (false alarm)
    out = client.post("/api/sessions", json=body, headers=patient).json()
    assert (out["session"]["level_start"], out["new_level"], out["level_change"]) == (2, 2, "same")
    # It never moves Remember the Words' level.
    assert client.get("/api/games/word_recall/level", headers=patient).json()["level"] == 3

    # Up to 12 words; always complete.
    assert client.post("/api/sessions", json=session_body("1" * 8, "word_recall_delayed", completed=True), headers=patient).status_code == 201
    assert client.post("/api/sessions", json=session_body("110", "word_recall_delayed", completed=False), headers=patient).status_code == 422
    # Other games still have at most 5 rounds.
    assert client.post("/api/sessions", json=session_body("111111", "memory_match", completed=False), headers=patient).status_code == 422


def test_delayed_recall_counts_only_with_word_recall_in_the_core_set() -> None:
    from app.models import User
    from app.services import core_games

    patient = User(name="K", role="patient", core_games=[g.value for g in core_games.LEGACY_CORE])
    assert GameType.word_recall_delayed in core_games.tracked_games(patient)
    patient.core_games = ["memory_match", "sequence_recall", "reaction_tap", "colour_trails"]
    assert GameType.word_recall_delayed not in core_games.tracked_games(patient)
    assert GameType.word_recall_delayed not in LEVELLED_GAMES


def test_festivals_are_ticked_by_a_caregiver_and_add_one_about_today_round(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    caregiver = bearer(register("Ravi", "r@example.com", "caregiver"))
    link_patient(client, "k@example.com", caregiver)
    pid = client.get("/api/auth/me", headers=patient).json()["id"]

    # Off by default: no festivals until a caregiver ticks them.
    assert client.get("/api/auth/me", headers=patient).json()["festivals"] is None
    out = client.patch(f"/api/patients/{pid}", json={"festivals": ["diwali", "holi", "diwali"]}, headers=caregiver).json()
    assert out["festivals"] == ["diwali", "holi"]
    assert client.get("/api/auth/me", headers=patient).json()["festivals"] == ["diwali", "holi"]
    assert client.patch(f"/api/patients/{pid}", json={"festivals": ["not_a_festival"]}, headers=caregiver).status_code == 422
    assert client.patch(f"/api/patients/{pid}", json={"festivals": []}, headers=caregiver).json()["festivals"] is None

    # About Today: 5 rounds, or 6 with the festival question; other games stay at 5.
    six = session_body("111111", "daily_orientation", completed=True)
    assert client.post("/api/sessions", json=six, headers=patient).status_code == 201
    assert client.post("/api/sessions", json=session_body("11111", "daily_orientation"), headers=patient).status_code == 201
    assert client.post("/api/sessions", json=session_body("111111", "memory_match", completed=True), headers=patient).status_code == 422
