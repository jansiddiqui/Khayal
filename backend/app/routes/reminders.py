from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.deps import CurrentCaregiver, CurrentPatient, CurrentUser, DbSession, Now, ensure_patient_access
from app.models import MarkedBy, Reminder, ReminderRepeat, ReminderStatus, Role, User
from app.schemas import AdherenceOut, ReminderIn, ReminderLogIn, ReminderOut, TodayReminderOut
from app.services import reminders
from app.services.clock import local

router = APIRouter(tags=["reminders"])


def _out(db: Session, reminder: Reminder, today: date) -> ReminderOut:
    log = reminders.today_log(db, reminder, today)
    return ReminderOut(
        id=reminder.id,
        patient_id=reminder.patient_id,
        title=reminder.title,
        type=reminder.type,
        time_of_day=reminder.time_of_day,
        repeat=reminder.repeat,
        days_of_week=reminder.days_of_week,
        on_date=reminder.on_date,
        start_date=reminder.start_date,
        end_date=reminder.end_date,
        active=reminder.active,
        late_window_minutes=reminder.late_window_minutes,
        past=reminders.is_past(reminder, today),
        today_status=reminders.today_status(db, reminder, today),
        today_marked_by=reminders.today_marked_by(db, reminder, today),
        today_late=bool(log and log.status == ReminderStatus.done and log.late),
        today_logged_at=log.logged_at if log and log.status != ReminderStatus.missed else None,
    )


def _patient(db: Session, patient_id: int) -> User:
    patient = db.get(User, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


def _fields(body: ReminderIn, now: datetime, previous: Reminder | None = None) -> dict[str, object]:
    """The reminder's columns from the form. A one-time reminder can't be set in the past (unless an
    edit keeps the same date and time); a repeating one starts today unless a start date is given."""
    fields = body.model_dump()
    unchanged = previous is not None and (previous.repeat, previous.on_date, previous.time_of_day) == (
        body.repeat, body.on_date, body.time_of_day,
    )
    if not unchanged:
        try:
            reminders.check_not_past(body.repeat, body.on_date, body.time_of_day, now)
        except reminders.PastTimeError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    if body.repeat != ReminderRepeat.once and body.start_date is None:
        fields["start_date"] = previous.start_date if previous is not None and previous.start_date else local(now).date()
        if body.end_date is not None and body.end_date < fields["start_date"]:  # type: ignore[operator]
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The end date must be on or after the start date.")
    return fields


def _reminder_of(db: Session, patient_id: int, reminder_id: int) -> Reminder:
    reminder = db.get(Reminder, reminder_id)
    if reminder is None or reminder.patient_id != patient_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    return reminder


@router.get("/patients/{patient_id}/reminders", response_model=list[ReminderOut])
def list_reminders(patient_id: int, user: CurrentUser, db: DbSession, now: Now) -> list[ReminderOut]:
    ensure_patient_access(db, user, patient_id)
    reminders.sweep(db, _patient(db, patient_id), now)
    today = local(now).date()
    return [_out(db, r, today) for r in reminders.reminders_for(db, patient_id)]


@router.get("/patients/{patient_id}/reminders/adherence", response_model=AdherenceOut)
def get_adherence(patient_id: int, user: CurrentUser, db: DbSession, now: Now, days: int = 7) -> AdherenceOut:
    """Share of finished reminders the patient marked done themself over the last `days` days."""
    ensure_patient_access(db, user, patient_id)
    if not 1 <= days <= 90:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="days must be 1-90")
    reminders.sweep(db, _patient(db, patient_id), now)
    a = reminders.adherence(db, patient_id, now, days)
    return AdherenceOut(
        days=a.days,
        done_by_patient=a.done_by_patient,
        done_by_caregiver=a.done_by_caregiver,
        missed=a.missed,
        done_late=a.done_late,
        unsure=a.unsure,
        rate=a.rate,
    )


@router.post("/patients/{patient_id}/reminders", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
def create_reminder(patient_id: int, body: ReminderIn, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> ReminderOut:
    ensure_patient_access(db, caregiver, patient_id)
    reminder = Reminder(patient_id=patient_id, created_at=now, **_fields(body, now))
    db.add(reminder)
    db.commit()
    return _out(db, reminder, local(now).date())


@router.put("/patients/{patient_id}/reminders/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    patient_id: int, reminder_id: int, body: ReminderIn, caregiver: CurrentCaregiver, db: DbSession, now: Now
) -> ReminderOut:
    ensure_patient_access(db, caregiver, patient_id)
    reminder = _reminder_of(db, patient_id, reminder_id)
    for field, value in _fields(body, now, reminder).items():
        setattr(reminder, field, value)
    db.commit()
    return _out(db, reminder, local(now).date())


@router.delete("/patients/{patient_id}/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(patient_id: int, reminder_id: int, caregiver: CurrentCaregiver, db: DbSession) -> Response:
    ensure_patient_access(db, caregiver, patient_id)
    db.delete(_reminder_of(db, patient_id, reminder_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reminders/{reminder_id}/log", response_model=ReminderOut)
def log_reminder(reminder_id: int, body: ReminderLogIn, user: CurrentUser, db: DbSession, now: Now) -> ReminderOut:
    """Mark today's occurrence done (the patient, or a linked caregiver on their behalf), or, for the
    patient only, answer "No / not sure" once its time has passed (the family is told at once)."""
    reminder = db.get(Reminder, reminder_id)
    if reminder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    ensure_patient_access(db, user, reminder.patient_id)
    try:
        if body.status == "unsure":
            if user.role != Role.patient:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the patient can answer this")
            reminders.mark_unsure(db, reminder, user, now)
        else:
            by = MarkedBy.patient if user.role == Role.patient else MarkedBy.caregiver
            reminders.mark_done(db, reminder, now, by)
    except reminders.NotScheduledTodayError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This reminder is not scheduled today")
    except reminders.NotOverdueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This reminder's time has not come yet")
    except reminders.AlreadyDoneError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This reminder is already done")
    return _out(db, reminder, local(now).date())


@router.get("/me/reminders/today", response_model=list[TodayReminderOut])
def my_reminders_today(patient: CurrentPatient, db: DbSession, now: Now) -> list[TodayReminderOut]:
    reminders.sweep(db, patient, now)
    return [
        TodayReminderOut(
            id=t.reminder.id,
            title=t.reminder.title,
            type=t.reminder.type,
            time_of_day=t.reminder.time_of_day,
            status=t.status,
            due=t.due,
            phase=t.phase,
            late=t.late,
            confirmed_at=t.confirmed_at,
        )
        for t in reminders.today_for(db, patient, now)
    ]
