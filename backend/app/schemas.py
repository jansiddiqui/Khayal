from datetime import date, datetime, time, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models import AlertType, GameType, InviteRole, LEVELLED_GAMES, MarkedBy, ReminderType, Role, Severity
from ml.adaptive.rule_based import BLOCK_SIZE

# Lightweight email check (no email-validator dependency); normalised to lower case.
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
]


class HealthOut(BaseModel):
    status: Literal["ok"]
    app: str


class AppConfigOut(BaseModel):
    """Public settings the frontend needs (no secrets)."""

    demo_mode: bool
    # The voice task stops by itself after this long.
    recording_limit_seconds: int
    # Demo accounts are deleted this many days after they are made.
    demo_account_days: int
    # Where people can write to the team (KHAYAL_CONTACT_EMAIL); None when not set.
    contact_email: str | None = None


class InviteRequestIn(BaseModel):
    """'Request an invite' from the landing page."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    email: Email
    role: InviteRole
    city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None
    # Must be true: the person agrees to be contacted about the pilot.
    consent: Literal[True]
    # Left empty by people; bots that fill every field are thanked and ignored.
    website: Annotated[str, StringConstraints(max_length=200)] | None = None


class InviteRequestOut(BaseModel):
    received: Literal[True] = True


class TickOut(BaseModel):
    reminder_patients: int | None
    accounts_removed: int | None
    skipped: bool


# Passwords: at least 10 characters (bcrypt reads at most 72 bytes).
Password = Annotated[str, Field(min_length=10, max_length=72)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
LinkToken = Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=100)]


class RegisterIn(BaseModel):
    """Caregiver sign-up: only with an invite link (or a family share link), except for admins."""

    name: Name
    email: Email
    password: Password
    # The token from an invite link (/join/<token>) or a family share link (/share/<token>).
    invite_token: LinkToken | None = None
    # Must be true: agreement to the privacy policy and terms (recorded with the policy version).
    consent: Literal[True]


class InviteCheckOut(BaseModel):
    """What an invite or share link is, before signing up with it."""

    kind: Literal["signup", "share"]
    # Share links: the elder's first name, so the person knows whom they are joining.
    elder_name: str | None = None
    expires_at: datetime


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: Password


class ResetPasswordIn(BaseModel):
    token: LinkToken
    new_password: Password


class ShareAcceptIn(BaseModel):
    token: LinkToken


class LoginIn(BaseModel):
    email: Email
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None = None
    role: Role
    created_at: datetime
    city: str | None = None
    pinned_games: list[GameType] | None = None
    voice_task_enabled: bool = False
    voice_consent_at: datetime | None = None
    # Public demo only: when this account and its data are deleted.
    demo_expires_at: datetime | None = None
    # Patients only: the separate opt-in for family photos (and the elder's own photo).
    photos_enabled: bool = False
    has_photo: bool = False
    # Caregivers only: may open the admin page (KHAYAL_ADMIN_EMAILS).
    is_admin: bool = False


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class PairIn(BaseModel):
    code: Annotated[str, Field(pattern=r"^\d{6}$")]


class PairingCodeOut(BaseModel):
    code: str
    expires_at: datetime


class DemoStartOut(TokenOut):
    """A fresh demo caregiver (signed in) and a pairing code for one of their demo patients."""

    patient_id: int
    patient_name: str
    pairing: PairingCodeOut


class AddElderIn(BaseModel):
    """A caregiver adds the elder they look after. No email or password: the elder's device pairs with a code."""

    name: Name
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    # The caregiver confirms they are family or guardian, and on what basis they act for the elder.
    is_family_or_guardian: Literal[True]
    basis: Literal["elder_agreed", "legal_authority"]
    # Separate, optional opt-ins.
    photos: bool = False
    voice: bool = False


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    city: str | None = None
    pinned_games: list[GameType] | None = None
    voice_task_enabled: bool = False
    voice_consent_at: datetime | None = None
    photos_enabled: bool = False
    has_photo: bool = False


class ConsentToggleIn(BaseModel):
    kind: Literal["photos", "voice"]
    granted: bool


class ConsentToggleOut(BaseModel):
    patient: PatientOut
    # Files or recordings deleted by a withdrawal.
    deleted: int


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    basis: str | None
    policy_version: str
    granted_at: datetime
    withdrawn_at: datetime | None
    patient_id: int | None


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_label: str
    created_at: datetime
    last_seen_at: datetime


class LinkOut(BaseModel):
    """A secret link's token, shown once; the frontend builds the full address."""

    id: int
    token: str
    expires_at: datetime


class ShareOut(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    state: Literal["open", "used", "revoked", "expired"]


class DeleteAccountIn(BaseModel):
    confirm: Literal["DELETE"]
    password: str


class AdminInviteRequestOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    city: str
    message: str | None
    status: str
    created_at: datetime


class AdminInviteIn(BaseModel):
    """Invite someone directly (without a landing-page request)."""

    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class AdminInviteOut(BaseModel):
    id: int
    note: str
    created_at: datetime
    expires_at: datetime
    state: Literal["open", "used", "revoked", "expired"]
    used_by_email: str | None = None


class AdminUserOut(BaseModel):
    id: int
    name: str
    email: str | None
    role: Role
    created_at: datetime
    is_admin: bool
    is_demo: bool
    elders: int


class DemoAccountsOut(BaseModel):
    count: int


class DemoRemoveIn(BaseModel):
    # The count the admin saw, typed back: removes only if it still matches.
    confirm_count: int


class RemovedOut(BaseModel):
    removed: int


class PatientUpdateIn(BaseModel):
    """Only the fields sent are changed."""

    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    # Two different levelled games for slots 2-3 of "Today's games"; null = automatic.
    pinned_games: list[GameType] | None = None
    # Caregiver consent for the weekly voice task.
    voice_task_enabled: bool | None = None

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
    # "voice_task" is the weekly "Tell me about a picture" (slot 3 when it is due).
    game_type: GameType | Literal["voice_task"]
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
    # Alert status (warning/critical thresholds, CLAUDE.md section 6).
    status: DeclineStatus
    # The same words and thresholds as the overall index (Stable / Watch / Declining), for display.
    trend_status: IndexStatus
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


class SpeechSampleOut(BaseModel):
    """A voice-task recording. transcript and risk_score stay null until a real model exists."""

    id: int
    recorded_at: datetime
    duration_ms: int
    transcript: str | None
    risk_score: float | None
    model_version: str
    audio_url: str
