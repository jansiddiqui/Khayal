from datetime import date, datetime, time, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models import LEVELLED_GAMES, AlertType, GameType, MarkedBy, ReminderType, Role, Severity
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


class PairIn(BaseModel):
    code: Annotated[str, Field(pattern=r"^\d{6}$")]


class PairingCodeOut(BaseModel):
    code: str
    expires_at: datetime


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
    study_ms: Annotated[int, Field(ge=0, le=3_600_000)] | None = None


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
    # Who marked today's occurrence done, if anyone.
    today_marked_by: MarkedBy | None = None


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


class AdherenceOut(BaseModel):
    days: int
    done_by_patient: int
    done_by_caregiver: int
    missed: int
    rate: float | None


class FamilyMemberIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    relation: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class FamilyPhotoOut(BaseModel):
    id: str
    # Path under /api; the request needs the usual Authorization header.
    url: str


class FamilyMemberOut(BaseModel):
    id: int
    patient_id: int
    name: str
    relation: str
    note: str | None
    photos: list[FamilyPhotoOut]


DeclineStatus = Literal["insufficient", "stable", "warning", "critical"]
IndexStatus = Literal["insufficient", "stable", "watch", "declining"]


class PatientSummaryOut(PatientOut):
    """A linked patient with their overall cognitive index for the dashboard list."""

    cognitive_index: float | None
    cognitive_status: IndexStatus


class TrendPointOut(BaseModel):
    session_id: int
    started_at: datetime
    composite: float
    rolling_mean: float | None
    z: float | None


class GameTrendOut(BaseModel):
    game_type: GameType
    status: DeclineStatus
    z: float | None
    score: float | None
    baseline_mean: float | None
    baseline_std: float | None
    sessions: int
    sessions_needed: int
    z_raw: float | None
    explanation: str
    points: list[TrendPointOut]


class IndexPointOut(BaseModel):
    date: date
    index: float


class TrendOut(BaseModel):
    cognitive_index: float | None
    cognitive_status: IndexStatus
    index_history: list[IndexPointOut]
    games: list[GameTrendOut]


class SignalsOut(BaseModel):
    days: int
    sessions: int
    stopped_early_rate: float | None
    hint_rate: float | None
    adherence: AdherenceOut
