"""'Request an invite' for the pilot (landing page). Requests are stored for an admin to
review (Phase B); nothing is sent automatically."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import InviteRequest
from app.schemas import InviteRequestIn


def submit(db: Session, body: InviteRequestIn, now: datetime) -> InviteRequest | None:
    """Store a request. Returns None (and stores nothing) when the hidden honeypot field was filled."""
    if body.website:
        return None
    request = InviteRequest(
        name=body.name,
        email=body.email,
        role=body.role,
        city=body.city,
        message=body.message or None,
        consent_at=now,
        created_at=now,
    )
    db.add(request)
    db.commit()
    return request
