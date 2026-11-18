"""Research consent and the anonymised research export (Round 2 batch 3).

Consent: a caregiver ticks "Use my family's anonymised data for research" for one elder. It
is recorded like the other consents (with RESEARCH_POLICY_VERSION) and can be withdrawn at any
time; later exports leave that elder out. Exports already downloaded can't be called back,
which the consent text says.

Export (admin only): a zip with sessions.csv, reminders.csv and README.txt, for elders with an
active research consent who are not demo accounts. No names, emails, cities, photos,
recordings, reminder titles, notes or exact dates: each elder gets a random ID that is new in
every export, and every date becomes a day number counted from that elder's first game.
"""

import csv
import io
import secrets
import zipfile
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Consent, ConsentKind, GameSession, MoodCheckin, Reminder, ReminderLog, Role, User
from app.services.clock import as_utc, local

RESEARCH_POLICY_VERSION = "research-2026-11-draft-1"
RESEARCH_TEXT = (
    "Use my family's anonymised data for research: game results and reminder ticks, under a random ID, "
    "with no names, photos, recordings or cities. You can withdraw at any time; exports made before you "
    "withdraw can't be called back."
)

SESSION_COLUMNS = [
    "participant", "day", "game_type", "level_start", "level_end", "rounds", "correct", "hints",
    "avg_reaction_ms", "completed",
]
REMINDER_COLUMNS = ["participant", "day", "reminder_type", "status", "confirmed_later", "marked_by"]
MOOD_COLUMNS = ["participant", "day", "mood"]


def has_consent(db: Session, patient_id: int) -> bool:
    return (
        db.scalar(
            select(Consent.id).where(
                Consent.patient_id == patient_id, Consent.kind == ConsentKind.research, Consent.withdrawn_at.is_(None)
            )
        )
        is not None
    )


def set_consent(db: Session, caregiver: User, patient: User, granted: bool, now: datetime) -> None:
    if granted and not has_consent(db, patient.id):
        db.add(
            Consent(
                user_id=caregiver.id, patient_id=patient.id, kind=ConsentKind.research,
                policy_version=RESEARCH_POLICY_VERSION, granted_at=now,
            )
        )
    elif not granted:
        for c in db.scalars(
            select(Consent).where(
                Consent.patient_id == patient.id, Consent.kind == ConsentKind.research, Consent.withdrawn_at.is_(None)
            )
        ):
            c.withdrawn_at = now
    db.commit()


def consented_elders(db: Session) -> list[int]:
    ids = db.scalars(
        select(Consent.patient_id)
        .join(User, User.id == Consent.patient_id)
        .where(
            Consent.kind == ConsentKind.research,
            Consent.withdrawn_at.is_(None),
            User.role == Role.patient,
            User.demo_expires_at.is_(None),
        )
        .distinct()
    )
    return sorted(i for i in ids if i is not None)


def _csv(columns: list[str], rows: list[dict[str, object]]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue()


def build(db: Session, now: datetime) -> tuple[bytes, int]:
    """The export zip and how many elders are in it."""
    elders = consented_elders(db)
    # Random per export and shuffled, so neither the order nor the ID points back to an account.
    codes = {pid: f"P{secrets.token_hex(4)}" for pid in elders}
    sessions: list[dict[str, object]] = []
    reminders: list[dict[str, object]] = []
    moods: list[dict[str, object]] = []
    for pid in elders:
        played = list(
            db.scalars(select(GameSession).where(GameSession.patient_id == pid).order_by(GameSession.started_at))
        )
        logs = list(
            db.scalars(
                select(ReminderLog)
                .join(Reminder, Reminder.id == ReminderLog.reminder_id)
                .where(Reminder.patient_id == pid)
                .order_by(ReminderLog.date)
            )
        )
        checkins = list(db.scalars(select(MoodCheckin).where(MoodCheckin.patient_id == pid).order_by(MoodCheckin.date)))
        starts = [local(as_utc(s.started_at)).date() for s in played] + [log.date for log in logs] + [m.date for m in checkins]
        if not starts:
            continue
        origin: date = min(starts)
        for s in played:
            sessions.append(
                {
                    "participant": codes[pid],
                    "day": (local(as_utc(s.started_at)).date() - origin).days,
                    "game_type": s.game_type.value,
                    "level_start": s.level_start,
                    "level_end": s.level_end,
                    "rounds": s.rounds_played,
                    "correct": s.rounds_correct,
                    "hints": s.hints_used,
                    "avg_reaction_ms": "" if s.avg_reaction_ms is None else round(s.avg_reaction_ms),
                    "completed": int(s.completed),
                }
            )
        for m in checkins:
            moods.append({"participant": codes[pid], "day": (m.date - origin).days, "mood": m.mood.value if m.mood else "skipped"})
        for log in logs:
            reminders.append(
                {
                    "participant": codes[pid],
                    "day": (log.date - origin).days,
                    "reminder_type": log.reminder.type.value,
                    "status": log.status.value,
                    "confirmed_later": int(log.late),
                    "marked_by": log.marked_by.value if log.marked_by is not None else "automatic",
                }
            )
    sessions.sort(key=lambda r: (str(r["participant"]), int(r["day"])))  # type: ignore[call-overload]
    reminders.sort(key=lambda r: (str(r["participant"]), int(r["day"])))  # type: ignore[call-overload]
    moods.sort(key=lambda r: (str(r["participant"]), int(r["day"])))  # type: ignore[call-overload]
    readme = (
        "Khayal research export (anonymised)\n"
        f"Made on {local(now).date().isoformat()}. Families with an active research consent only "
        f"({len(codes)}).\n\n"
        "participant: a random ID, new in every export. day: days since that participant's first record.\n"
        "No names, emails, cities, photos, recordings, reminder titles or exact dates are included.\n\n"
        f"sessions.csv: {', '.join(SESSION_COLUMNS)}\n"
        f"reminders.csv: {', '.join(REMINDER_COLUMNS)}\n"
        f"mood.csv: {', '.join(MOOD_COLUMNS)} (good / okay / not_so_good / skipped)\n"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.txt", readme)
        z.writestr("sessions.csv", _csv(SESSION_COLUMNS, sessions))
        z.writestr("reminders.csv", _csv(REMINDER_COLUMNS, reminders))
        z.writestr("mood.csv", _csv(MOOD_COLUMNS, moods))
    return buf.getvalue(), len(codes)
