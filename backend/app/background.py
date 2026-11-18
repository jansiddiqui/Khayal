"""Housekeeping: the missed-reminder check and, in the public demo, removing expired demo
accounts. No extra dependency.

It runs:
- at startup and then every KHAYAL_REMINDER_CHECK_MINUTES in a background loop (0 = only at startup);
- after a sign-in, at most once every LOGIN_RUN_GAP (a free host sleeps when idle, so the
  loop may not have run for a while);
- from POST /api/internal/tick, for an optional external cron.

Only one run at a time; a run that finds another in progress is skipped.
"""

import asyncio
import logging
import threading
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session, sessionmaker

from app import config, db
from app.services import accounts, ratelimit, reminders, system_state
from app.services.clock import utc_now

log = logging.getLogger("khayal.background")

LOGIN_RUN_GAP = timedelta(minutes=5)

SessionFactory = sessionmaker[Session]

_lock = threading.Lock()
_last_run: datetime | None = None


def _factory(factory: SessionFactory | None) -> SessionFactory:
    return factory if factory is not None else db.SessionLocal


def check_missed_reminders_once(factory: SessionFactory | None = None) -> int:
    with _factory(factory)() as session:
        return reminders.sweep_all(session, utc_now())


def remove_expired_accounts_once(factory: SessionFactory | None = None) -> int:
    with _factory(factory)() as session:
        return accounts.delete_expired(session, utc_now())


@dataclass(frozen=True)
class Housekeeping:
    """What one run did; None where that step failed, skipped=True if another run was busy."""

    reminder_patients: int | None = None
    accounts_removed: int | None = None
    skipped: bool = False


def mark_time(key: str, factory: SessionFactory | None = None) -> None:
    """Store "now" under `key` for the admin health panel; never fails the caller."""
    try:
        with _factory(factory)() as session:
            system_state.mark(session, key)
            session.commit()
    except Exception:
        log.exception("Could not store %s", key)


def housekeeping_once(factory: SessionFactory | None = None) -> Housekeeping:
    """Run every housekeeping step once. One failing step never stops the others."""
    global _last_run
    if not _lock.acquire(blocking=False):
        return Housekeeping(skipped=True)
    try:
        patients: int | None = None
        removed: int | None = None
        try:
            patients = check_missed_reminders_once(factory)
        except Exception:
            log.exception("Missed-reminder check failed")
        try:
            removed = remove_expired_accounts_once(factory)
        except Exception:
            log.exception("Removing expired demo accounts failed")
        ratelimit.prune_all(utc_now())
        _last_run = utc_now()
        mark_time(system_state.LAST_HOUSEKEEPING, factory)
        log.info("Housekeeping: reminders checked for %s patient(s), %s expired account(s) removed", patients, removed)
        return Housekeeping(patients, removed)
    finally:
        _lock.release()


def housekeeping_after_login(factory: SessionFactory | None = None) -> None:
    """Called after a sign-in (as a background task): runs unless one ran recently."""
    if _last_run is not None and utc_now() - _last_run < LOGIN_RUN_GAP:
        return
    housekeeping_once(factory)


def reset_for_tests() -> None:
    global _last_run
    _last_run = None


async def housekeeping_loop(
    interval_seconds: float,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    run: Callable[[], Housekeeping] = housekeeping_once,
) -> None:
    """Run right away, then every `interval_seconds`. One failed run never stops the loop.
    `sleep` and `run` are injectable so tests can run the loop on a fake clock."""
    while True:
        try:
            await asyncio.to_thread(run)
        except Exception:
            log.exception("Housekeeping failed")
        await sleep(interval_seconds)


def start_background_tasks() -> list[asyncio.Task[None]]:
    """The repeating loop, or (with KHAYAL_REMINDER_CHECK_MINUTES=0) a single run at startup."""
    if config.REMINDER_CHECK_MINUTES <= 0:
        return [asyncio.create_task(_run_once_at_startup(), name="housekeeping-startup")]
    return [asyncio.create_task(housekeeping_loop(config.REMINDER_CHECK_MINUTES * 60), name="housekeeping")]


async def _run_once_at_startup() -> None:
    try:
        await asyncio.to_thread(housekeeping_once)
    except Exception:
        log.exception("Housekeeping failed")
