"""Reminders: today's list, done/missed logs, and the missed-reminders alert (CLAUDE.md section 6).

Overdue reminders ask, they never urge (CLAUDE.md section 6, "Overdue reminders"): a reminder says
"It's time for this" only during its on-time window (an hour, or a medicine's safe late window set
by the caregiver). After that the patient is asked "Is it done?" with "Yes, it's done" (recorded as
confirmed later) or "No / not sure" (the family is told at once). An earlier dose of the same
medicine is no longer shown once the next dose's time has come.

`sweep` runs every REMINDER_CHECK_MINUTES in the background (app.background) and also
whenever reminders or alerts are read: any scheduled occurrence still not done GRACE
after its time is logged as missed, and a warning alert is raised if MISSED_ALERT_COUNT
or more were missed in the last 48 hours.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Alert,
    AlertType,
    MarkedBy,
    Reminder,
    ReminderLog,
    ReminderRepeat,
    ReminderStatus,
    ReminderType,
    Role,
    Severity,
    User,
)
from app.services.clock import as_utc, at_local, local

# How long after its time a reminder can still be marked done before it counts as missed.
GRACE = timedelta(hours=2)
# How long a reminder says "It's time for this"; after that it only asks "Is it done?".
ON_TIME_WINDOW = timedelta(hours=1)
MISSED_WINDOW = timedelta(hours=48)
MISSED_ALERT_COUNT = 3
# Unlogged occurrences older than this are left alone.
SWEEP_DAYS = 7

TodayStatus = Literal["done", "missed", "pending", "unsure"]
# Where a reminder stands for the patient right now (see the module docstring).
Phase = Literal["upcoming", "due", "overdue", "done", "unsure"]


def on_time_window(reminder: Reminder) -> timedelta:
    """A medicine's safe late window if the caregiver set one, otherwise the standard hour."""
    if reminder.type == ReminderType.medicine and reminder.late_window_minutes:
        return timedelta(minutes=reminder.late_window_minutes)
    return ON_TIME_WINDOW


def missed_after(reminder: Reminder) -> timedelta:
    """An occurrence not done this long after its time is logged as missed."""
    return max(GRACE, on_time_window(reminder))


def clock_label(t: time) -> str:
    """09:00 -> "9:00 AM" (the same format the patient screens use)."""
    return f"{t.hour % 12 or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"


def scheduled_on(reminder: Reminder, day: date) -> bool:
    """Whether the reminder applies on `day` (a local date): its repeat rule, within its start and end dates."""
    if reminder.repeat == ReminderRepeat.once:
        return reminder.on_date == day
    if reminder.start_date is not None and day < reminder.start_date:
        return False
    if reminder.end_date is not None and day > reminder.end_date:
        return False
    return reminder.repeat == ReminderRepeat.daily or day.weekday() in reminder.days_of_week


def last_day(reminder: Reminder) -> date | None:
    """The last day the reminder applies on, or None while it repeats until stopped."""
    return reminder.on_date if reminder.repeat == ReminderRepeat.once else reminder.end_date


def is_past(reminder: Reminder, today: date) -> bool:
    """Its one day, or its end date, is before today: it moves to "Past reminders" (kept, with its history)."""
    end = last_day(reminder)
    return end is not None and end < today


class PastTimeError(ValueError):
    """A one-time reminder for a moment that has already passed."""


def check_not_past(repeat: ReminderRepeat, on_date: date | None, time_of_day: time, now: datetime) -> None:
    if repeat == ReminderRepeat.once and on_date is not None and at_local(on_date, time_of_day) <= now:
        raise PastTimeError("Pick a date and time that have not passed yet.")


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
            if not scheduled_on(reminder, day) or due < created or due + missed_after(reminder) > now:
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
    phase: Phase
    # Done after the on-time window ("confirmed later"), and when it was confirmed.
    late: bool = False
    confirmed_at: datetime | None = None


def today_marked_by(db: Session, reminder: Reminder, day: date) -> MarkedBy | None:
    log = _log_for(db, reminder.id, day)
    return log.marked_by if log is not None else None


def today_status(db: Session, reminder: Reminder, day: date) -> TodayStatus | None:
    """done / missed / pending for `day`, or None if the reminder isn't on that day."""
    if not reminder.active or not scheduled_on(reminder, day):
        return None
    log = _log_for(db, reminder.id, day)
    if log is None:
        return "pending"
    return log.status.value  # type: ignore[return-value]


def today_log(db: Session, reminder: Reminder, day: date) -> ReminderLog | None:
    return _log_for(db, reminder.id, day)


def _same_medicine(a: Reminder, b: Reminder) -> bool:
    return (
        a.id != b.id
        and a.type == b.type == ReminderType.medicine
        and a.title.strip().casefold() == b.title.strip().casefold()
    )


def superseded(reminder: Reminder, others: list[Reminder], day: date, now: datetime) -> bool:
    """A later dose of the same medicine has reached its time today: the earlier one is no longer
    shown to the patient (it stays in the caregiver's records)."""
    return any(
        _same_medicine(reminder, other)
        and other.active
        and scheduled_on(other, day)
        and other.time_of_day > reminder.time_of_day
        and occurrence(other, day) <= now
        for other in others
    )


def phase_of(reminder: Reminder, status: TodayStatus, due_at: datetime, now: datetime) -> Phase:
    if status in ("done", "unsure"):
        return status  # type: ignore[return-value]
    if now < due_at:
        return "upcoming"
    return "due" if now < due_at + on_time_window(reminder) else "overdue"


def today_for(db: Session, patient: User, now: datetime) -> list[TodayReminder]:
    """The patient's reminders for today, without earlier doses that a later dose has replaced."""
    today = local(now).date()
    all_reminders = reminders_for(db, patient.id)
    out: list[TodayReminder] = []
    for reminder in all_reminders:
        status = today_status(db, reminder, today)
        if status is None or superseded(reminder, all_reminders, today, now):
            continue
        due_at = occurrence(reminder, today)
        log = _log_for(db, reminder.id, today)
        done_log = log if log is not None and log.status == ReminderStatus.done else None
        out.append(
            TodayReminder(
                reminder=reminder,
                due_at=due_at,
                status=status,
                due=due_at <= now,
                phase=phase_of(reminder, status, due_at, now),
                late=bool(done_log and done_log.late),
                confirmed_at=done_log.logged_at if done_log else None,
            )
        )
    return out


class NotScheduledTodayError(Exception):
    pass


def mark_done(db: Session, reminder: Reminder, now: datetime, by: MarkedBy) -> ReminderLog:
    """Mark today's occurrence done. A late "done" replaces "missed" or "not sure", and is
    recorded as confirmed later when it comes after the on-time window."""
    today = local(now).date()
    if not reminder.active or not scheduled_on(reminder, today):
        raise NotScheduledTodayError(reminder.id)
    late = now >= occurrence(reminder, today) + on_time_window(reminder)
    log = _log_for(db, reminder.id, today)
    if log is None:
        log = ReminderLog(
            reminder_id=reminder.id, date=today, status=ReminderStatus.done, marked_by=by, logged_at=now, late=late
        )
        db.add(log)
    else:
        log.status = ReminderStatus.done
        log.marked_by = by
        log.logged_at = now
        log.late = late
    db.commit()
    return log


class NotOverdueError(Exception):
    """"No / not sure" is only asked once a reminder's time has passed."""


class AlreadyDoneError(Exception):
    pass


def mark_unsure(db: Session, reminder: Reminder, patient: User, now: datetime) -> ReminderLog:
    """The patient answered "No / not sure": record it and tell the family at once (one notice per
    reminder per day), without waiting for the missed-reminders rule. Never advice to take a dose."""
    today = local(now).date()
    if not reminder.active or not scheduled_on(reminder, today):
        raise NotScheduledTodayError(reminder.id)
    if now < occurrence(reminder, today):
        raise NotOverdueError(reminder.id)
    log = _log_for(db, reminder.id, today)
    if log is not None and log.status == ReminderStatus.done:
        raise AlreadyDoneError(reminder.id)
    first_time = log is None or log.status != ReminderStatus.unsure
    if log is None:
        log = ReminderLog(
            reminder_id=reminder.id, date=today, status=ReminderStatus.unsure, marked_by=MarkedBy.patient, logged_at=now
        )
        db.add(log)
    else:
        log.status = ReminderStatus.unsure
        log.marked_by = MarkedBy.patient
        log.logged_at = now
        log.late = False
    if first_time:
        when = clock_label(reminder.time_of_day)
        db.add(
            Alert(
                patient_id=patient.id,
                type=AlertType.reminder_unsure,
                severity=Severity.warning if reminder.type == ReminderType.medicine else Severity.info,
                message=f"{patient.name} wasn't sure about the {when} reminder \"{reminder.title}\". Please check with them.",
                created_at=now,
            )
        )
    db.commit()
    return log


def sweep_all(db: Session, now: datetime) -> int:
    """Run `sweep` for every patient that has an active reminder. Returns how many."""
    with_reminders = select(Reminder.patient_id).where(Reminder.active.is_(True))
    patients = list(
        db.scalars(select(User).where(User.role == Role.patient, User.id.in_(with_reminders)).order_by(User.id))
    )
    for patient in patients:
        sweep(db, patient, now)
    return len(patients)


@dataclass(frozen=True)
class Adherence:
    days: int
    done_by_patient: int
    done_by_caregiver: int
    missed: int
    # Done but confirmed later (already counted in done_by_patient / done_by_caregiver), and "not sure".
    done_late: int
    unsure: int
    # done_by_patient / all finished occurrences; None when there were none.
    rate: float | None


def adherence(db: Session, patient_id: int, now: datetime, days: int = 7) -> Adherence:
    """Over the last `days` days (including today), only reminders the patient marked themself count."""
    since = local(now).date() - timedelta(days=days - 1)
    logs = list(
        db.scalars(
            select(ReminderLog)
            .join(Reminder, Reminder.id == ReminderLog.reminder_id)
            .where(Reminder.patient_id == patient_id, ReminderLog.date >= since)
        )
    )
    done = [log for log in logs if log.status == ReminderStatus.done]
    by_caregiver = sum(1 for log in done if log.marked_by == MarkedBy.caregiver)
    by_patient = len(done) - by_caregiver
    unsure = sum(1 for log in logs if log.status == ReminderStatus.unsure)
    missed = len(logs) - len(done) - unsure
    total = len(logs)
    return Adherence(
        days=days,
        done_by_patient=by_patient,
        done_by_caregiver=by_caregiver,
        missed=missed,
        done_late=sum(1 for log in done if log.late),
        unsure=unsure,
        rate=by_patient / total if total else None,
    )
