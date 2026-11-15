import asyncio
from datetime import date, datetime, time, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app import background
from app.models import Alert, Reminder, ReminderLog, ReminderStatus, ReminderType, Role
from app.services import auth, reminders
from app.services.clock import LOCAL_TZ

WED = date(2026, 11, 4)


def at(hour: int) -> datetime:
    return datetime(WED.year, WED.month, WED.day, hour, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def test_sweep_all_logs_missed_reminders_for_every_patient(db: Session) -> None:
    patients = [
        auth.register_user(db, name=n, email=f"{n}@example.com", password="password123", role=Role.patient)
        for n in ("kamala", "rahim", "shanti")
    ]
    for p in patients[:2]:
        for hour in (7, 8, 9):
            db.add(Reminder(patient_id=p.id, title=f"T{hour}", type=ReminderType.medicine, time_of_day=time(hour),
                            days_of_week=list(range(7)), created_at=at(6)))
    db.commit()

    assert reminders.sweep_all(db, at(12)) == 2  # the patient without reminders is skipped
    missed = db.scalars(select(ReminderLog).where(ReminderLog.status == ReminderStatus.missed)).all()
    assert len(missed) == 6
    assert len(db.scalars(select(Alert)).all()) == 2  # 3 missed each -> one warning each


def test_background_loop_runs_now_and_survives_errors() -> None:
    """Runs on a fake clock: no real waiting, so it cannot be flaky under load."""
    calls: list[int] = []
    slept: list[float] = []

    def fake_run() -> background.Housekeeping:
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("database busy")
        return background.Housekeeping(0, 0)

    class Stop(Exception):
        pass

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)
        if len(slept) == 3:
            raise Stop  # end the endless loop after three checks

    with pytest.raises(Stop):
        asyncio.run(background.housekeeping_loop(900, sleep=fake_sleep, run=fake_run))

    assert len(calls) == 3  # checked at once, then after each wait; the first failure did not stop it
    assert slept == [900, 900, 900]


def test_housekeeping_uses_a_real_session(db_session_factory: sessionmaker[Session]) -> None:
    assert background.housekeeping_once(db_session_factory) == background.Housekeeping(0, 0)


def test_one_failing_step_does_not_stop_the_other(
    monkeypatch: pytest.MonkeyPatch, db_session_factory: sessionmaker[Session]
) -> None:
    def broken(factory: object = None) -> int:
        raise RuntimeError("database busy")

    monkeypatch.setattr(background, "check_missed_reminders_once", broken)
    assert background.housekeeping_once(db_session_factory) == background.Housekeeping(None, 0)


def test_housekeeping_after_login_waits_between_runs(
    monkeypatch: pytest.MonkeyPatch, db_session_factory: sessionmaker[Session]
) -> None:
    runs: list[int] = []
    monkeypatch.setattr(background, "remove_expired_accounts_once", lambda factory=None: runs.append(1) or 0)
    background.housekeeping_after_login(db_session_factory)
    background.housekeeping_after_login(db_session_factory)
    assert runs == [1]  # the second sign-in came within LOGIN_RUN_GAP


def test_with_the_loop_turned_off_it_still_runs_once_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    ran: list[int] = []
    monkeypatch.setattr(background.config, "REMINDER_CHECK_MINUTES", 0)
    monkeypatch.setattr(background, "housekeeping_once", lambda factory=None: ran.append(1) or background.Housekeeping())

    async def start_and_wait() -> list[str]:
        tasks = background.start_background_tasks()
        await asyncio.gather(*tasks)
        return [t.get_name() for t in tasks]

    assert asyncio.run(start_and_wait()) == ["housekeeping-startup"]
    assert ran == [1]
