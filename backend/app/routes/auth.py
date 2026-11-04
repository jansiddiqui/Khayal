from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentUser, DbSession
from app.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.services import auth

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


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
