"""Reminders: today's list, done/missed logs, and the missed-reminders alert (CLAUDE.md section 6).

There is no background job. `sweep` runs whenever reminders or alerts are read: any
scheduled occurrence still not done GRACE after its time is logged as missed, and a
warning alert is raised if MISSED_ALERT_COUNT or more were missed in the last 48 hours.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Alert, AlertType, Reminder, ReminderLog, ReminderStatus, Severity, User
from app.services.clock import as_utc, at_local, local

# How long after its time a reminder can still be marked done before it counts as missed.
GRACE = timedelta(hours=2)
MISSED_WINDOW = timedelta(hours=48)
MISSED_ALERT_COUNT = 3
# Unlogged occurrences older than this are left alone.
SWEEP_DAYS = 7

TodayStatus = Literal["done", "missed", "pending"]


def scheduled_on(reminder: Reminder, day: date) -> bool:
    return day.weekday() in reminder.days_of_week


def occurrence(reminder: Reminder, day: date) -> datetime:
    """When this reminder is due on `day`, in UTC."""
    return at_local(day, reminder.time_of_day)


def reminders_for(db: Session, patient_id: int) -> list[Reminder]:
    return list(db.scalars(select(Reminder).where(Reminder.patient_id == patient_id).order_by(Reminder.time_of_day)))


def _log_for(db: Session, reminder_id: int, day: date) -> ReminderLog | None:
    return db.scalar(select(ReminderLog).where(ReminderLog.reminder_id == reminder_id, ReminderLog.date == day))


def sweep(db: Session, patient: User, now: datetime) -> None:
    """Log missed occurrences and raise the missed-reminders alert when needed."""
    today = local(now).date()
    reminders = [r for r in reminders_for(db, patient.id) if r.active]
    for reminder in reminders:
        created = as_utc(reminder.created_at)
        for back in range(SWEEP_DAYS, -1, -1):
            day = today - timedelta(days=back)
            due = occurrence(reminder, day)
            if not scheduled_on(reminder, day) or due < created or due + GRACE > now:
                continue
            if _log_for(db, reminder.id, day) is None:
                db.add(ReminderLog(reminder_id=reminder.id, date=day, status=ReminderStatus.missed))
    db.commit()
    _maybe_alert(db, patient, now)


def missed_in_window(db: Session, patient_id: int, now: datetime) -> int:
    since = now - MISSED_WINDOW
    rows = db.execute(
        select(ReminderLog, Reminder)
        .join(Reminder, Reminder.id == ReminderLog.reminder_id)
        .where(
            Reminder.patient_id == patient_id,
            ReminderLog.status == ReminderStatus.missed,
            ReminderLog.date >= local(since).date(),
        )
    ).all()
    return sum(1 for log, reminder in rows if since <= occurrence(reminder, log.date) <= now)


def _maybe_alert(db: Session, patient: User, now: datetime) -> None:
    count = missed_in_window(db, patient.id, now)
    if count < MISSED_ALERT_COUNT:
        return
    # One alert per 48-hour window, so the same misses don't raise it again.
    recent = db.scalar(
        select(Alert.id).where(
            Alert.patient_id == patient.id,
            Alert.type == AlertType.missed_reminders,
            Alert.created_at >= now - MISSED_WINDOW,
        )
    )
    if recent is not None:
        return
    db.add(
        Alert(
            patient_id=patient.id,
            type=AlertType.missed_reminders,
            severity=Severity.warning,
            message=f"{patient.name} missed {count} reminders in the last 48 hours.",
            created_at=now,
        )
    )
    db.commit()


@dataclass(frozen=True)
class TodayReminder:
    reminder: Reminder
    due_at: datetime
    status: TodayStatus
    due: bool


def today_status(db: Session, reminder: Reminder, day: date) -> TodayStatus | None:
    """done / missed / pending for `day`, or None if the reminder isn't on that day."""
    if not reminder.active or not scheduled_on(reminder, day):
        return None
    log = _log_for(db, reminder.id, day)
    if log is None:
        return "pending"
    return "done" if log.status == ReminderStatus.done else "missed"


def today_for(db: Session, patient: User, now: datetime) -> list[TodayReminder]:
    today = local(now).date()
    out: list[TodayReminder] = []
    for reminder in reminders_for(db, patient.id):
        status = today_status(db, reminder, today)
        if status is None:
            continue
        due_at = occurrence(reminder, today)
        out.append(TodayReminder(reminder=reminder, due_at=due_at, status=status, due=due_at <= now))
    return out


class NotScheduledTodayError(Exception):
    pass


def mark_done(db: Session, reminder: Reminder, now: datetime) -> ReminderLog:
    """Mark today's occurrence done. A late "done" replaces an automatic "missed"."""
    today = local(now).date()
    if not reminder.active or not scheduled_on(reminder, today):
        raise NotScheduledTodayError(reminder.id)
    log = _log_for(db, reminder.id, today)
    if log is None:
        log = ReminderLog(reminder_id=reminder.id, date=today, status=ReminderStatus.done, logged_at=now)
        db.add(log)
    else:
        log.status = ReminderStatus.done
        log.logged_at = now
    db.commit()
    return log
