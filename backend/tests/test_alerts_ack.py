"""Acknowledging a group of alerts, or all of them (caregiver-polish)."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Alert, AlertType, Severity, User
from tests.conftest import Register, bearer, link_patient


def _alerts(db: Session, patient_id: int, n: int) -> list[int]:
    rows = [
        Alert(
            patient_id=patient_id, type=AlertType.decline, severity=Severity.warning,
            message=f"Word Recall average dropped (z = -1.{i}).", created_at=datetime(2026, 11, 1 + i, tzinfo=timezone.utc),
        )
        for i in range(n)
    ]
    db.add_all(rows)
    db.commit()
    return [r.id for r in rows]


def test_acknowledge_a_group_then_all(client: TestClient, register: Register, db: Session) -> None:
    caregiver = bearer(register("Ravi", "r@example.com", "caregiver"))
    kamala = register("Kamala", "k@example.com", "patient")["user"]["id"]  # type: ignore[index]
    other = register("Shanti", "s@example.com", "patient")["user"]["id"]  # type: ignore[index]
    link_patient(client, "k@example.com", caregiver)
    ids = _alerts(db, kamala, 4)
    foreign = _alerts(db, other, 1)

    assert client.post(f"/api/patients/{kamala}/alerts/ack", json={"ids": ids[:2]}, headers=caregiver).json() == {"acknowledged": 2}
    # Another patient's alert can't ride along, and an unlinked patient is refused.
    assert client.post(f"/api/patients/{kamala}/alerts/ack", json={"ids": [ids[2], *foreign]}, headers=caregiver).status_code == 404
    assert client.post(f"/api/patients/{other}/alerts/ack", json={}, headers=caregiver).status_code == 403

    assert client.post(f"/api/patients/{kamala}/alerts/ack", json={}, headers=caregiver).json() == {"acknowledged": 2}
    listed = client.get(f"/api/patients/{kamala}/alerts", headers=caregiver).json()
    assert all(a["acknowledged"] for a in listed)
    assert db.get(Alert, foreign[0]).acknowledged is False  # type: ignore[union-attr]
    assert db.get(User, other) is not None
