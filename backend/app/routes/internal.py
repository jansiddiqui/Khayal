import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session, sessionmaker

from app import config
from app.background import housekeeping_once, mark_time
from app.services import system_state
from app.db import get_session_factory
from app.schemas import TickOut

router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/tick", response_model=TickOut)
def tick(
    factory: Annotated[sessionmaker[Session], Depends(get_session_factory)],
    x_khayal_tick_secret: Annotated[str | None, Header()] = None,
) -> TickOut:
    """For an optional external cron (e.g. every 30 minutes): the missed-reminder check and
    the demo clean-up. Needs the header X-Khayal-Tick-Secret = KHAYAL_TICK_SECRET; without
    that setting the route does not exist."""
    if config.TICK_SECRET is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if x_khayal_tick_secret is None or not hmac.compare_digest(x_khayal_tick_secret.encode(), config.TICK_SECRET.encode()):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    mark_time(system_state.LAST_TICK, factory)
    result = housekeeping_once(factory)
    return TickOut(reminder_patients=result.reminder_patients, accounts_removed=result.accounts_removed, skipped=result.skipped)
