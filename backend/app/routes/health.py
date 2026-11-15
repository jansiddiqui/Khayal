from fastapi import APIRouter

from app import config
from app.schemas import AppConfigOut, HealthOut
from app.services import speech

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(status="ok", app="khayal")


@router.get("/config", response_model=AppConfigOut)
def app_config() -> AppConfigOut:
    """Public settings for the frontend: demo mode (banner, "Try the demo") and the recording limit."""
    return AppConfigOut(
        demo_mode=config.DEMO_MODE,
        recording_limit_seconds=speech.recording_limit_seconds(),
        demo_account_days=config.DEMO_ACCOUNT_DAYS,
        contact_email=config.CONTACT_EMAIL,
    )
