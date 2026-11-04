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
    # Patients only: home city, set by a caregiver, used by Daily Orientation.
    city: Mapped[str | None] = mapped_column(String(80), default=None)
    # Patients only: two game types a caregiver fixed in slots 2-3 of "Today's games", or None.
    pinned_games: Mapped[list[str] | None] = mapped_column(JSON, default=None)


class CareLink(Base):
    __tablename__ = "care_links"
    __table_args__ = (UniqueConstraint("caregiver_id", "patient_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    caregiver_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class GameType(str, Enum):
    memory_match = "memory_match"
    sequence_recall = "sequence_recall"
    word_recall = "word_recall"
    daily_orientation = "daily_orientation"
    reaction_tap = "reaction_tap"


# Games without difficulty levels: stored at level 1, never adapted (results feed trends only).
NON_ADAPTIVE_GAMES = frozenset({GameType.daily_orientation})
# Games with levels; these fill slots 2-3 of "Today's games".
LEVELLED_GAMES: tuple[GameType, ...] = tuple(g for g in GameType if g not in NON_ADAPTIVE_GAMES)


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
    # Mean over rounds that have a reaction time; None when none do.
    avg_reaction_ms: Mapped[float | None]
    hints_used: Mapped[int]
    # False when the patient left before finishing all rounds. Never changes the level.
    completed: Mapped[bool] = mapped_column(default=True)
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
    # None when the round has no meaningful reaction (e.g. a correctly ignored red circle).
    reaction_ms: Mapped[int | None]
    hint_used: Mapped[bool]

    session: Mapped[GameSession] = relationship(back_populates="rounds")


class PlayerLevel(Base):
    __tablename__ = "player_levels"

    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    game_type: Mapped[GameType] = mapped_column(SAEnum(GameType, native_enum=False, length=32), primary_key=True)
    current_level: Mapped[int]
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
