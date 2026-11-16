import logging
import math
import os
import tempfile
from collections.abc import Iterator

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from sqlalchemy import func, select

from app.deps import CurrentAdmin, DbSession, Now
from app.models import CareLink, InviteRequest, InviteStatus, SignupInvite, User
from app.schemas import (
    AdminInviteIn,
    AdminInviteOut,
    AdminInviteRequestOut,
    AdminUserOut,
    DemoAccountsOut,
    DemoRemoveIn,
    LinkOut,
    RemovedOut,
)
from app.services import accounts, auth, backup, invites, ratelimit, resets

router = APIRouter(prefix="/admin", tags=["admin"])
log = logging.getLogger("khayal.backup")


@router.get("/invite-requests", response_model=list[AdminInviteRequestOut])
def list_requests(admin: CurrentAdmin, db: DbSession) -> list[AdminInviteRequestOut]:
    rows = db.scalars(select(InviteRequest).order_by(InviteRequest.created_at.desc()))
    return [
        AdminInviteRequestOut(
            id=r.id, name=r.name, email=r.email, role=r.role.value, city=r.city, message=r.message,
            status=r.status.value, created_at=r.created_at,
        )
        for r in rows
    ]


def _request(db: DbSession, request_id: int) -> InviteRequest:
    request = db.get(InviteRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return request


@router.post("/invite-requests/{request_id}/approve", response_model=LinkOut, status_code=status.HTTP_201_CREATED)
def approve(request_id: int, admin: CurrentAdmin, db: DbSession, now: Now) -> LinkOut:
    """Approve a request: a single-use sign-up link (14 days) to copy and send yourself."""
    request = _request(db, request_id)
    link = invites.create_signup_invite(db, admin, f"{request.name} <{request.email}>", now, request)
    return LinkOut(id=link.id, token=link.token, expires_at=link.expires_at)


@router.post("/invite-requests/{request_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject(request_id: int, admin: CurrentAdmin, db: DbSession) -> Response:
    _request(db, request_id).status = InviteStatus.declined
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/invites", response_model=LinkOut, status_code=status.HTTP_201_CREATED)
def invite_directly(body: AdminInviteIn, admin: CurrentAdmin, db: DbSession, now: Now) -> LinkOut:
    """Invite someone who did not use the landing-page form."""
    link = invites.create_signup_invite(db, admin, body.note, now)
    return LinkOut(id=link.id, token=link.token, expires_at=link.expires_at)


@router.get("/invites", response_model=list[AdminInviteOut])
def list_invites(admin: CurrentAdmin, db: DbSession, now: Now) -> list[AdminInviteOut]:
    out = []
    for inv in db.scalars(select(SignupInvite).order_by(SignupInvite.created_at.desc())):
        used_by = db.get(User, inv.used_by) if inv.used_by else None
        out.append(
            AdminInviteOut(
                id=inv.id, note=inv.note, created_at=inv.created_at, expires_at=inv.expires_at,
                state=invites.invite_state(inv.expires_at, inv.used_at, inv.revoked_at, now),  # type: ignore[arg-type]
                used_by_email=used_by.email if used_by else None,
            )
        )
    return out


@router.post("/invites/{invite_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(invite_id: int, admin: CurrentAdmin, db: DbSession, now: Now) -> Response:
    if not invites.revoke_signup_invite(db, invite_id, now):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found, used or already revoked")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[AdminUserOut])
def list_users(admin: CurrentAdmin, db: DbSession) -> list[AdminUserOut]:
    elders = dict(
        db.execute(select(CareLink.caregiver_id, func.count(CareLink.id)).group_by(CareLink.caregiver_id)).tuples().all()
    )
    return [
        AdminUserOut(
            id=u.id, name=u.name, email=u.email, role=u.role, created_at=u.created_at, is_admin=auth.is_admin(u),
            is_demo=u.demo_expires_at is not None, elders=elders.get(u.id, 0),
        )
        for u in db.scalars(select(User).order_by(User.created_at.desc()))
    ]


@router.post("/users/{user_id}/reset-link", response_model=LinkOut, status_code=status.HTTP_201_CREATED)
def reset_link(user_id: int, admin: CurrentAdmin, db: DbSession, now: Now) -> LinkOut:
    """A password reset link (48 hours) to copy and send to the person; there is no email service yet."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    try:
        link = resets.create(db, admin, user, now)
    except resets.NotACaregiverError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Elders have no password; pair their device with a code")
    return LinkOut(id=link.id, token=link.token, expires_at=link.expires_at)


@router.get("/demo-accounts", response_model=DemoAccountsOut)
def count_demo_accounts(admin: CurrentAdmin, db: DbSession) -> DemoAccountsOut:
    return DemoAccountsOut(count=len(accounts.demo_accounts(db)))


@router.post("/demo-accounts/remove", response_model=RemovedOut)
def remove_demo_accounts(body: DemoRemoveIn, admin: CurrentAdmin, db: DbSession) -> RemovedOut:
    """Remove every demo account and its data. The admin types back the count they were shown;
    if it changed in between, nothing is removed."""
    if body.confirm_count != len(accounts.demo_accounts(db)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The number of demo accounts changed; check again")
    return RemovedOut(removed=accounts.remove_demo_accounts(db))


_CHUNK = 1024 * 1024


def _stream(path: str) -> Iterator[bytes]:
    with open(path, "rb") as f:
        while chunk := f.read(_CHUNK):
            yield chunk


@router.get("/backup", response_class=StreamingResponse)
def download_backup(admin: CurrentAdmin, db: DbSession, now: Now) -> StreamingResponse:
    """A full backup: every table as JSON plus every photo and recording, as a zip
    (services/backup.py). One per 10 minutes for the whole server; each one is logged."""
    wait = ratelimit.LIMITS["backup"].hit("all", now)
    if wait is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"A backup was made a few minutes ago. Try again in {math.ceil(wait / 60)} min.",
            headers={"Retry-After": str(math.ceil(wait))},
        )
    # Built in a temporary file, not in memory, then streamed and removed.
    handle, path = tempfile.mkstemp(prefix="khayal-backup-", suffix=".zip")
    try:
        with os.fdopen(handle, "wb") as out:
            summary = backup.write(db, out, now, made_by=admin.email or f"user {admin.id}")
    except BaseException:
        os.unlink(path)
        log.exception("Full backup by admin %s failed", admin.id)
        raise
    size = os.path.getsize(path)
    log.info(
        "Full backup downloaded by admin %s (%s): %d tables, %d rows, %d files, %d bytes, revision %s",
        admin.id, admin.email, summary.tables, summary.rows, summary.files, size, summary.revision,
    )
    name = f"khayal-backup-{now.strftime('%Y-%m-%d-%H%M')}.zip"
    return StreamingResponse(
        _stream(path),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Content-Length": str(size),
            "Cache-Control": "no-store",
        },
        background=BackgroundTask(os.unlink, path),
    )
