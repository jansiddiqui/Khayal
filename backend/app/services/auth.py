"""Password hashing, JWT tokens and user registration."""

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


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password, password_hash)


def create_access_token(user_id: int, lifetime: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (lifetime or timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES))
    return jwt.encode({"sub": str(user_id), "exp": expire}, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> int | None:
    """Return the user id in a valid token, or None if it is invalid or expired."""
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def register_user(db: Session, *, name: str, email: str, password: str, role: Role) -> User:
    if get_user_by_email(db, email) is not None:
        raise EmailTakenError(email)
    user = User(name=name, email=email, password_hash=hash_password(password), role=role)
    db.add(user)
    db.commit()
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user
