"""FastAPI dependencies: DB session, current user, role and care-link checks."""

import math
from collections.abc import Callable
from datetime import datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Role, User
from app.services import auth, care, ratelimit
from app.services.clock import utc_now

DbSession = Annotated[Session, Depends(get_db)]


def get_now() -> datetime:
    """The current time (UTC). A dependency so tests can pin the clock."""
    return utc_now()


Now = Annotated[datetime, Depends(get_now)]

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    user_id = auth.decode_access_token(credentials.credentials)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(role: Role) -> Callable[[User], User]:
    def checker(user: CurrentUser) -> User:
        if user.role != role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Only {role.value}s can do this")
        return user

    return checker


CurrentCaregiver = Annotated[User, Depends(require_role(Role.caregiver))]
CurrentPatient = Annotated[User, Depends(require_role(Role.patient))]


def ensure_patient_access(db: Session, user: User, patient_id: int) -> None:
    """Raise 403 unless `user` may see `patient_id`'s data. Call from every patient-scoped route."""
    if not care.can_access_patient(db, user, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this patient")


def client_address(request: Request) -> str:
    """The caller's address (the real one behind the host's proxy when uvicorn runs with --proxy-headers)."""
    return request.client.host if request.client else "unknown"


def rate_limit(name: str) -> Callable[[Request, datetime], None]:
    """A dependency that allows a few requests per address (services/ratelimit.py), else 429."""
    limiter = ratelimit.LIMITS[name]

    def check(request: Request, now: Now) -> None:
        wait = limiter.hit(client_address(request), now)
        if wait is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many tries, please wait a few minutes",
                headers={"Retry-After": str(math.ceil(wait))},
            )

    return check
