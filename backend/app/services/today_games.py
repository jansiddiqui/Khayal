"""Which 3 games a patient is offered today (CLAUDE.md section 7, "Today's games").

Slot 1 is always Daily Orientation. Slots 2-3 are the caregiver's pinned games if set,
otherwise the two core-set games (services/core_games.py) played least recently before today; ties are broken
by a shuffle seeded with the date, so the list stays the same all day. When the weekly
voice task is due (app/services/speech.py), it replaces slot 3.
"""

import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LEVELLED_GAMES, GameSession, GameType, User
from app.services import core_games, speech
from app.services.clock import as_utc, local_day_start

ALWAYS_FIRST = GameType.daily_orientation
FLEX_SLOTS = 2
VOICE_TASK: Literal["voice_task"] = "voice_task"


@dataclass(frozen=True)
class TodayGame:
    game_type: GameType | Literal["voice_task"]
    done_today: bool


def pinned_games(patient: User) -> list[GameType] | None:
    """The caregiver's pins, if both are still in the patient's core set."""
    if not patient.pinned_games:
        return None
    pins = [GameType(g) for g in patient.pinned_games if g in GameType._value2member_map_]
    core = core_games.core_games(patient)
    return pins if len(pins) == FLEX_SLOTS and all(p in core for p in pins) else None


def least_recent(
    last_played: dict[GameType, datetime],
    today: date,
    games: Sequence[GameType] = core_games.DEFAULT_CORE,
    count: int = FLEX_SLOTS,
) -> list[GameType]:
    """The `count` games played least recently; never-played games come first."""
    tiebreak = list(games)
    random.Random(today.isoformat()).shuffle(tiebreak)
    order = {g: i for i, g in enumerate(tiebreak)}
    never = datetime.min

    def key(g: GameType) -> tuple[datetime, int]:
        played = as_utc(last_played[g]).replace(tzinfo=None) if g in last_played else never
        return (played, order[g])

    ranked = sorted(games, key=key)
    return ranked[:count]


def _done_today(db: Session, patient: User, day_start: datetime) -> set[GameType]:
    """Games with a finished session today (a stopped-early one doesn't count as done)."""
    return set(
        db.scalars(
            select(GameSession.game_type).where(
                GameSession.patient_id == patient.id,
                GameSession.completed.is_(True),
                GameSession.started_at >= day_start,
            )
        )
    )


def todays_games(db: Session, patient: User, today: date) -> list[TodayGame]:
    day_start = local_day_start(today)

    # Recency counts any session (finished or stopped early) started before today.
    rows = db.execute(
        select(GameSession.game_type, func.max(GameSession.started_at))
        .where(GameSession.patient_id == patient.id, GameSession.started_at < day_start)
        .group_by(GameSession.game_type)
    ).all()
    last_played = {GameType(t): started for t, started in rows}

    done_today = _done_today(db, patient, day_start)

    core = core_games.core_games(patient)
    slots = [ALWAYS_FIRST, *(pinned_games(patient) or least_recent(last_played, today, core))]
    games = [TodayGame(game_type=g, done_today=g in done_today) for g in slots]
    # The weekly voice task, when due, replaces slot 3.
    offered, recorded_today = speech.voice_task_status(db, patient, today)
    if offered:
        games[-1] = TodayGame(game_type=VOICE_TASK, done_today=recorded_today)
    return games


MORE_GAMES_SHOWN = 3


def more_games(db: Session, patient: User, today: date) -> list[TodayGame]:
    """"More games": up to 3 levelled games outside the core set, least recently played first
    (CLAUDE.md section 7). At most 3, so the screen keeps to the 3-button rule."""
    core = set(core_games.core_games(patient))
    others = [g for g in LEVELLED_GAMES if g not in core]
    rows = db.execute(
        select(GameSession.game_type, func.max(GameSession.started_at))
        .where(GameSession.patient_id == patient.id)
        .group_by(GameSession.game_type)
    ).all()
    last_played = {GameType(t): started for t, started in rows}
    done_today = _done_today(db, patient, local_day_start(today))
    picks = least_recent(last_played, today, others, MORE_GAMES_SHOWN)
    return [TodayGame(game_type=g, done_today=g in done_today) for g in picks]
