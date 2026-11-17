"""Reminder schedules: once / every day / on some days, with start and end dates (app local clock, IST)."""

import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.models import Reminder, ReminderRepeat
from app.services import reminders
from app.services.clock import LOCAL_TZ
from tests.conftest import Clock, Register
from tests.test_migrations import alembic_config, database_url  # noqa: F401  (fixture)
from tests.test_reminders import Setup

MON = date(2026, 11, 16)  # a Monday
TUE, WED, THU, FRI, SAT, SUN = (MON + timedelta(days=n) for n in range(1, 7))


def at(day: date, hour: int, minute: int = 0) -> datetime:
    """Local (IST) wall-clock time as UTC."""
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def add(s: Setup, title: str, hhmm: str, kind: str = "other", **schedule: Any) -> dict[str, Any]:
    body = {"title": title, "type": kind, "time_of_day": hhmm, **schedule}
    response = s.client.post(f"/api/patients/{s.pid}/reminders", json=body, headers=s.cg)
    assert response.status_code == 201, response.text
    return dict(response.json())


def titles_today(s: Setup) -> list[str]:
    return [r["title"] for r in s.today()]


def listed(s: Setup) -> dict[str, dict[str, Any]]:
    return {r["title"]: r for r in s.client.get(f"/api/patients/{s.pid}/reminders", headers=s.cg).json()}


# --- the rule itself --------------------------------------------------------------------------


def _r(repeat: ReminderRepeat, **kw: Any) -> Reminder:
    return Reminder(title="x", time_of_day=time(9), repeat=repeat, days_of_week=kw.pop("days", []), **kw)


def test_scheduled_on_for_each_repeat_type() -> None:
    once = _r(ReminderRepeat.once, on_date=WED)
    assert [reminders.scheduled_on(once, d) for d in (TUE, WED, THU)] == [False, True, False]

    daily = _r(ReminderRepeat.daily, days=list(range(7)), start_date=TUE, end_date=THU)
    assert [reminders.scheduled_on(daily, d) for d in (MON, TUE, WED, THU, FRI)] == [False, True, True, True, False]

    some = _r(ReminderRepeat.weekly_days, days=[0, 2, 4], start_date=TUE, end_date=FRI)
    assert [reminders.scheduled_on(some, d) for d in (MON, TUE, WED, THU, FRI, SAT)] == [False, False, True, False, True, False]

    forever = _r(ReminderRepeat.weekly_days, days=[0])  # old reminders: no start, no end
    assert reminders.scheduled_on(forever, MON + timedelta(days=700))
    assert reminders.last_day(forever) is None and not reminders.is_past(forever, MON + timedelta(days=700))


def test_past_starts_the_day_after_the_last_day() -> None:
    once = _r(ReminderRepeat.once, on_date=WED)
    assert (reminders.is_past(once, WED), reminders.is_past(once, THU)) == (False, True)
    ending = _r(ReminderRepeat.daily, days=list(range(7)), start_date=MON, end_date=FRI)
    assert (reminders.is_past(ending, FRI), reminders.is_past(ending, SAT)) == (False, True)


# --- through the API --------------------------------------------------------------------------


def test_once_shows_only_on_its_day_and_then_moves_to_past(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(MON, 10)
    s = Setup(client, register)
    made = add(s, "Dr. Mehta", "11:30", "appointment", repeat="once", on_date=WED.isoformat())
    assert (made["repeat"], made["on_date"], made["days_of_week"], made["start_date"], made["past"]) == ("once", "2026-11-18", [], None, False)

    for day, shown in ((MON, False), (TUE, False), (WED, True), (THU, False)):
        clock.now = at(day, 8)
        assert titles_today(s) == (["Dr. Mehta"] if shown else [])
    assert listed(s)["Dr. Mehta"]["past"] is True  # Thursday: kept, under "Past reminders"


def test_daily_and_some_days_respect_start_and_end(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(MON, 7)
    s = Setup(client, register)
    daily = add(s, "Tablet", "09:00", "medicine", repeat="daily", start_date=TUE.isoformat(), end_date=THU.isoformat())
    assert daily["days_of_week"] == list(range(7))
    add(s, "Walk", "18:00", repeat="weekly_days", days_of_week=[4, 0, 2, 2], end_date=WED.isoformat())

    seen = {}
    for day in (MON, TUE, WED, THU, FRI):
        clock.now = at(day, 7)
        seen[day.strftime("%a")] = titles_today(s)
    assert seen == {"Mon": ["Walk"], "Tue": ["Tablet"], "Wed": ["Tablet", "Walk"], "Thu": ["Tablet"], "Fri": []}
    after = listed(s)
    assert after["Walk"]["days_of_week"] == [0, 2, 4] and after["Walk"]["start_date"] == "2026-11-16"  # starts today by default
    assert (after["Walk"]["past"], after["Tablet"]["past"]) == (True, True)


def test_days_change_at_local_midnight_not_utc(client: TestClient, register: Register, clock: Clock) -> None:
    """IST is UTC+5:30: 23:30 Tuesday and 00:30 Wednesday in India are the same UTC day."""
    clock.now = at(MON, 9)
    s = Setup(client, register)
    add(s, "Eye drops", "08:00", repeat="once", on_date=WED.isoformat())
    add(s, "Lunch", "13:00", "meal", repeat="daily", end_date=TUE.isoformat())
    late_tuesday, early_wednesday = at(TUE, 23, 30), at(WED, 0, 30)
    assert late_tuesday.date() == early_wednesday.date()  # same UTC date

    clock.now = late_tuesday
    assert titles_today(s) == ["Lunch"]
    assert listed(s)["Lunch"]["past"] is False
    clock.now = early_wednesday
    assert titles_today(s) == ["Eye drops"]
    assert listed(s)["Lunch"]["past"] is True


def test_missed_detection_and_alert_work_for_every_type(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(MON, 6)
    s = Setup(client, register)
    once = add(s, "Blood test", "07:00", "appointment", repeat="once", on_date=MON.isoformat())
    add(s, "Tablet", "08:00", "medicine", repeat="daily")
    add(s, "Walk", "09:00", repeat="weekly_days", days_of_week=[0])
    clock.now = at(MON, 8, 30)
    assert {r["status"] for r in s.today()} == {"pending"}
    assert s.alerts() == []

    clock.now = at(MON, 11, 30)  # 2 hours of grace have passed for all three
    assert {r["title"]: r["status"] for r in s.today()} == {"Blood test": "missed", "Tablet": "missed", "Walk": "missed"}
    alerts = s.alerts()
    assert [(a["type"], a["severity"]) for a in alerts] == [("missed_reminders", "warning")]
    assert "missed 3 reminders" in alerts[0]["message"]

    # The one-time reminder is not counted again on later days, and stays with its history.
    clock.now = at(WED, 12)
    assert listed(s)["Blood test"]["past"] is True
    assert client.get(f"/api/patients/{s.pid}/reminders/adherence?days=7", headers=s.cg).json()["missed"] == 1 + 3 + 1  # Mon x3, Tue + Wed tablet
    assert client.delete(f"/api/patients/{s.pid}/reminders/{once['id']}", headers=s.cg).status_code == 204
    assert "Blood test" not in listed(s)


def test_done_only_on_days_it_applies(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(MON, 8)
    s = Setup(client, register)
    once = add(s, "Call Rahul", "20:00", repeat="once", on_date=TUE.isoformat())
    assert client.post(f"/api/reminders/{once['id']}/log", json={}, headers=s.patient).status_code == 400
    clock.now = at(TUE, 20, 5)
    assert client.post(f"/api/reminders/{once['id']}/log", json={}, headers=s.patient).json()["today_status"] == "done"


def test_validation_of_schedules(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(TUE, 18)
    s = Setup(client, register)
    url = f"/api/patients/{s.pid}/reminders"

    def post(**body: Any) -> Any:
        return client.post(url, json={"title": "X", "type": "other", "time_of_day": "19:00", **body}, headers=s.cg)

    assert post(repeat="once").status_code == 422  # no date
    assert post(repeat="weekly_days", days_of_week=[]).status_code == 422  # no days
    assert post(repeat="daily", start_date=WED.isoformat(), end_date=TUE.isoformat()).status_code == 422
    assert post(repeat="daily", end_date=MON.isoformat()).status_code == 422  # ends before today (its default start)
    # One-time reminders can't be in the past: yesterday, or today at an earlier time.
    assert post(repeat="once", on_date=MON.isoformat()).status_code == 422
    past = post(repeat="once", on_date=TUE.isoformat(), time_of_day="17:59")
    assert (past.status_code, past.json()["detail"]) == (422, "Pick a date and time that have not passed yet.")
    made = post(repeat="once", on_date=TUE.isoformat(), time_of_day="18:30")
    assert made.status_code == 201
    # Fields that don't apply are cleared.
    assert post(repeat="once", on_date=WED.isoformat(), days_of_week=[1], start_date=MON.isoformat()).json()["start_date"] is None
    assert post(repeat="daily", on_date=WED.isoformat()).json()["on_date"] is None

    # Editing a reminder whose time has passed is fine as long as its date and time stay the same.
    rid = made.json()["id"]
    clock.now = at(TUE, 19)
    body = {"title": "Renamed", "type": "other", "time_of_day": "18:30", "repeat": "once", "on_date": TUE.isoformat()}
    assert client.put(f"{url}/{rid}", json=body, headers=s.cg).status_code == 200
    assert client.put(f"{url}/{rid}", json={**body, "time_of_day": "18:45"}, headers=s.cg).status_code == 422


def test_old_clients_still_send_weekdays_only(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(MON, 8)
    s = Setup(client, register)
    made = s.add("Old style", "09:00", [0])
    assert listed(s)["Old style"]["repeat"] == "weekly_days" and made


# --- the migration ----------------------------------------------------------------------------


def test_migration_turns_existing_reminders_into_schedules(database_url: str) -> None:
    """On SQLite and on Postgres (KHAYAL_TEST_MIGRATIONS_DATABASE_URL), from 0009 with real rows."""
    url = database_url
    cfg = alembic_config(url)
    command.upgrade(cfg, "0009")
    engine = create_engine(url)
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, name, role, created_at, voice_task_enabled, token_version, photos_enabled) "
                       "VALUES (1, 'K', 'patient', '2026-11-01', FALSE, 0, FALSE)"))
        c.execute(text("INSERT INTO reminders (id, patient_id, title, type, time_of_day, days_of_week, active, created_at) VALUES "
                       "(1, 1, 'Every day', 'medicine', '09:00:00', '[0, 1, 2, 3, 4, 5, 6]', TRUE, '2026-11-01'), "
                       "(2, 1, 'Some days', 'other', '18:00:00', '[0, 2, 4]', TRUE, '2026-11-01')"))
    command.upgrade(cfg, "0010")
    with engine.connect() as c:
        rows = c.execute(text("SELECT id, repeat, on_date, start_date, end_date FROM reminders ORDER BY id")).all()
    assert [tuple(r) for r in rows] == [(1, "daily", None, None, None), (2, "weekly_days", None, None, None)]

    with engine.begin() as c:
        c.execute(text("INSERT INTO reminders (id, patient_id, title, type, time_of_day, days_of_week, active, created_at, repeat, on_date) "
                       "VALUES (3, 1, 'Once', 'appointment', '11:00:00', '[]', TRUE, '2026-11-01', 'once', '2026-11-18')"))
    command.downgrade(cfg, "0009")
    with engine.connect() as c:
        days = c.execute(text("SELECT days_of_week FROM reminders WHERE id = 3")).scalar()
    assert (json.loads(days) if isinstance(days, str) else days) == [2]  # Wednesday
    engine.dispose()


@pytest.mark.parametrize("hhmm", ["00:00", "23:59"])
def test_once_at_the_edges_of_the_day(client: TestClient, register: Register, clock: Clock, hhmm: str) -> None:
    clock.now = at(MON, 12)
    s = Setup(client, register)
    add(s, "Edge", hhmm, repeat="once", on_date=TUE.isoformat())
    clock.now = at(TUE, 0, 0)
    assert titles_today(s) == ["Edge"]
    clock.now = at(TUE, 23, 59)
    assert titles_today(s) == ["Edge"]
    clock.now = at(WED, 0, 0)
    assert titles_today(s) == []
