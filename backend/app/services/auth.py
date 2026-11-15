"""Passwords, JWT tokens, accounts and admins.

Every token carries the user's `token_version` ("v"); bumping it (password change, "sign out
all devices") ends every older session at once. Tokens for a paired elder device also carry
its device session id ("sid"), so one device can be revoked on its own (services/devices.py).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import Role, User

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class EmailTakenError(Exception):
    pass


class WrongPasswordError(Exception):
    pass


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _pwd.verify(password, password_hash)
    except ValueError:  # not a hash we know: never a match
        return False


def create_access_token(
    user_id: int, lifetime: timedelta | None = None, version: int = 0, session_id: int | None = None
) -> str:
    expire = datetime.now(timezone.utc) + (lifetime or timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES))
    claims: dict[str, object] = {"sub": str(user_id), "exp": expire, "v": version}
    if session_id is not None:
        claims["sid"] = session_id
    return jwt.encode(claims, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def token_for(user: User, lifetime: timedelta | None = None, session_id: int | None = None) -> str:
    return create_access_token(user.id, lifetime=lifetime, version=user.token_version, session_id=session_id)


@dataclass(frozen=True)
class Claims:
    user_id: int
    version: int
    session_id: int | None


def decode_token(token: str) -> Claims | None:
    """The claims of a valid, unexpired token, or None. Tokens from before versions are version 0."""
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
        sid = payload.get("sid")
        return Claims(int(payload["sub"]), int(payload.get("v", 0)), int(sid) if sid is not None else None)
    except (JWTError, KeyError, ValueError, TypeError):
        return None


def decode_access_token(token: str) -> int | None:
    """The user id in a valid token (kept for callers that only need the id)."""
    claims = decode_token(token)
    return claims.user_id if claims else None


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def register_user(
    db: Session,
    *,
    name: str,
    email: str | None,
    password: str | None = None,
    password_hash: str | None = None,
    role: Role,
    demo_expires_at: datetime | None = None,
    commit: bool = True,
) -> User:
    """Create an account. Caregivers have an email and a password (or a shared demo hash);
    elders added by a caregiver have neither."""
    if email is not None:
        email = email.strip().lower()
        if get_user_by_email(db, email) is not None:
            raise EmailTakenError(email)
    if password_hash is None and password is not None:
        password_hash = hash_password(password)
    user = User(name=name, email=email, password_hash=password_hash, role=role, demo_expires_at=demo_expires_at)
    db.add(user)
    if commit:
        db.commit()
    else:
        db.flush()
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def set_password(db: Session, user: User, new_password: str) -> None:
    """Set a new password and sign out every other session (bumps the token version)."""
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    db.commit()


def change_password(db: Session, user: User, current: str, new_password: str) -> None:
    if not verify_password(current, user.password_hash):
        raise WrongPasswordError()
    set_password(db, user, new_password)


def sign_out_everywhere(db: Session, user: User) -> None:
    user.token_version += 1
    db.commit()


def is_admin(user: User) -> bool:
    return user.role == Role.caregiver and user.email is not None and user.email.lower() in config.ADMIN_EMAILS
