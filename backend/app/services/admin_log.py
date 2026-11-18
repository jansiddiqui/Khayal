"""The admin activity log (Round 2 batch 3): every admin action, with who and when."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdminLog, User

LOG_LIMIT = 300


def record(db: Session, admin: User, action: str, detail: str = "", now: datetime | None = None) -> None:
    """Add an entry; the caller commits (usually with the action itself)."""
    entry = AdminLog(admin_id=admin.id, admin_email=admin.email or f"user {admin.id}", action=action, detail=detail[:500])
    if now is not None:
        entry.at = now
    db.add(entry)


def entries(db: Session, action: str | None = None, limit: int = LOG_LIMIT) -> list[AdminLog]:
    stmt = select(AdminLog).order_by(AdminLog.at.desc(), AdminLog.id.desc()).limit(limit)
    if action:
        stmt = stmt.where(AdminLog.action == action)
    return list(db.scalars(stmt))
