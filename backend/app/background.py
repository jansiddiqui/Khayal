"""Background missed-reminder check, started from the FastAPI lifespan (no extra dependency)."""

import asyncio
import logging

from app import config
from app.db import SessionLocal
from app.services import reminders
from app.services.clock import utc_now

log = logging.getLogger("khayal.background")


def check_missed_reminders_once() -> int:
    with SessionLocal() as db:
        return reminders.sweep_all(db, utc_now())


async def missed_reminder_loop(interval_seconds: float) -> None:
    """Check right away, then every `interval_seconds`. One failed run never stops the loop."""
    while True:
        try:
            count = await asyncio.to_thread(check_missed_reminders_once)
            log.info("Missed-reminder check done for %d patient(s)", count)
        except Exception:
            log.exception("Missed-reminder check failed")
        await asyncio.sleep(interval_seconds)


def start_background_tasks() -> list[asyncio.Task[None]]:
    if config.REMINDER_CHECK_MINUTES <= 0:
        return []
    return [asyncio.create_task(missed_reminder_loop(config.REMINDER_CHECK_MINUTES * 60), name="missed-reminders")]
