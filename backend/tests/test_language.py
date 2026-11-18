"""The elder's app language and the read-aloud voice report (Round 2 batch 5)."""

from fastapi.testclient import TestClient

from tests.conftest import Clock, Register, bearer
from tests.test_reminders import Setup


def patient(client: TestClient, s: Setup) -> dict[str, object]:
    return dict(next(p for p in client.get("/api/patients", headers=s.cg).json() if p["id"] == s.pid))


def test_caregiver_sets_the_language_and_the_device_reports_its_voice(client: TestClient, register: Register, clock: Clock) -> None:
    s = Setup(client, register)
    assert client.get("/api/auth/me", headers=s.patient).json()["language"] == "en"
    assert client.patch(f"/api/patients/{s.pid}", json={"language": "ur"}, headers=s.cg).status_code == 200
    assert client.get("/api/auth/me", headers=s.patient).json()["language"] == "ur"
    assert client.patch(f"/api/patients/{s.pid}", json={"language": "fr"}, headers=s.cg).status_code == 422

    report = {"lang": "ur", "voice": "Google हिन्दी", "using": "hi"}
    assert client.post("/api/me/voice-check", json=report, headers=s.patient).status_code == 204
    check = patient(client, s)["voice_check"]
    assert isinstance(check, dict)
    assert (check["lang"], check["voice"], check["using"]) == ("ur", "Google हिन्दी", "hi")
    # Caregivers don't report voices; a new language asks the device to check again.
    assert client.post("/api/me/voice-check", json=report, headers=s.cg).status_code == 403
    client.patch(f"/api/patients/{s.pid}", json={"language": "hi"}, headers=s.cg)
    assert patient(client, s)["voice_check"] is None
    titles = [e["title"] for e in client.get(f"/api/patients/{s.pid}/timeline?kinds=settings", headers=s.cg).json()]
    assert "App language set to Hindi" in titles and "App language set to Urdu" in titles
    other = bearer(register("Meera", "m@example.com", "caregiver"))
    assert client.patch(f"/api/patients/{s.pid}", json={"language": "en"}, headers=other).status_code == 403
