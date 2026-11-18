"""Small facts about the server for the admin health panel (Round 2 batch 3)."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import SystemState
from app.services.clock import as_utc, utc_now

LAST_TICK = "last_tick_at"  # the external cron (POST /internal/tick)
LAST_HOUSEKEEPING = "last_housekeeping_at"  # any housekeeping run (loop, cron or after a login)
LAST_START = "last_start_at"  # the server process started (a free host wakes up)
LAST_BACKUP = "last_backup_at"  # Admin → Download full backup
LAST_BACKUP_BY = "last_backup_by"

# When this process started; the health panel shows it as "up since".
STARTED_AT = utc_now()


def set_value(db: Session, key: str, value: str, now: datetime | None = None) -> None:
    """Upsert one value; the caller commits."""
    now = now or utc_now()
    row = db.get(SystemState, key)
    if row is None:
        db.add(SystemState(key=key, value=value[:200], updated_at=now))
    else:
        row.value, row.updated_at = value[:200], now


def mark(db: Session, key: str, now: datetime | None = None) -> None:
    """Store a moment (ISO time) under `key`; the caller commits."""
    now = now or utc_now()
    set_value(db, key, as_utc(now).isoformat(), now)


def get_value(db: Session, key: str) -> str | None:
    row = db.get(SystemState, key)
    return row.value if row is not None else None


def get_time(db: Session, key: str) -> datetime | None:
    value = get_value(db, key)
    return as_utc(datetime.fromisoformat(value)) if value else None
