from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, sessionmaker

from app.background import housekeeping_after_login
from app.db import get_session_factory
from app.deps import CurrentUser, DbSession, Now, client_address, rate_limit
from app.schemas import LoginIn, PairIn, RegisterIn, TokenOut, UserOut
from app.services import accounts, auth, pairing

router = APIRouter(prefix="/auth", tags=["auth"])

SessionFactory = Annotated[sessionmaker[Session], Depends(get_session_factory)]


@router.post(
    "/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit("register"))]
)
def register(body: RegisterIn, db: DbSession, now: Now) -> TokenOut:
    try:
        user = auth.register_user(
            db, name=body.name, email=body.email, password=body.password, role=body.role,
            demo_expires_at=accounts.demo_expiry(now),
        )
    except auth.EmailTakenError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")
    return TokenOut(access_token=auth.create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut, dependencies=[Depends(rate_limit("login"))])
def login(body: LoginIn, db: DbSession, background: BackgroundTasks, factory: SessionFactory) -> TokenOut:
    user = auth.authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect")
    # The free host sleeps when idle: catch up on reminder checks and demo clean-up.
    background.add_task(housekeeping_after_login, factory)
    return TokenOut(access_token=auth.create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/pair", response_model=TokenOut, dependencies=[Depends(rate_limit("pair"))])
def pair(
    body: PairIn, request: Request, db: DbSession, now: Now, background: BackgroundTasks, factory: SessionFactory
) -> TokenOut:
    """A patient's device signs in with the caregiver's 6-digit code and stays signed in for 90 days."""
    client = client_address(request)
    if pairing.limiter.blocked(client, now):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many tries, please wait")
    patient = pairing.redeem(db, body.code, now)
    if patient is None:
        pairing.limiter.record_failure(client, now)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code did not work")
    pairing.limiter.reset(client)
    background.add_task(housekeeping_after_login, factory)
    token = auth.create_access_token(patient.id, lifetime=pairing.DEVICE_LIFETIME)
    return TokenOut(access_token=token, user=UserOut.model_validate(patient))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
