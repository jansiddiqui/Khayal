"""Delayed Word Recall scoring with known answers (more-games-rotation, item 5).

The delayed check is scored like every game: composite = accuracy × level / 10 × rt, at the level
the words were shown at (the last finished Remember the Words session's starting level). So a
perfect delayed check after a level-2 Remember the Words session scores 0.2, and half right 0.1:
low numbers by design at low levels, not a bug.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import Register, bearer
from tests.test_games import session_body


def delayed(pattern: str) -> dict[str, Any]:
    """One round per word shown earlier: 1 = picked (right). Same reaction time on every round,
    as the frontend sends it (the whole time spent on the check)."""
    body = session_body(pattern, "word_recall_delayed")
    for r in body["rounds"]:
        r["reaction_ms"] = 9000
        r["hint_used"] = False
    body["completed"] = True
    return body


def composites(client: TestClient, headers: dict[str, str], pid: int) -> list[float]:
    trend = client.get(f"/api/patients/{pid}/trend?game_type=word_recall_delayed", headers=headers).json()
    return [p["composite"] for p in trend["games"][0]["points"]]


@pytest.mark.parametrize(
    ("level_pattern", "level"),
    [("11111", 2), ("11111" * 1, 2)],
)
def test_perfect_and_half_delayed_checks(client: TestClient, register: Register, level_pattern: str, level: int) -> None:
    caregiver = bearer(register("Priya", "p@example.com", "caregiver"))
    payload = register("Islam", "i@example.com", "patient")
    patient = bearer(payload)
    pid = int(payload["user"]["id"])  # type: ignore[index]
    from tests.conftest import link_patient

    link_patient(client, "i@example.com", caregiver)
    # Remember the Words at the starting level 2 (5 words would be shown at higher levels; 4 here).
    assert client.post("/api/sessions", json=session_body(level_pattern, "word_recall"), headers=patient).status_code == 201
    perfect = client.post("/api/sessions", json=delayed("1111"), headers=patient).json()
    half = client.post("/api/sessions", json=delayed("1100"), headers=patient).json()
    assert perfect["session"]["level_start"] == level and half["session"]["level_start"] == level
    assert perfect["new_level"] == level  # the delayed check never changes a level
    assert composites(client, caregiver, pid) == pytest.approx([1.0 * level / 10, 0.5 * level / 10])


def test_scored_at_the_level_the_words_were_shown(client: TestClient, register: Register) -> None:
    payload = register("Islam", "i@example.com", "patient")
    patient = bearer(payload)
    caregiver = bearer(register("Priya", "p@example.com", "caregiver"))
    from tests.conftest import link_patient

    link_patient(client, "i@example.com", caregiver)
    for _ in range(3):  # 5/5 three times: level 2 -> 3 -> 4 -> 5
        client.post("/api/sessions", json=session_body("11111", "word_recall"), headers=patient)
    check = client.post("/api/sessions", json=delayed("11111"), headers=patient).json()
    # The last finished Remember the Words session started at level 4.
    assert check["session"]["level_start"] == 4
    assert composites(client, caregiver, int(payload["user"]["id"])) == pytest.approx([0.4])  # type: ignore[index]
