"""Overdue reminders ask, they never urge (CLAUDE.md section 6, "Overdue reminders")."""

from datetime import date, datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.services.clock import LOCAL_TZ
from tests.conftest import Clock, Register
from tests.test_reminders import Setup

TUE = date(2026, 11, 17)


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(TUE.year, TUE.month, TUE.day, hour, minute, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def add(s: Setup, title: str, hhmm: str, kind: str = "medicine", **extra: Any) -> int:
    body = {"title": title, "type": kind, "time_of_day": hhmm, "repeat": "daily", **extra}
    response = s.client.post(f"/api/patients/{s.pid}/reminders", json=body, headers=s.cg)
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def today(s: Setup) -> dict[str, dict[str, Any]]:
    return {r["title"]: r for r in s.today()}


def answer(s: Setup, rid: int, status: str, headers: dict[str, str] | None = None) -> Any:
    return s.client.post(f"/api/reminders/{rid}/log", json={"status": status}, headers=headers or s.patient)


def test_phases_upcoming_due_overdue(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(6)
    s = Setup(client, register)
    add(s, "Blood pressure tablet", "09:00")
    seen = []
    for hour, minute in ((8, 59), (9, 0), (9, 59), (10, 0), (21, 0)):
        clock.now = at(hour, minute)
        seen.append(today(s)["Blood pressure tablet"]["phase"])
    # "It's time for this" lasts one hour; after that the reminder only asks.
    assert seen == ["upcoming", "due", "due", "overdue", "overdue"]


def test_safe_late_window_is_for_medicine_only(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(6)
    s = Setup(client, register)
    add(s, "Tablet", "09:00", late_window_minutes=180)
    add(s, "Walk", "09:00", kind="other", late_window_minutes=180)
    listed = {r["title"]: r for r in client.get(f"/api/patients/{s.pid}/reminders", headers=s.cg).json()}
    assert (listed["Tablet"]["late_window_minutes"], listed["Walk"]["late_window_minutes"]) == (180, None)
    clock.now = at(11, 30)
    phases = {k: v["phase"] for k, v in today(s).items()}
    assert phases == {"Tablet": "due", "Walk": "overdue"}
    # Not counted as missed before its window has passed (2 hours of grace, or the window if longer).
    clock.now = at(11, 59)
    assert (today(s)["Tablet"]["phase"], today(s)["Tablet"]["status"]) == ("due", "pending")
    clock.now = at(12, 0)
    assert (today(s)["Tablet"]["phase"], today(s)["Tablet"]["status"]) == ("overdue", "missed")


def test_late_yes_is_confirmed_later(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(6)
    s = Setup(client, register)
    on_time = add(s, "Morning tablet", "09:00")
    later = add(s, "Evening tablet", "18:00")
    clock.now = at(9, 30)
    assert answer(s, on_time, "done").json()["today_late"] is False
    clock.now = at(21, 0)  # the 18:00 one is overdue (and already logged missed)
    done = answer(s, later, "done").json()
    assert (done["today_status"], done["today_late"]) == ("done", True)
    # The moment it was confirmed (Postgres may answer in another time zone: compare instants).
    confirmed = datetime.fromisoformat(done["today_logged_at"].replace("Z", "+00:00"))
    assert (confirmed if confirmed.tzinfo else confirmed.replace(tzinfo=timezone.utc)) == at(21)
    mine = today(s)["Evening tablet"]
    assert (mine["phase"], mine["late"]) == ("done", True)
    adherence = client.get(f"/api/patients/{s.pid}/reminders/adherence", headers=s.cg).json()
    assert (adherence["done_by_patient"], adherence["done_late"], adherence["rate"]) == (2, 1, 1.0)


def test_not_sure_tells_the_family_at_once(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(6)
    s = Setup(client, register)
    tablet = add(s, "Blood pressure tablet", "09:00")
    walk = add(s, "Walk", "07:00", kind="other")
    clock.now = at(8)
    assert answer(s, tablet, "unsure").status_code == 400  # its time has not come yet
    clock.now = at(10, 30)
    assert answer(s, tablet, "unsure", headers=s.cg).status_code == 403  # only the patient answers this
    first = answer(s, tablet, "unsure")
    assert first.status_code == 200 and first.json()["today_status"] == "unsure"
    answer(s, tablet, "unsure")  # asked twice: still one notice
    answer(s, walk, "unsure")

    alerts = s.alerts()
    notices = [a for a in alerts if a["type"] == "reminder_unsure"]
    assert {(a["severity"], a["message"]) for a in notices} == {
        ("info", 'Kamala wasn\'t sure about the 7:00 AM reminder "Walk". Please check with them.'),
        ("warning", 'Kamala wasn\'t sure about the 9:00 AM reminder "Blood pressure tablet". Please check with them.'),
    }
    assert len(notices) == 2
    assert all(a["type"] != "missed_reminders" for a in alerts)  # no waiting for the 3-missed rule
    assert today(s)["Blood pressure tablet"]["phase"] == "unsure"

    # A later "Yes, it's done" still counts, as confirmed later; the sweep never turns it into missed.
    assert answer(s, tablet, "done").json()["today_late"] is True
    clock.now = at(13)
    assert today(s)["Blood pressure tablet"]["phase"] == "done"
    assert answer(s, tablet, "unsure").status_code == 409
    adherence = client.get(f"/api/patients/{s.pid}/reminders/adherence", headers=s.cg).json()
    assert (adherence["unsure"], adherence["missed"]) == (1, 0)


def test_earlier_dose_hidden_once_the_next_dose_is_due(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(6)
    s = Setup(client, register)
    add(s, "Blood pressure tablet", "09:00")
    add(s, " blood pressure TABLET ", "21:00")  # the same medicine, written differently
    add(s, "Sugar tablet", "21:00")
    add(s, "Lunch", "13:00", kind="meal")
    clock.now = at(20, 59)
    assert set(today(s)) == {"blood pressure TABLET", "Blood pressure tablet", "Lunch", "Sugar tablet"}
    clock.now = at(21, 0)
    assert set(today(s)) == {"blood pressure TABLET", "Lunch", "Sugar tablet"}
    # The caregiver still sees both doses and their records.
    listed = [r["title"] for r in client.get(f"/api/patients/{s.pid}/reminders", headers=s.cg).json()]
    assert len(listed) == 4


def test_downgrade_turns_unsure_into_missed(tmp_path: Any) -> None:
    from alembic import command
    from sqlalchemy import create_engine, text

    from tests.test_migrations import alembic_config

    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    cfg = alembic_config(url)
    command.upgrade(cfg, "head")
    engine = create_engine(url)
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, name, role, created_at, voice_task_enabled, token_version, photos_enabled) "
                       "VALUES (1, 'K', 'patient', '2026-11-01', FALSE, 0, FALSE)"))
        c.execute(text("INSERT INTO reminders (id, patient_id, title, type, time_of_day, days_of_week, active, created_at, repeat) "
                       "VALUES (1, 1, 'T', 'medicine', '09:00:00', '[0,1,2,3,4,5,6]', TRUE, '2026-11-01', 'daily')"))
        c.execute(text("INSERT INTO reminder_logs (reminder_id, date, status, logged_at, late) VALUES (1, '2026-11-17', 'unsure', '2026-11-17', FALSE)"))
        c.execute(text("INSERT INTO alerts (patient_id, type, message, severity, created_at, acknowledged) "
                       "VALUES (1, 'reminder_unsure', 'x', 'warning', '2026-11-17', FALSE)"))
    command.downgrade(cfg, "0010")
    with engine.connect() as c:
        assert c.execute(text("SELECT status FROM reminder_logs")).scalar() == "missed"
        assert c.execute(text("SELECT type FROM alerts")).scalar() == "missed_reminders"
    engine.dispose()
