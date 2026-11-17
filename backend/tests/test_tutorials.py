"""Games v2: first-time tutorials and the per-round `errors` count (docs/games/research.md 3.4, D1)."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GameRound

from tests.conftest import Register, bearer, link_patient
from tests.test_games import session_body


def tutorial(client: TestClient, auth: dict[str, str], game_type: str = "memory_match") -> bool:
    response = client.get(f"/api/games/{game_type}/level", headers=auth)
    assert response.status_code == 200
    return bool(response.json()["tutorial"])


def test_tutorial_shows_once_and_a_caregiver_can_ask_for_it_again(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    caregiver = bearer(register("Ravi", "r@example.com", "caregiver"))
    link_patient(client, "k@example.com", caregiver)
    patient_id = client.get("/api/auth/me", headers=patient).json()["id"]

    assert tutorial(client, patient) is True
    assert client.post("/api/games/memory_match/tutorial-seen", headers=patient).status_code == 204
    assert tutorial(client, patient) is False
    # Other games still have theirs.
    assert tutorial(client, patient, "sequence_recall") is True

    # Only a linked caregiver can ask for it again; patients can't.
    assert client.post(f"/api/patients/{patient_id}/tutorials/memory_match/reset", headers=patient).status_code == 403
    assert client.post(f"/api/patients/{patient_id}/tutorials/memory_match/reset", headers=caregiver).status_code == 204
    assert tutorial(client, patient) is True
    client.post("/api/games/memory_match/tutorial-seen", headers=patient)
    assert tutorial(client, patient) is False


def test_patients_who_already_played_skip_the_tutorial(client: TestClient, register: Register) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    assert client.post("/api/sessions", json=session_body("11111", "sequence_recall"), headers=patient).status_code == 201
    assert tutorial(client, patient, "sequence_recall") is False


def test_rounds_store_errors(client: TestClient, register: Register, db: Session) -> None:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    body = session_body("11011")
    for i, r in enumerate(body["rounds"]):
        r["errors"] = i
    assert client.post("/api/sessions", json=body, headers=patient).status_code == 201
    assert sorted(db.scalars(select(GameRound.errors))) == [0, 1, 2, 3, 4]

    # Without the field, errors stay empty (games that don't count errors).
    assert client.post("/api/sessions", json=session_body("11111"), headers=patient).status_code == 201
    assert list(db.scalars(select(GameRound.errors).where(GameRound.errors.is_(None)))) == [None] * 5

    body["rounds"][0]["errors"] = -1
    assert client.post("/api/sessions", json=body, headers=patient).status_code == 422
