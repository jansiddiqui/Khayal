"""The app's local clock. "Today" means today in APP_UTC_OFFSET_MINUTES (IST by default).

SQLite hands back naive datetimes even for timezone-aware columns, so everything is
stored in UTC and `as_utc` re-attaches the zone when reading.
"""

from datetime import date, datetime, time, timedelta, timezone

from app import config

LOCAL_TZ = timezone(timedelta(minutes=config.APP_UTC_OFFSET_MINUTES))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def local(dt: datetime) -> datetime:
    return as_utc(dt).astimezone(LOCAL_TZ)


def local_day_start(day: date) -> datetime:
    """Midnight at the start of `day`, local time, as a UTC datetime."""
    return datetime.combine(day, time.min, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def at_local(day: date, t: time) -> datetime:
    """`t` o'clock on `day`, local time, as a UTC datetime."""
    return datetime.combine(day, t, tzinfo=LOCAL_TZ).astimezone(timezone.utc)
