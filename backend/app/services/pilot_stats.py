"""Admin pilot overview and system health (Round 2 batch 3).

Demo accounts (demo_expires_at set) are left out of every number. A "family" is one elder
with the family members who look after them; it is active in a period when the elder played
a game or ticked a reminder themself in it.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import (
    CareLink,
    DeviceSession,
    GameSession,
    InviteRequest,
    InviteStatus,
    MarkedBy,
    Reminder,
    ReminderLog,
    Role,
    SignupInvite,
    User,
)
from app.services import system_state
from app.services.clock import as_utc, local

DB_LIMIT_BYTES = 1024**3  # the free Voroa database: 1 GB
DB_WARN_SHARE = 0.8
BACKUP_WARN_DAYS = 7
CHART_DAYS = 30


def _real_elders():
    return select(User.id).where(User.role == Role.patient, User.demo_expires_at.is_(None))


def active_elders(db: Session, since: datetime) -> set[int]:
    played = db.scalars(
        select(GameSession.patient_id).where(GameSession.patient_id.in_(_real_elders()), GameSession.started_at >= since)
    )
    ticked = db.scalars(
        select(Reminder.patient_id)
        .join(ReminderLog, ReminderLog.reminder_id == Reminder.id)
        .where(
            Reminder.patient_id.in_(_real_elders()),
            ReminderLog.marked_by == MarkedBy.patient,
            ReminderLog.logged_at >= since,
        )
    )
    return set(played) | set(ticked)


def sessions_per_day(db: Session, now: datetime, days: int = CHART_DAYS) -> list[tuple[date, int]]:
    today = local(now).date()
    first = today - timedelta(days=days - 1)
    counts = {first + timedelta(days=i): 0 for i in range(days)}
    for started in db.scalars(
        select(GameSession.started_at).where(
            GameSession.patient_id.in_(_real_elders()), GameSession.started_at >= now - timedelta(days=days + 1)
        )
    ):
        day = local(as_utc(started)).date()
        if day in counts:
            counts[day] += 1
    return sorted(counts.items())


@dataclass(frozen=True)
class Funnel:
    requested: int
    approved: int  # requests answered with an invite
    invited: int  # every sign-up invite made (approved requests + direct invites)
    signed_up: int
    paired: int  # signed-up caregivers with an elder whose device is paired
    active: int  # ... whose elder was active in the last 30 days


def funnel(db: Session, now: datetime) -> Funnel:
    used_by = [u for u in db.scalars(select(SignupInvite.used_by).where(SignupInvite.used_at.is_not(None))) if u]
    elders_of: dict[int, set[int]] = {}
    for caregiver_id, patient_id in db.execute(
        select(CareLink.caregiver_id, CareLink.patient_id).where(CareLink.caregiver_id.in_(used_by))
    ).tuples():
        elders_of.setdefault(caregiver_id, set()).add(patient_id)
    with_device = set(db.scalars(select(DeviceSession.patient_id)))
    active = active_elders(db, now - timedelta(days=30))
    return Funnel(
        requested=db.scalar(select(func.count(InviteRequest.id))) or 0,
        approved=db.scalar(select(func.count(InviteRequest.id)).where(InviteRequest.status == InviteStatus.invited)) or 0,
        invited=db.scalar(select(func.count(SignupInvite.id))) or 0,
        signed_up=len(used_by),
        paired=sum(1 for c in used_by if elders_of.get(c, set()) & with_device),
        active=sum(1 for c in used_by if elders_of.get(c, set()) & active),
    )


@dataclass(frozen=True)
class Retention:
    days: int
    eligible: int  # elders whose first game was at least `days` days ago
    retained: int  # ... who played again `days` or more days after their first game


def retention(db: Session, now: datetime, days: int) -> Retention:
    firsts = dict(
        db.execute(
            select(GameSession.patient_id, func.min(GameSession.started_at))
            .where(GameSession.patient_id.in_(_real_elders()))
            .group_by(GameSession.patient_id)
        ).tuples().all()
    )
    lasts = dict(
        db.execute(
            select(GameSession.patient_id, func.max(GameSession.started_at))
            .where(GameSession.patient_id.in_(_real_elders()))
            .group_by(GameSession.patient_id)
        ).tuples().all()
    )
    window = timedelta(days=days)
    eligible = [p for p, first in firsts.items() if as_utc(first) <= now - window]
    retained = [p for p in eligible if as_utc(lasts[p]) >= as_utc(firsts[p]) + window]
    return Retention(days, len(eligible), len(retained))


@dataclass(frozen=True)
class Overview:
    families: int
    active_7: int
    active_30: int
    caregivers: int
    sessions_per_day: list[tuple[date, int]]
    funnel: Funnel
    retention_7: Retention
    retention_30: Retention


def overview(db: Session, now: datetime) -> Overview:
    return Overview(
        families=db.scalar(select(func.count()).select_from(_real_elders().subquery())) or 0,
        active_7=len(active_elders(db, now - timedelta(days=7))),
        active_30=len(active_elders(db, now - timedelta(days=30))),
        caregivers=db.scalar(
            select(func.count(User.id)).where(User.role == Role.caregiver, User.demo_expires_at.is_(None))
        )
        or 0,
        sessions_per_day=sessions_per_day(db, now),
        funnel=funnel(db, now),
        retention_7=retention(db, now, 7),
        retention_30=retention(db, now, 30),
    )


# --- system health ------------------------------------------------------------------------


def database_size(db: Session) -> int | None:
    """Bytes used by the database: pg_database_size on Postgres, pages × page size on SQLite."""
    dialect = db.get_bind().dialect.name
    try:
        if dialect == "postgresql":
            return int(db.scalar(text("SELECT pg_database_size(current_database())")) or 0)
        if dialect == "sqlite":
            pages = db.scalar(text("PRAGMA page_count")) or 0
            size = db.scalar(text("PRAGMA page_size")) or 0
            return int(pages) * int(size)
    except Exception:  # a host may refuse the query; the panel then says "unknown"
        return None
    return None


@dataclass(frozen=True)
class Health:
    started_at: datetime
    uptime_seconds: int
    last_start_at: datetime | None
    last_tick_at: datetime | None
    last_housekeeping_at: datetime | None
    database: str
    db_bytes: int | None
    db_limit_bytes: int
    db_warning: bool
    last_backup_at: datetime | None
    last_backup_by: str | None
    days_since_backup: int | None
    backup_warning: bool


def health(db: Session, now: datetime) -> Health:
    size = database_size(db)
    backup_at = system_state.get_time(db, system_state.LAST_BACKUP)
    days = (now - backup_at).days if backup_at is not None else None
    return Health(
        started_at=system_state.STARTED_AT,
        uptime_seconds=max(0, int((now - system_state.STARTED_AT).total_seconds())),
        last_start_at=system_state.get_time(db, system_state.LAST_START),
        last_tick_at=system_state.get_time(db, system_state.LAST_TICK),
        last_housekeeping_at=system_state.get_time(db, system_state.LAST_HOUSEKEEPING),
        database=db.get_bind().dialect.name,
        db_bytes=size,
        db_limit_bytes=DB_LIMIT_BYTES,
        db_warning=size is not None and size >= DB_WARN_SHARE * DB_LIMIT_BYTES,
        last_backup_at=backup_at,
        last_backup_by=system_state.get_value(db, system_state.LAST_BACKUP_BY),
        days_since_backup=days,
        backup_warning=days is None or days > BACKUP_WARN_DAYS,
    )
