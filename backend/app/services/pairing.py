"""Device pairing for patients (CLAUDE.md section 4).

A linked caregiver creates a 6-digit code, valid for PAIRING_CODE_MINUTES and usable once.
The patient's device enters it and receives a token that lasts PAIRED_DEVICE_DAYS, so a
person with memory problems never needs a password. A new code replaces any earlier
unused one for the same patient. Wrong codes are limited per client address.
"""

import hashlib
import hmac
import secrets
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import config
from app.models import PairingCode, User
from app.services.clock import as_utc

CODE_DIGITS = 6
CODE_LIFETIME = timedelta(minutes=config.PAIRING_CODE_MINUTES)
DEVICE_LIFETIME = timedelta(days=config.PAIRED_DEVICE_DAYS)


def _hash(code: str) -> str:
    return hmac.new(config.JWT_SECRET.encode(), code.encode(), hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class NewCode:
    code: str
    expires_at: datetime


def create_code(db: Session, caregiver: User, patient: User, now: datetime) -> NewCode:
    """A fresh code for `patient`. Earlier unused codes for the patient stop working."""
    db.execute(
        update(PairingCode)
        .where(PairingCode.patient_id == patient.id, PairingCode.used_at.is_(None))
        .values(expires_at=now)
    )
    while True:
        code = f"{secrets.randbelow(10**CODE_DIGITS):0{CODE_DIGITS}d}"
        if _active(db, code, now) is None:  # never two live codes with the same digits
            break
    expires_at = now + CODE_LIFETIME
    db.add(PairingCode(patient_id=patient.id, created_by=caregiver.id, code_hash=_hash(code), expires_at=expires_at))
    db.commit()
    return NewCode(code=code, expires_at=expires_at)


def _active(db: Session, code: str, now: datetime) -> PairingCode | None:
    rows = db.scalars(
        select(PairingCode).where(PairingCode.code_hash == _hash(code), PairingCode.used_at.is_(None))
    ).all()
    return next((r for r in rows if as_utc(r.expires_at) > now), None)


def redeem(db: Session, code: str, now: datetime) -> User | None:
    """The patient for a valid, unused code (marking it used), or None."""
    row = _active(db, code, now)
    if row is None:
        return None
    row.used_at = now
    db.commit()
    return db.get(User, row.patient_id)


class FailureLimiter:
    """Counts wrong codes per client address over a sliding window (in memory)."""

    def __init__(self, limit: int = config.PAIRING_MAX_FAILURES, window: timedelta = CODE_LIFETIME) -> None:
        self.limit = limit
        self.window = window
        self._failures: dict[str, deque[datetime]] = defaultdict(deque)

    def _prune(self, key: str, now: datetime) -> deque[datetime]:
        q = self._failures[key]
        while q and q[0] <= now - self.window:
            q.popleft()
        return q

    def blocked(self, key: str, now: datetime) -> bool:
        return len(self._prune(key, now)) >= self.limit

    def record_failure(self, key: str, now: datetime) -> None:
        self._prune(key, now).append(now)

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


limiter = FailureLimiter()
