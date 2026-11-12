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


def test_background_loop_runs_now_and_survives_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    """Runs on a fake clock: no real waiting, so it cannot be flaky under load."""
    calls: list[int] = []
    slept: list[float] = []

    def fake_check() -> int:
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("database busy")
        return 0

    class Stop(Exception):
        pass

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)
        if len(slept) == 3:
            raise Stop  # end the endless loop after three checks

    monkeypatch.setattr(background, "check_missed_reminders_once", fake_check)
    with pytest.raises(Stop):
        asyncio.run(background.missed_reminder_loop(900, sleep=fake_sleep))

    assert len(calls) == 3  # checked at once, then after each wait; the first failure did not stop it
    assert slept == [900, 900, 900]


def test_background_check_uses_a_real_session(monkeypatch: pytest.MonkeyPatch, db_session_factory: sessionmaker[Session]) -> None:
    monkeypatch.setattr(background, "SessionLocal", db_session_factory)
    assert background.check_missed_reminders_once() == 0


def test_background_check_can_be_turned_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(background.config, "REMINDER_CHECK_MINUTES", 0)
    assert background.start_background_tasks() == []
