"""Paired elder devices: one session per device, listed for the family and revocable one by one."""

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DeviceSession, GameSession, User
from app.services.clock import as_utc

# How often "last seen" is written (no write on every request).
LAST_SEEN_STEP = timedelta(minutes=10)


def describe(user_agent: str) -> str:
    """A short, human description of a browser ("Android phone · Chrome")."""
    ua = user_agent.lower()
    device = (
        "iPad" if "ipad" in ua
        else "iPhone" if "iphone" in ua
        else "Android tablet" if "android" in ua and "mobile" not in ua
        else "Android phone" if "android" in ua
        else "Windows computer" if "windows" in ua
        else "Mac" if "macintosh" in ua
        else "Device"
    )
    browser = (
        "Edge" if "edg/" in ua
        else "Samsung Internet" if "samsungbrowser" in ua
        else "Chrome" if "chrome" in ua or "crios" in ua
        else "Firefox" if "firefox" in ua or "fxios" in ua
        else "Safari" if "safari" in ua
        else ""
    )
    return f"{device} · {browser}" if browser else device


def start(db: Session, patient: User, paired_by: int | None, user_agent: str, now: datetime) -> DeviceSession:
    session = DeviceSession(
        patient_id=patient.id, paired_by=paired_by, created_at=now, last_seen_at=now, device_label=describe(user_agent)[:120]
    )
    db.add(session)
    db.commit()
    return session


def is_active(db: Session, session_id: int, patient_id: int, now: datetime) -> bool:
    """True if the device session exists for this elder and is not revoked; notes "last seen"."""
    session = db.get(DeviceSession, session_id)
    if session is None or session.patient_id != patient_id or session.revoked_at is not None:
        return False
    if now - as_utc(session.last_seen_at) > LAST_SEEN_STEP:
        session.last_seen_at = now
        db.commit()
    return True


def for_patient(db: Session, patient_id: int) -> list[DeviceSession]:
    return list(
        db.scalars(
            select(DeviceSession)
            .where(DeviceSession.patient_id == patient_id, DeviceSession.revoked_at.is_(None))
            .order_by(DeviceSession.last_seen_at.desc())
        )
    )


def revoke(db: Session, patient_id: int, session_id: int, now: datetime) -> bool:
    session = db.get(DeviceSession, session_id)
    if session is None or session.patient_id != patient_id or session.revoked_at is not None:
        return False
    session.revoked_at = now
    db.commit()
    return True


def last_active(db: Session, patient_id: int) -> datetime | None:
    """When the elder last used Khayal: their newest device activity or finished game, whichever is
    later (for "Active today" on the caregiver's list). None if never."""
    seen = db.scalar(
        select(func.max(DeviceSession.last_seen_at)).where(DeviceSession.patient_id == patient_id, DeviceSession.revoked_at.is_(None))
    )
    played = db.scalar(select(func.max(GameSession.ended_at)).where(GameSession.patient_id == patient_id))
    times = [as_utc(t) for t in (seen, played) if t is not None]
    return max(times) if times else None
