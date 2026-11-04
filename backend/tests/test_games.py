from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import Register, bearer


def session_body(pattern: str, game_type: str = "memory_match") -> dict[str, Any]:
    """'11110' -> a 5-round session, 1 = correct."""
    return {
        "game_type": game_type,
        "started_at": "2026-11-04T10:00:00Z",
        "ended_at": "2026-11-04T10:05:00Z",
        "rounds": [{"correct": c == "1", "reaction_ms": 1000 + i * 100, "hint_used": i == 0} for i, c in enumerate(pattern)],
    }


def level(client: TestClient, auth: dict[str, str], game_type: str = "memory_match") -> int:
    response = client.get(f"/api/games/{game_type}/level", headers=auth)
    assert response.status_code == 200
    return int(response.json()["level"])


def test_new_patient_starts_at_level_two(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    assert level(client, patient) == 2
    assert level(client, patient, "sequence_recall") == 2


def test_session_stores_rounds_and_adapts_level(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))

    up = client.post("/api/sessions", json=session_body("11111"), headers=patient)
    assert up.status_code == 201
    result = up.json()
    assert result["level_change"] == "up"
    assert result["new_level"] == 3
    session = result["session"]
    assert (session["level_start"], session["level_end"]) == (2, 3)
    assert session["rounds_played"] == 5
    assert session["rounds_correct"] == 5
    assert session["avg_reaction_ms"] == 1200
    assert session["hints_used"] == 1

    # Level persists between sessions.
    assert level(client, patient) == 3

    same = client.post("/api/sessions", json=session_body("11100"), headers=patient).json()
    assert (same["level_change"], same["new_level"]) == ("same", 3)

    down = client.post("/api/sessions", json=session_body("10000"), headers=patient).json()
    assert (down["level_change"], down["new_level"]) == ("down", 2)


def test_levels_are_per_game(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    client.post("/api/sessions", json=session_body("11111", "sequence_recall"), headers=patient)
    assert level(client, patient, "sequence_recall") == 3
    assert level(client, patient, "memory_match") == 2


def test_level_floor_is_one(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    for _ in range(3):
        client.post("/api/sessions", json=session_body("00000"), headers=patient)
    assert level(client, patient) == 1


def test_short_session_keeps_level(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    result = client.post("/api/sessions", json=session_body("111"), headers=patient).json()
    assert (result["level_change"], result["new_level"]) == ("same", 2)


def test_session_validation(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    too_many = session_body("111111")
    no_rounds = session_body("")
    bad_game = session_body("11111", "chess")
    backwards = session_body("11111") | {"ended_at": "2026-11-04T09:00:00Z"}
    negative = session_body("11111")
    negative["rounds"][0]["reaction_ms"] = -5
    for body in (too_many, no_rounds, bad_game, backwards, negative):
        assert client.post("/api/sessions", json=body, headers=patient).status_code == 422


def test_only_patients_play(client: TestClient, register: Register) -> None:
    caregiver = bearer(register("Priya", "p@example.com", "caregiver"))
    assert client.get("/api/games/memory_match/level", headers=caregiver).status_code == 403
    assert client.post("/api/sessions", json=session_body("11111"), headers=caregiver).status_code == 403
    assert client.post("/api/sessions", json=session_body("11111")).status_code == 401


def test_session_history_access(client: TestClient, register: Register) -> None:
    kamala_payload = register("Kamala", "k@example.com", "patient")
    kamala = bearer(kamala_payload)
    kamala_id = kamala_payload["user"]["id"]  # type: ignore[index]
    rahim = bearer(register("Rahim", "r@example.com", "patient"))
    linked = bearer(register("Priya", "p@example.com", "caregiver"))
    stranger = bearer(register("Sam", "s@example.com", "caregiver"))
    client.post("/api/patients/link", json={"patient_email": "k@example.com"}, headers=linked)

    client.post("/api/sessions", json=session_body("11111"), headers=kamala)
    client.post("/api/sessions", json=session_body("11100", "sequence_recall"), headers=kamala)

    url = f"/api/patients/{kamala_id}/sessions"
    own = client.get(url, headers=kamala)
    assert own.status_code == 200
    assert len(own.json()) == 2

    by_caregiver = client.get(url, headers=linked).json()
    assert {s["game_type"] for s in by_caregiver} == {"memory_match", "sequence_recall"}
    filtered = client.get(url, params={"game_type": "memory_match"}, headers=linked).json()
    assert [(s["level_start"], s["level_end"]) for s in filtered] == [(2, 3)]

    assert client.get(url, headers=rahim).status_code == 403
    assert client.get(url, headers=stranger).status_code == 403
