from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session, sessionmaker

from app import config
from app.background import housekeeping_after_login
from app.db import get_session_factory
from app.deps import CurrentCaregiver, CurrentUser, DbSession, Now, client_address, rate_limit
from app.models import ConsentKind, Role, User
from app.presenters import user_out
from app.schemas import (
    MyLanguageIn,
    ChangePasswordIn,
    InviteCheckOut,
    LoginIn,
    PairIn,
    RegisterIn,
    ResetPasswordIn,
    TokenOut,
    UserOut,
)
from app.services import accounts, auth, consent, devices, invites, pairing, resets

router = APIRouter(prefix="/auth", tags=["auth"])

SessionFactory = Annotated[sessionmaker[Session], Depends(get_session_factory)]

INVALID_INVITE = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Khayal is invite-only. This invite link is not valid any more; please ask for a new one.",
)


@router.get("/invite/{token}", response_model=InviteCheckOut, dependencies=[Depends(rate_limit("pair"))])
def check_invite(token: str, db: DbSession, now: Now) -> InviteCheckOut:
    """Before signing up: is this an open invite or family share link?"""
    signup = invites.find_signup_invite(db, token, now)
    if signup is not None:
        return InviteCheckOut(kind="signup", expires_at=signup.expires_at)
    share = invites.find_share(db, token, now)
    if share is not None:
        elder = db.get(User, share.patient_id)
        return InviteCheckOut(kind="share", elder_name=elder.name.split()[0] if elder else None, expires_at=share.expires_at)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This link is not valid any more.")


@router.post(
    "/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit("register"))]
)
def register(body: RegisterIn, db: DbSession, now: Now) -> TokenOut:
    """Create a caregiver account with an invite link or a family share link. Admins (KHAYAL_ADMIN_EMAILS)
    need no link. Records the consent to the privacy policy and terms."""
    signup = invites.find_signup_invite(db, body.invite_token, now) if body.invite_token else None
    share = invites.find_share(db, body.invite_token, now) if body.invite_token and signup is None else None
    if signup is None and share is None and body.email not in config.ADMIN_EMAILS:
        raise INVALID_INVITE
    try:
        user = auth.register_user(
            db, name=body.name, email=body.email, password=body.password, role=Role.caregiver,
            demo_expires_at=accounts.demo_expiry(now), commit=False,
        )
    except auth.EmailTakenError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")
    consent.record(db, user, ConsentKind.processing, now)
    if signup is not None:
        signup.used_at = now
        signup.used_by = user.id
    db.commit()
    if share is not None:
        invites.accept_share(db, share, user, now)
    return TokenOut(access_token=auth.token_for(user), user=user_out(user))


@router.post("/login", response_model=TokenOut, dependencies=[Depends(rate_limit("login"))])
def login(body: LoginIn, db: DbSession, background: BackgroundTasks, factory: SessionFactory) -> TokenOut:
    user = auth.authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect")
    # The free host sleeps when idle: catch up on reminder checks (and demo clean-up in demo mode).
    background.add_task(housekeeping_after_login, factory)
    return TokenOut(access_token=auth.token_for(user), user=user_out(user))


@router.post("/password", response_model=TokenOut)
def change_password(body: ChangePasswordIn, caregiver: CurrentCaregiver, db: DbSession) -> TokenOut:
    """Change the password. Every other session is signed out; this one gets a fresh token."""
    try:
        auth.change_password(db, caregiver, body.current_password, body.new_password)
    except auth.WrongPasswordError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The current password is not right")
    return TokenOut(access_token=auth.token_for(caregiver), user=user_out(caregiver))


@router.post("/reset", response_model=TokenOut, dependencies=[Depends(rate_limit("pair"))])
def reset_password(body: ResetPasswordIn, db: DbSession, now: Now) -> TokenOut:
    """Set a new password with an admin-made reset link; signs out every other session."""
    user = resets.use(db, body.token, body.new_password, now)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This reset link is not valid any more.")
    return TokenOut(access_token=auth.token_for(user), user=user_out(user))


@router.post("/pair", response_model=TokenOut, dependencies=[Depends(rate_limit("pair"))])
def pair(
    body: PairIn,
    request: Request,
    db: DbSession,
    now: Now,
    background: BackgroundTasks,
    factory: SessionFactory,
    user_agent: Annotated[str, Header()] = "",
) -> TokenOut:
    """A patient's device signs in with the caregiver's 6-digit code and stays signed in for 90 days,
    as its own device session that the family can revoke."""
    client = client_address(request)
    if pairing.limiter.blocked(client, now):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many tries, please wait")
    redeemed = pairing.redeem_code(db, body.code, now)
    if redeemed is None:
        pairing.limiter.record_failure(client, now)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code did not work")
    patient, paired_by = redeemed
    pairing.limiter.reset(client)
    background.add_task(housekeeping_after_login, factory)
    session = devices.start(db, patient, paired_by, user_agent, now)
    token = auth.token_for(patient, lifetime=pairing.DEVICE_LIFETIME, session_id=session.id)
    return TokenOut(access_token=token, user=user_out(patient))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def set_my_language(body: MyLanguageIn, caregiver: CurrentCaregiver, db: DbSession) -> UserOut:
    """A caregiver's own screen language (batch 5b): English or Hindi, stored as their `language`.
    The elders' app languages are set per elder (PATCH /patients/{id})."""
    caregiver.language = body.language
    db.commit()
    return user_out(caregiver)
