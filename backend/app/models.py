from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    patient = "patient"
    caregiver = "caregiver"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(SAEnum(Role, native_enum=False, length=16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CareLink(Base):
    __tablename__ = "care_links"
    __table_args__ = (UniqueConstraint("caregiver_id", "patient_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    caregiver_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class GameType(str, Enum):
    memory_match = "memory_match"
    sequence_recall = "sequence_recall"


class GameSession(Base):
    """One play-through of a game: a block of rounds at a single level.

    `level_start` -> `level_end` records every adaptive level change.
    """

    __tablename__ = "game_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    game_type: Mapped[GameType] = mapped_column(SAEnum(GameType, native_enum=False, length=32))
    level_start: Mapped[int]
    level_end: Mapped[int]
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    rounds_played: Mapped[int]
    rounds_correct: Mapped[int]
    avg_reaction_ms: Mapped[float]
    hints_used: Mapped[int]
    emotion_summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)

    rounds: Mapped[list["GameRound"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="GameRound.id"
    )


class GameRound(Base):
    __tablename__ = "game_rounds"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("game_sessions.id", ondelete="CASCADE"), index=True)
    level: Mapped[int]
    correct: Mapped[bool]
    reaction_ms: Mapped[int]
    hint_used: Mapped[bool]

    session: Mapped[GameSession] = relationship(back_populates="rounds")


class PlayerLevel(Base):
    __tablename__ = "player_levels"

    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    game_type: Mapped[GameType] = mapped_column(SAEnum(GameType, native_enum=False, length=32), primary_key=True)
    current_level: Mapped[int]
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
