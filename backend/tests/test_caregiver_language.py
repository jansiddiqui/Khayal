"""A caregiver's own screen language (Round 2 batch 5b), separate from each elder's language."""

from fastapi.testclient import TestClient

from tests.conftest import Register
from tests.test_reminders import Setup


def test_caregiver_picks_their_own_language(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    assert client.get("/api/auth/me", headers=s.cg).json()["language"] == "en"
    response = client.patch("/api/auth/me", json={"language": "hi"}, headers=s.cg)
    assert response.status_code == 200 and response.json()["language"] == "hi"
    assert client.get("/api/auth/me", headers=s.cg).json()["language"] == "hi"
    # The elder's app language is their own and doesn't change with it.
    assert client.get("/api/auth/me", headers=s.patient).json()["language"] == "en"
    # Caregiver screens are English or Hindi; elders can't use this.
    assert client.patch("/api/auth/me", json={"language": "ur"}, headers=s.cg).status_code == 422
    assert client.patch("/api/auth/me", json={"language": "hi"}, headers=s.patient).status_code == 403
