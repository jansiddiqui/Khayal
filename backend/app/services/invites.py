"""The invite-only pilot (CLAUDE.md section 11).

- Invite requests come from the landing page and wait for an admin.
- Approving one (or inviting someone directly) makes a single-use sign-up link, valid
  INVITE_DAYS days, which the admin copies and sends themselves (WhatsApp or email).
- A caregiver can share an elder with a second family member through a share link, valid
  SHARE_DAYS days; it also lets that person create their account if they have none.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import CareInvite, InviteRequest, InviteStatus, SignupInvite, User
from app.schemas import InviteRequestIn
from app.services import care
from app.services.clock import as_utc
from app.services.tokens import hash_token, new_token


def submit(db: Session, body: InviteRequestIn, now: datetime) -> InviteRequest | None:
    """Store a landing-page request. None (nothing stored) when the honeypot was filled."""
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


# --- sign-up invites ------------------------------------------------------------------------


@dataclass(frozen=True)
class NewLink:
    token: str
    expires_at: datetime
    id: int


def create_signup_invite(db: Session, admin: User, note: str, now: datetime, request: InviteRequest | None = None) -> NewLink:
    token, digest = new_token()
    invite = SignupInvite(
        token_hash=digest,
        invite_request_id=request.id if request else None,
        note=note[:200],
        created_by=admin.id,
        created_at=now,
        expires_at=now + timedelta(days=config.INVITE_DAYS),
    )
    db.add(invite)
    if request is not None:
        request.status = InviteStatus.invited
    db.commit()
    return NewLink(token=token, expires_at=invite.expires_at, id=invite.id)


def _usable(expires_at: datetime, used_at: datetime | None, revoked_at: datetime | None, now: datetime) -> bool:
    return used_at is None and revoked_at is None and as_utc(expires_at) > now


def find_signup_invite(db: Session, token: str, now: datetime) -> SignupInvite | None:
    invite = db.scalar(select(SignupInvite).where(SignupInvite.token_hash == hash_token(token)))
    if invite is None or not _usable(invite.expires_at, invite.used_at, invite.revoked_at, now):
        return None
    return invite


def invite_state(expires_at: datetime, used_at: datetime | None, revoked_at: datetime | None, now: datetime) -> str:
    if revoked_at is not None:
        return "revoked"
    if used_at is not None:
        return "used"
    return "expired" if as_utc(expires_at) <= now else "open"


def revoke_signup_invite(db: Session, invite_id: int, now: datetime) -> bool:
    invite = db.get(SignupInvite, invite_id)
    if invite is None or invite.used_at is not None or invite.revoked_at is not None:
        return False
    invite.revoked_at = now
    db.commit()
    return True


# --- family share links ---------------------------------------------------------------------


def create_share(db: Session, caregiver: User, patient: User, now: datetime) -> NewLink:
    token, digest = new_token()
    share = CareInvite(
        token_hash=digest,
        patient_id=patient.id,
        created_by=caregiver.id,
        created_at=now,
        expires_at=now + timedelta(days=config.SHARE_DAYS),
    )
    db.add(share)
    db.commit()
    return NewLink(token=token, expires_at=share.expires_at, id=share.id)


def find_share(db: Session, token: str, now: datetime) -> CareInvite | None:
    share = db.scalar(select(CareInvite).where(CareInvite.token_hash == hash_token(token)))
    if share is None or not _usable(share.expires_at, share.used_at, share.revoked_at, now):
        return None
    return share


def accept_share(db: Session, share: CareInvite, user: User, now: datetime) -> User:
    """Link `user` to the shared elder and use up the link. Returns the elder."""
    patient = db.get(User, share.patient_id)
    assert patient is not None  # the link is deleted with the elder (ON DELETE CASCADE)
    care.link_patient(db, user, patient)
    share.used_at = now
    share.used_by = user.id
    db.commit()
    return patient


def shares_for(db: Session, patient_id: int) -> list[CareInvite]:
    return list(db.scalars(select(CareInvite).where(CareInvite.patient_id == patient_id).order_by(CareInvite.created_at.desc())))


def revoke_share(db: Session, patient_id: int, share_id: int, now: datetime) -> bool:
    share = db.get(CareInvite, share_id)
    if share is None or share.patient_id != patient_id or share.used_at is not None or share.revoked_at is not None:
        return False
    share.revoked_at = now
    db.commit()
    return True
