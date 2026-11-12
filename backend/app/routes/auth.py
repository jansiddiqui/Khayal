from fastapi import APIRouter, HTTPException, Request, status

from app.deps import CurrentUser, DbSession, Now
from app.schemas import LoginIn, PairIn, RegisterIn, TokenOut, UserOut
from app.services import auth, pairing

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: DbSession) -> TokenOut:
    try:
        user = auth.register_user(db, name=body.name, email=body.email, password=body.password, role=body.role)
    except auth.EmailTakenError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")
    return TokenOut(access_token=auth.create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: DbSession) -> TokenOut:
    user = auth.authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect")
    return TokenOut(access_token=auth.create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/pair", response_model=TokenOut)
def pair(body: PairIn, request: Request, db: DbSession, now: Now) -> TokenOut:
    """A patient's device signs in with the caregiver's 6-digit code and stays signed in for 90 days."""
    client = request.client.host if request.client else "unknown"
    if pairing.limiter.blocked(client, now):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many tries, please wait")
    patient = pairing.redeem(db, body.code, now)
    if patient is None:
        pairing.limiter.record_failure(client, now)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code did not work")
    pairing.limiter.reset(client)
    token = auth.create_access_token(patient.id, lifetime=pairing.DEVICE_LIFETIME)
    return TokenOut(access_token=token, user=UserOut.model_validate(patient))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
