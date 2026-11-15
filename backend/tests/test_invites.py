"""'Request an invite' from the landing page (CLAUDE.md section 11, Phase A)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import InviteRequest, InviteRole, InviteStatus
from tests.conftest import Clock

VALID = {
    "name": "Anita Rao",
    "email": "Anita.Rao@Example.com",
    "role": "family",
    "city": "Pune",
    "message": "My father (78) forgets his tablets.",
    "consent": True,
}


def test_request_is_stored_with_consent_time(client: TestClient, db: Session, clock: Clock) -> None:
    response = client.post("/api/invites", json=VALID)
    assert response.status_code == 201 and response.json() == {"received": True}
    row = db.scalars(select(InviteRequest)).one()
    assert (row.name, row.email, row.role, row.city) == ("Anita Rao", "anita.rao@example.com", InviteRole.family, "Pune")
    assert row.status == InviteStatus.new
    assert row.consent_at is not None and row.message == VALID["message"]


@pytest.mark.parametrize(
    "change",
    [
        {"consent": False},
        {"consent": None},
        {"role": "patient"},
        {"email": "not-an-email"},
        {"name": "  "},
        {"city": ""},
        {"message": "x" * 1001},
    ],
)
def test_invalid_requests_are_refused(client: TestClient, db: Session, change: dict[str, object]) -> None:
    assert client.post("/api/invites", json={**VALID, **change}).status_code == 422
    assert db.scalars(select(InviteRequest)).all() == []


def test_optional_message_and_every_role(client: TestClient, db: Session) -> None:
    for i, role in enumerate(("family", "doctor", "care_home")):
        body = {**VALID, "email": f"p{i}@example.com", "role": role}
        body.pop("message")
        assert client.post("/api/invites", json=body).status_code == 201
    assert sorted(r.role.value for r in db.scalars(select(InviteRequest))) == ["care_home", "doctor", "family"]


def test_honeypot_is_thanked_but_not_stored(client: TestClient, db: Session) -> None:
    response = client.post("/api/invites", json={**VALID, "website": "http://spam.example"})
    assert response.status_code == 201 and response.json() == {"received": True}
    assert db.scalars(select(InviteRequest)).all() == []


def test_requests_are_rate_limited(client: TestClient) -> None:
    codes = [client.post("/api/invites", json={**VALID, "email": f"a{i}@example.com"}).status_code for i in range(6)]
    assert codes == [201] * 5 + [429]


def test_contact_email_comes_from_the_environment(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert client.get("/api/config").json()["contact_email"] is None
    monkeypatch.setattr(config, "CONTACT_EMAIL", "hello@khayal.example")
    assert client.get("/api/config").json()["contact_email"] == "hello@khayal.example"
