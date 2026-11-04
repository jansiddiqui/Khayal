from datetime import datetime, time, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models import LEVELLED_GAMES, AlertType, GameType, ReminderType, Role, Severity
from ml.adaptive.rule_based import BLOCK_SIZE

# Lightweight email check (no email-validator dependency); normalised to lower case.
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
]


class HealthOut(BaseModel):
    status: Literal["ok"]
    app: str


class RegisterIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    email: Email
    password: Annotated[str, Field(min_length=8, max_length=72)]
    role: Role


class LoginIn(BaseModel):
    email: Email
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: Role
    created_at: datetime
    city: str | None = None
    pinned_games: list[GameType] | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class LinkPatientIn(BaseModel):
    patient_email: Email


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    city: str | None = None
    pinned_games: list[GameType] | None = None


class PatientUpdateIn(BaseModel):
    """Only the fields sent are changed."""

    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    # Two different levelled games for slots 2-3 of "Today's games"; null = automatic.
    pinned_games: list[GameType] | None = None

    @model_validator(mode="after")
    def _check_pins(self) -> "PatientUpdateIn":
        pins = self.pinned_games
        if pins is not None and (len(pins) != 2 or len(set(pins)) != 2 or not set(pins) <= set(LEVELLED_GAMES)):
            raise ValueError("pinned_games must be two different games that have levels")
        return self


class LevelOut(BaseModel):
    game_type: GameType
    level: int


class RoundIn(BaseModel):
    correct: bool
    reaction_ms: Annotated[int, Field(ge=0, le=600_000)] | None
    hint_used: bool = False


def _to_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


class SessionIn(BaseModel):
    game_type: GameType
    started_at: datetime
    ended_at: datetime
    rounds: Annotated[list[RoundIn], Field(min_length=1, max_length=BLOCK_SIZE)]
    # A finished session has all BLOCK_SIZE rounds; a stopped-early one has fewer.
    completed: bool = True

    @model_validator(mode="after")
    def _check(self) -> "SessionIn":
        # Store UTC (SQLite keeps no zone); a time without a zone is taken as UTC.
        self.started_at = _to_utc(self.started_at)
        self.ended_at = _to_utc(self.ended_at)
        if self.ended_at < self.started_at:
            raise ValueError("ended_at must not be before started_at")
        if self.completed != (len(self.rounds) == BLOCK_SIZE):
            raise ValueError(f"a completed session has exactly {BLOCK_SIZE} rounds; a stopped one has fewer")
        return self


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    game_type: GameType
    level_start: int
    level_end: int
    started_at: datetime
    ended_at: datetime
    rounds_played: int
    rounds_correct: int
    avg_reaction_ms: float | None
    hints_used: int
    completed: bool


LevelChange = Literal["up", "down", "same"]


class SessionResultOut(BaseModel):
    session: SessionOut
    new_level: int
    level_change: LevelChange


class TodayGameOut(BaseModel):
    game_type: GameType
    done_today: bool


class TodayGamesOut(BaseModel):
    games: list[TodayGameOut]
    pinned: bool


Weekday = Annotated[int, Field(ge=0, le=6)]


class ReminderIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    type: ReminderType
    time_of_day: time
    # 0 = Monday ... 6 = Sunday
    days_of_week: Annotated[list[Weekday], Field(min_length=1, max_length=7)]
    active: bool = True

    @model_validator(mode="after")
    def _normalise(self) -> "ReminderIn":
        self.days_of_week = sorted(set(self.days_of_week))
        self.time_of_day = self.time_of_day.replace(second=0, microsecond=0, tzinfo=None)
        return self


TodayStatus = Literal["done", "missed", "pending"]


class ReminderOut(BaseModel):
    id: int
    patient_id: int
    title: str
    type: ReminderType
    time_of_day: time
    days_of_week: list[int]
    active: bool
    # Status of today's occurrence; null when it isn't scheduled today (or is inactive).
    today_status: TodayStatus | None


class TodayReminderOut(BaseModel):
    id: int
    title: str
    type: ReminderType
    time_of_day: time
    status: TodayStatus
    # True once its time has come.
    due: bool


class ReminderLogIn(BaseModel):
    status: Literal["done"] = "done"


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    type: AlertType
    message: str
    severity: Severity
    created_at: datetime
    acknowledged: bool
