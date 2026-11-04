from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.services.clock import LOCAL_TZ
from tests.conftest import Clock, Register, bearer

WED = date(2026, 11, 4)  # a Wednesday
EVERY_DAY = list(range(7))


def at(day: date, hour: int, minute: int = 0) -> datetime:
    """Local wall-clock time as UTC."""
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


class Setup:
    def __init__(self, client: TestClient, register: Register) -> None:
        self.client = client
        self.cg = bearer(register("Priya", "p@example.com", "caregiver"))
        payload = register("Kamala", "k@example.com", "patient")
        self.patient = bearer(payload)
        self.pid: int = payload["user"]["id"]  # type: ignore[index]
        client.post("/api/patients/link", json={"patient_email": "k@example.com"}, headers=self.cg)

    def add(self, title: str, hhmm: str, days: list[int] = EVERY_DAY, kind: str = "medicine", **extra: Any) -> int:
        body = {"title": title, "type": kind, "time_of_day": hhmm, "days_of_week": days, **extra}
        response = self.client.post(f"/api/patients/{self.pid}/reminders", json=body, headers=self.cg)
        assert response.status_code == 201, response.text
        return int(response.json()["id"])

    def today(self) -> list[dict[str, Any]]:
        response = self.client.get("/api/me/reminders/today", headers=self.patient)
        assert response.status_code == 200
        return list(response.json())

    def alerts(self) -> list[dict[str, Any]]:
        return list(self.client.get(f"/api/patients/{self.pid}/alerts", headers=self.cg).json())


def test_caregiver_crud(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 8)
    s = Setup(client, register)
    rid = s.add("Blood pressure tablet", "09:00", [4, 0, 0])
    listed = client.get(f"/api/patients/{s.pid}/reminders", headers=s.cg).json()
    assert listed[0]["days_of_week"] == [0, 4]  # sorted, de-duplicated
    assert listed[0]["time_of_day"] == "09:00:00"
    assert listed[0]["today_status"] is None  # not scheduled on Wednesday

    body = {"title": "BP tablet", "type": "medicine", "time_of_day": "08:30", "days_of_week": EVERY_DAY, "active": True}
    updated = client.put(f"/api/patients/{s.pid}/reminders/{rid}", json=body, headers=s.cg).json()
    assert (updated["title"], updated["today_status"]) == ("BP tablet", "pending")

    assert client.delete(f"/api/patients/{s.pid}/reminders/{rid}", headers=s.cg).status_code == 204
    assert client.get(f"/api/patients/{s.pid}/reminders", headers=s.cg).json() == []


def test_reminder_validation(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    url = f"/api/patients/{s.pid}/reminders"
    good = {"title": "Lunch", "type": "meal", "time_of_day": "13:00", "days_of_week": [0]}
    for bad in (
        good | {"title": " "},
        good | {"type": "nap"},
        good | {"time_of_day": "25:00"},
        good | {"days_of_week": []},
        good | {"days_of_week": [7]},
    ):
        assert client.post(url, json=bad, headers=s.cg).status_code == 422, bad


def test_access_rules(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    rid = s.add("Lunch", "13:00", kind="meal")
    stranger = bearer(register("Sam", "s@example.com", "caregiver"))
    other_patient = bearer(register("Rahim", "r@example.com", "patient"))
    url = f"/api/patients/{s.pid}/reminders"
    body = {"title": "x", "type": "meal", "time_of_day": "13:00", "days_of_week": [0]}

    assert client.post(url, json=body, headers=s.patient).status_code == 403  # patients can't edit
    assert client.post(url, json=body, headers=stranger).status_code == 403
    assert client.get(url, headers=other_patient).status_code == 403
    assert client.get(url, headers=s.patient).status_code == 200  # own list
    assert client.delete(f"{url}/{rid}", headers=stranger).status_code == 403
    assert client.post(f"/api/reminders/{rid}/log", json={}, headers=other_patient).status_code == 403
    assert client.post(f"/api/patients/{s.pid}/alerts", headers=s.cg).status_code == 405
    assert client.get("/api/me/reminders/today", headers=s.cg).status_code == 403


def test_today_list_and_done(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 7)
    s = Setup(client, register)
    tablet = s.add("Blood pressure tablet", "09:00")
    s.add("Lunch", "13:00", kind="meal")
    s.add("Friday doctor", "11:30", [4], kind="appointment")
    s.add("Paused", "10:00", active=False)

    clock.now = at(WED, 9, 5)
    today = s.today()
    assert [(r["title"], r["status"], r["due"]) for r in today] == [
        ("Blood pressure tablet", "pending", True),
        ("Lunch", "pending", False),
    ]

    done = client.post(f"/api/reminders/{tablet}/log", json={"status": "done"}, headers=s.patient)
    assert done.status_code == 200
    assert done.json()["today_status"] == "done"
    assert s.today()[0]["status"] == "done"


def test_unmarked_reminder_becomes_missed_after_grace(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 7)
    s = Setup(client, register)
    tablet = s.add("Blood pressure tablet", "09:00")

    clock.now = at(WED, 10, 59)  # within 2 hours
    assert s.today()[0]["status"] == "pending"
    clock.now = at(WED, 11, 1)
    assert s.today()[0]["status"] == "missed"

    # Done late still counts as done.
    client.post(f"/api/reminders/{tablet}/log", json={}, headers=s.patient)
    assert s.today()[0]["status"] == "done"


def test_occurrences_before_creation_are_not_missed(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 12)
    s = Setup(client, register)
    s.add("Blood pressure tablet", "09:00")  # created after today's 9:00
    clock.now = at(WED, 23)
    assert s.today()[0]["status"] == "pending"
    clock.now = at(WED + timedelta(days=1), 12)
    assert s.today()[0]["status"] == "missed"


def test_cannot_log_a_reminder_not_scheduled_today(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 8)
    s = Setup(client, register)
    friday = s.add("Friday doctor", "11:30", [4], kind="appointment")
    assert client.post(f"/api/reminders/{friday}/log", json={}, headers=s.patient).status_code == 400
    assert client.post("/api/reminders/999/log", json={}, headers=s.patient).status_code == 404


def test_three_missed_in_48_hours_raises_one_warning(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 6)
    s = Setup(client, register)
    s.add("Blood pressure tablet", "09:00")
    s.add("Lunch", "13:00", kind="meal")

    clock.now = at(WED, 16)  # 2 missed so far
    assert s.alerts() == []

    clock.now = at(WED + timedelta(days=1), 11, 30)  # Thursday's tablet is the 3rd
    alerts = s.alerts()
    assert len(alerts) == 1
    assert alerts[0]["type"] == "missed_reminders"
    assert alerts[0]["severity"] == "warning"
    assert alerts[0]["acknowledged"] is False
    assert "missed 3 reminders" in alerts[0]["message"]

    clock.now = at(WED + timedelta(days=1), 16)  # 4th missed: no duplicate within 48 h
    assert len(s.alerts()) == 1


def test_missed_outside_48_hours_do_not_count(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 6)
    s = Setup(client, register)
    rid = s.add("Blood pressure tablet", "09:00")
    clock.now = at(WED, 12)
    s.today()  # Wednesday missed
    clock.now = at(WED + timedelta(days=1), 12)
    s.today()  # Thursday missed
    clock.now = at(WED + timedelta(days=2), 8)
    client.post(f"/api/reminders/{rid}/log", json={}, headers=s.patient)  # Friday done
    clock.now = at(WED + timedelta(days=3), 12)  # Saturday missed; Wednesday's is now > 48 h old
    assert s.alerts() == []


def test_caregiver_acknowledges_alert(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 6)
    s = Setup(client, register)
    for hhmm in ("07:00", "08:00", "09:00"):
        s.add(f"Tablet {hhmm}", hhmm)
    clock.now = at(WED, 12)
    alert_id = s.alerts()[0]["id"]

    assert client.post(f"/api/alerts/{alert_id}/ack", headers=s.patient).status_code == 403
    stranger = bearer(register("Sam", "s@example.com", "caregiver"))
    assert client.post(f"/api/alerts/{alert_id}/ack", headers=stranger).status_code == 403
    acked = client.post(f"/api/alerts/{alert_id}/ack", headers=s.cg)
    assert acked.status_code == 200
    assert acked.json()["acknowledged"] is True
    assert s.alerts()[0]["acknowledged"] is True


def test_marked_by_and_adherence(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 6)
    s = Setup(client, register)
    tablet = s.add("Blood pressure tablet", "09:00")
    lunch = s.add("Lunch", "13:00", kind="meal")
    s.add("Walk", "07:00", kind="other")

    clock.now = at(WED, 14)
    client.post(f"/api/reminders/{tablet}/log", json={}, headers=s.patient)
    by_cg = client.post(f"/api/reminders/{lunch}/log", json={}, headers=s.cg).json()
    assert (by_cg["today_status"], by_cg["today_marked_by"]) == ("done", "caregiver")
    # The walk (07:00) was never marked, so it is missed by now.

    listed = {r["title"]: r for r in client.get(f"/api/patients/{s.pid}/reminders", headers=s.cg).json()}
    assert listed["Blood pressure tablet"]["today_marked_by"] == "patient"
    assert listed["Lunch"]["today_marked_by"] == "caregiver"
    assert (listed["Walk"]["today_status"], listed["Walk"]["today_marked_by"]) == ("missed", None)

    adherence = client.get(f"/api/patients/{s.pid}/reminders/adherence", headers=s.cg).json()
    assert adherence == {"days": 7, "done_by_patient": 1, "done_by_caregiver": 1, "missed": 1, "rate": 1 / 3}

    # The patient still sees a caregiver-marked reminder as simply done.
    assert {r["title"]: r["status"] for r in s.today()}["Lunch"] == "done"

    # A patient's own Done later replaces the caregiver's mark.
    client.post(f"/api/reminders/{lunch}/log", json={}, headers=s.patient)
    assert client.get(f"/api/patients/{s.pid}/reminders/adherence", headers=s.cg).json()["done_by_patient"] == 2


def test_adherence_with_nothing_finished_and_bad_days(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(WED, 6)
    s = Setup(client, register)
    s.add("Lunch", "13:00", kind="meal")
    url = f"/api/patients/{s.pid}/reminders/adherence"
    assert client.get(url, headers=s.cg).json()["rate"] is None
    assert client.get(url, params={"days": 0}, headers=s.cg).status_code == 422
    stranger = bearer(register("Sam", "s@example.com", "caregiver"))
    assert client.get(url, headers=stranger).status_code == 403
