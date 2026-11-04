from datetime import date, datetime, time, timezone
from enum import Enum
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, Time, UniqueConstraint
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


class ReminderType(str, Enum):
    medicine = "medicine"
    meal = "meal"
    appointment = "appointment"
    other = "other"


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    type: Mapped[ReminderType] = mapped_column(SAEnum(ReminderType, native_enum=False, length=16))
    # Local wall-clock time (app clock), e.g. 09:00.
    time_of_day: Mapped[time] = mapped_column(Time)
    # Weekdays it repeats on, 0 = Monday ... 6 = Sunday.
    days_of_week: Mapped[list[int]] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(default=True)
    # Occurrences before this are never counted as missed.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    logs: Mapped[list["ReminderLog"]] = relationship(back_populates="reminder", cascade="all, delete-orphan")


class ReminderStatus(str, Enum):
    done = "done"
    missed = "missed"


class MarkedBy(str, Enum):
    patient = "patient"
    caregiver = "caregiver"


class ReminderLog(Base):
    __tablename__ = "reminder_logs"
    __table_args__ = (UniqueConstraint("reminder_id", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    reminder_id: Mapped[int] = mapped_column(ForeignKey("reminders.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[ReminderStatus] = mapped_column(SAEnum(ReminderStatus, native_enum=False, length=16))
    # Who pressed Done; None for automatic "missed" logs. Only patient-marked ones count as adherence.
    marked_by: Mapped[MarkedBy | None] = mapped_column(SAEnum(MarkedBy, native_enum=False, length=16), default=None)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    reminder: Mapped[Reminder] = relationship(back_populates="logs")


class AlertType(str, Enum):
    decline = "decline"
    missed_reminders = "missed_reminders"
    speech_risk = "speech_risk"


class Severity(str, Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[AlertType] = mapped_column(SAEnum(AlertType, native_enum=False, length=32))
    message: Mapped[str] = mapped_column(String(500))
    severity: Mapped[Severity] = mapped_column(SAEnum(Severity, native_enum=False, length=16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    acknowledged: Mapped[bool] = mapped_column(default=False)
