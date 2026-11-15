"""Admin-made password reset links (no email service yet): the admin copies the link and sends
it to the person, who sets a new password. Using it signs out every other session."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import PasswordReset, Role, User
from app.services import auth
from app.services.clock import as_utc
from app.services.invites import NewLink
from app.services.tokens import hash_token, new_token


class NotACaregiverError(Exception):
    """Elders have no password; their devices pair with a code instead."""


def create(db: Session, admin: User, user: User, now: datetime) -> NewLink:
    if user.role != Role.caregiver:
        raise NotACaregiverError()
    token, digest = new_token()
    reset = PasswordReset(
        token_hash=digest, user_id=user.id, created_by=admin.id, created_at=now,
        expires_at=now + timedelta(hours=config.RESET_HOURS),
    )
    db.add(reset)
    db.commit()
    return NewLink(token=token, expires_at=reset.expires_at, id=reset.id)


def use(db: Session, token: str, new_password: str, now: datetime) -> User | None:
    """Set the new password if the link is valid and unused. Returns the user, or None."""
    reset = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == hash_token(token)))
    if reset is None or reset.used_at is not None or as_utc(reset.expires_at) <= now:
        return None
    user = db.get(User, reset.user_id)
    if user is None:
        return None
    reset.used_at = now
    auth.set_password(db, user, new_password)  # commits, and signs out every other session
    return user
