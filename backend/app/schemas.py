from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models import GameType, Role
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


class PatientUpdateIn(BaseModel):
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None


class LevelOut(BaseModel):
    game_type: GameType
    level: int


class RoundIn(BaseModel):
    correct: bool
    reaction_ms: Annotated[int, Field(ge=0, le=600_000)] | None
    hint_used: bool = False


class SessionIn(BaseModel):
    game_type: GameType
    started_at: datetime
    ended_at: datetime
    rounds: Annotated[list[RoundIn], Field(min_length=1, max_length=BLOCK_SIZE)]
    # A finished session has all BLOCK_SIZE rounds; a stopped-early one has fewer.
    completed: bool = True

    @model_validator(mode="after")
    def _check(self) -> "SessionIn":
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
