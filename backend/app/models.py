from datetime import date, datetime, time, timezone
from enum import Enum
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, LargeBinary, String, Time, UniqueConstraint, false, text
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
    # Caregivers sign in with email + password. Elders (patients) added by a caregiver have
    # neither: their devices sign in with a pairing code (CLAUDE.md section 11, Phase B).
    email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True, default=None)
    password_hash: Mapped[str | None] = mapped_column(String(255), default=None)
    role: Mapped[Role] = mapped_column(SAEnum(Role, native_enum=False, length=16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Patients only: home city, set by a caregiver, used by Daily Orientation.
    city: Mapped[str | None] = mapped_column(String(80), default=None)
    # Patients only: two game types a caregiver fixed in slots 2-3 of "Today's games", or None.
    pinned_games: Mapped[list[str] | None] = mapped_column(JSON, default=None)
    # Patients only: the weekly voice task needs a caregiver's consent; off by default.
    voice_task_enabled: Mapped[bool] = mapped_column(default=False, server_default=false())
    # When the voice task was last turned on (consent date); None while it is off.
    voice_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # Public demo only: the account and all its data are deleted after this time. None = kept.
    demo_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None, index=True)
    # Bumped to sign out every existing session (password change, "sign out all devices").
    token_version: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    # Patients only: family photos (and the elder's own photo) need a separate opt-in.
    photos_enabled: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Patients only: storage key of the elder's own photo (services/storage.py), if any.
    photo_key: Mapped[str | None] = mapped_column(String(200), default=None)
    # Patients only: the 4 levelled games tracked for decline (CLAUDE.md section 7, "Core set").
    # None = the default core set (services/core_games.py).
    core_games: Mapped[list[str] | None] = mapped_column(JSON, default=None)
    # Patients only: festivals the family celebrates (About Today's festival question). None or
    # empty = the question is off (docs/games/research.md D6).
    festivals: Mapped[list[str] | None] = mapped_column(JSON, default=None)


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
    # Games v2, D4: the words of the last Remember the Words round, asked again 3-30 minutes later.
    word_recall_delayed = "word_recall_delayed"
    object_location = "object_location"
    spatial_span = "spatial_span"
    money_handling = "money_handling"
    clock_setting = "clock_setting"
    colour_trails = "colour_trails"


# Games without their own difficulty levels: never adapted (results feed trends only). Delayed
# word recall takes its level from the Word Recall session it follows (docs/games/research.md D4).
NON_ADAPTIVE_GAMES = frozenset({GameType.daily_orientation, GameType.word_recall_delayed})
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
    # How long the patient looked before playing (CLAUDE.md section 7); None for games without a study phase.
    study_ms: Mapped[int | None]
    # Games v2 (docs/games/research.md D1): wrong placements, wrong taps, the clock's error bits
    # (1 = hour, 2 = minute) or delayed-recall false alarms. None for games that don't count errors.
    # Stored for analysis; not part of the composite score.
    errors: Mapped[int | None] = mapped_column(default=None)

    session: Mapped[GameSession] = relationship(back_populates="rounds")


class PlayerLevel(Base):
    __tablename__ = "player_levels"

    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    game_type: Mapped[GameType] = mapped_column(SAEnum(GameType, native_enum=False, length=32), primary_key=True)
    current_level: Mapped[int]
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class TutorialState(Base):
    """First-time tutorial per patient per game (docs/games/research.md 3.4).

    No row: the tutorial is shown until the patient has seen it or has played the game.
    `seen_at` None: a caregiver asked for it again ("Show the tutorial again").
    """

    __tablename__ = "tutorial_states"

    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    game_type: Mapped[GameType] = mapped_column(SAEnum(GameType, native_enum=False, length=32), primary_key=True)
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class ReminderType(str, Enum):
    medicine = "medicine"
    meal = "meal"
    appointment = "appointment"
    other = "other"


class ReminderRepeat(str, Enum):
    once = "once"
    daily = "daily"
    weekly_days = "weekly_days"


class Reminder(Base):
    """A reminder and when it repeats (services/reminders.py `scheduled_on`):

    - once: only on `on_date`;
    - daily: every day from `start_date` to `end_date` (both optional, inclusive);
    - weekly_days: on `days_of_week`, from `start_date` to `end_date`.
    Dates are days on the app's local clock (services/clock.py)."""

    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    type: Mapped[ReminderType] = mapped_column(SAEnum(ReminderType, native_enum=False, length=16))
    # Local wall-clock time (app clock), e.g. 09:00.
    time_of_day: Mapped[time] = mapped_column(Time)
    repeat: Mapped[ReminderRepeat] = mapped_column(
        SAEnum(ReminderRepeat, native_enum=False, length=16), default=ReminderRepeat.weekly_days,
        server_default=ReminderRepeat.weekly_days.value,
    )
    # Weekdays it repeats on, 0 = Monday ... 6 = Sunday (weekly_days; all 7 for daily; empty for once).
    days_of_week: Mapped[list[int]] = mapped_column(JSON)
    # once: the day it is for.
    on_date: Mapped[date | None] = mapped_column(Date, default=None)
    # daily / weekly_days: first and last day (inclusive). No start = since it was made; no end = until stopped.
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)
    # Medicine only: how long after its time the reminder still says "It's time for this", set by
    # the caregiver. None = the standard hour (services/reminders.py ON_TIME_WINDOW). Never advice.
    late_window_minutes: Mapped[int | None] = mapped_column(default=None)
    active: Mapped[bool] = mapped_column(default=True)
    # Occurrences before this are never counted as missed.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    logs: Mapped[list["ReminderLog"]] = relationship(back_populates="reminder", cascade="all, delete-orphan")


class ReminderStatus(str, Enum):
    done = "done"
    missed = "missed"
    # The patient answered "No / not sure" after the reminder's time had passed; the family is told.
    unsure = "unsure"


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
    # Done, but confirmed only after the reminder's on-time window ("confirmed later" at logged_at).
    late: Mapped[bool] = mapped_column(default=False, server_default=false())
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    reminder: Mapped[Reminder] = relationship(back_populates="logs")


class AlertType(str, Enum):
    decline = "decline"
    missed_reminders = "missed_reminders"
    speech_risk = "speech_risk"
    # The patient answered "No / not sure" to a reminder whose time had passed (services/reminders.py).
    reminder_unsure = "reminder_unsure"


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


class PairingCode(Base):
    """A one-time 6-digit code a caregiver shows so a patient's device can sign in."""

    __tablename__ = "pairing_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Keyed hash of the code; the code itself is never stored.
    code_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class FamilyMember(Base):
    """A person in the patient's life, with private photos for "Who is this?"."""

    __tablename__ = "family_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    # Son, Daughter, Grandson, ... or the caregiver's own word.
    relation: Mapped[str] = mapped_column(String(40))
    note: Mapped[str | None] = mapped_column(String(300), default=None)
    # File names under data/uploads/family/{patient_id}/, in display order.
    photo_paths: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SpeechSample(Base):
    """One recording of the weekly "Tell me about a picture" voice task."""

    __tablename__ = "speech_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # File name under data/uploads/speech/{patient_id}/.
    audio_path: Mapped[str] = mapped_column(String(80))
    content_type: Mapped[str] = mapped_column(String(40))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    # Length of the recording as measured by the patient's browser.
    duration_ms: Mapped[int]
    # Filled by the speech model (ml/speech); None while it is the stub.
    transcript: Mapped[str | None] = mapped_column(String(10000), default=None)
    risk_score: Mapped[float | None] = mapped_column(default=None)
    model_version: Mapped[str] = mapped_column(String(40))


class StoredFile(Base):
    """An uploaded file kept in the database (KHAYAL_STORAGE=db), for hosts without
    persistent disk. Keys look like family/{patient_id}/{id}.jpg or speech/{patient_id}/{id}.webm."""

    __tablename__ = "stored_files"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    # The patient the file belongs to, so deleting an account removes their files too.
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content_type: Mapped[str] = mapped_column(String(40))
    size: Mapped[int]
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InviteRole(str, Enum):
    family = "family"
    doctor = "doctor"
    care_home = "care_home"


class InviteStatus(str, Enum):
    new = "new"
    invited = "invited"
    declined = "declined"


class InviteRequest(Base):
    """A request for an invite to the pilot, from the landing page. Reviewed by an admin (Phase B)."""

    __tablename__ = "invite_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), index=True)
    role: Mapped[InviteRole] = mapped_column(SAEnum(InviteRole, native_enum=False, length=16))
    city: Mapped[str] = mapped_column(String(80))
    message: Mapped[str | None] = mapped_column(String(1000), default=None)
    # When the person ticked "you may contact me about the pilot"; required to store a request.
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[InviteStatus] = mapped_column(
        SAEnum(InviteStatus, native_enum=False, length=16), default=InviteStatus.new
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class SignupInvite(Base):
    """A single-use link that lets one person create a caregiver account (invite-only pilot).
    Only a hash of the token is stored; the link is shown once to the admin who made it."""

    __tablename__ = "signup_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # The landing-page request it answers, if any.
    invite_request_id: Mapped[int | None] = mapped_column(
        ForeignKey("invite_requests.id", ondelete="SET NULL"), default=None, index=True
    )
    # Who it is for, in the admin's words (name or email), to recognise it in the list.
    note: Mapped[str] = mapped_column(String(200))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    used_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class CareInvite(Base):
    """A caregiver's share link: a second family member joins the same elder (single use)."""

    __tablename__ = "care_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    used_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class PasswordReset(Base):
    """An admin-made, single-use password reset link (there is no email service yet)."""

    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class ConsentKind(str, Enum):
    # The caregiver agrees to Khayal processing their account data (privacy policy).
    processing = "processing"
    # Adding an elder: the caregiver is family or guardian, and the elder agreed or they are legally authorised.
    elder_on_behalf = "elder_on_behalf"
    # Optional features for one elder.
    photos = "photos"
    voice = "voice"
    # Round 2 batch 3: anonymised data of this elder may go into research exports (withdrawable).
    research = "research"


class Consent(Base):
    """A consent record (India DPDP Act 2023): who agreed to what, for whom, under which policy
    version, and when it was withdrawn. Records are kept, never edited, except withdrawal."""

    __tablename__ = "consents"

    id: Mapped[int] = mapped_column(primary_key=True)
    # The person who gave the consent (a caregiver).
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # The elder it is about, for elder_on_behalf, photos and voice.
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), default=None, index=True)
    kind: Mapped[ConsentKind] = mapped_column(SAEnum(ConsentKind, native_enum=False, length=24))
    # elder_on_behalf only: "elder_agreed" or "legal_authority".
    basis: Mapped[str | None] = mapped_column(String(40), default=None)
    policy_version: Mapped[str] = mapped_column(String(40))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class DeviceSession(Base):
    """An elder's device signed in with a pairing code; the family can revoke it."""

    __tablename__ = "device_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    paired_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # A short description of the browser, to tell devices apart ("Android phone, Chrome").
    device_label: Mapped[str] = mapped_column(String(120), default="")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class PatientEvent(Base):
    """A settings change about an elder, for the caregiver timeline (Round 2 batch 2): city, core
    games, pins, festivals, reminders added/changed/removed, family members, tutorials. Consents,
    device pairing, sessions, reminder logs, alerts and recordings come from their own tables."""

    __tablename__ = "patient_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Who made the change; None once that account is deleted.
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    # "settings", "reminder" or "family".
    kind: Mapped[str] = mapped_column(String(24))
    summary: Mapped[str] = mapped_column(String(300))


class SystemState(Base):
    """Small key/value facts about the server for the admin health panel (Round 2 batch 3):
    last_tick_at (external cron), last_housekeeping_at, last_start_at, last_backup_at, last_backup_by."""

    __tablename__ = "system_state"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FeedbackKind(str, Enum):
    hard = "hard"  # "Something was hard"
    liked = "liked"  # "I liked this"
    other = "other"  # caregivers: anything else


class FeedbackStatus(str, Enum):
    new = "new"
    read = "read"
    resolved = "resolved"


class Feedback(Base):
    """"Send feedback" from a caregiver (header) or a patient (Settings sheet). Read by admins."""

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), default=None, index=True)
    role: Mapped[Role] = mapped_column(SAEnum(Role, native_enum=False, length=16))
    kind: Mapped[FeedbackKind] = mapped_column(SAEnum(FeedbackKind, native_enum=False, length=16))
    text: Mapped[str | None] = mapped_column(String(2000), default=None)
    # The screen it was sent from ("/patient/games", "/caregiver/patients/3").
    page: Mapped[str | None] = mapped_column(String(200), default=None)
    # Optional voice note (patients with the voice opt-in): storage key and type.
    audio_key: Mapped[str | None] = mapped_column(String(200), default=None)
    audio_type: Mapped[str | None] = mapped_column(String(40), default=None)
    status: Mapped[FeedbackStatus] = mapped_column(
        SAEnum(FeedbackStatus, native_enum=False, length=16), default=FeedbackStatus.new
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdminLog(Base):
    """What admins did (approve, invite, reset link, backup, research export, feedback status ...)."""

    __tablename__ = "admin_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    # Kept when the admin account is deleted.
    admin_email: Mapped[str] = mapped_column(String(254))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    action: Mapped[str] = mapped_column(String(40), index=True)
    detail: Mapped[str] = mapped_column(String(500), default="")
