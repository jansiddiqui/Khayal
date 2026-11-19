"""Which 3 games a patient is offered today (CLAUDE.md section 7, "Today's games").

Slot 1 is always Daily Orientation. Slots 2-3 are the caregiver's pinned games if set,
otherwise the two core-set games (services/core_games.py) played least recently before today; ties are broken
by a shuffle seeded with the date, so the list stays the same all day. When the weekly
voice task is due (app/services/speech.py), it replaces slot 3.
"""

import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LEVELLED_GAMES, GameSession, GameType, User
from app.services import core_games, speech
from app.services.clock import as_utc, local, local_day_start

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
# A game left out of "More games" on 2 days in a row is offered on the next (CLAUDE.md section 7).
DUE_AFTER_DAYS = 2


def hidden_games(patient: User) -> set[GameType]:
    """Games the family hid ("Hide these games"); core games are never hidden."""
    core = set(core_games.core_games(patient))
    return {GameType(g) for g in (patient.hidden_games or []) if g in GameType._value2member_map_} - core


def more_candidates(patient: User) -> list[GameType]:
    """Levelled games outside the core set that the family didn't hide."""
    core = set(core_games.core_games(patient))
    hidden = hidden_games(patient)
    return [g for g in LEVELLED_GAMES if g not in core and g not in hidden]


def _seeded_order(games: Sequence[GameType], day: date) -> dict[GameType, int]:
    shuffled = list(games)
    random.Random(f"more-{day.isoformat()}").shuffle(shuffled)
    return {g: i for i, g in enumerate(shuffled)}


def rotate(
    candidates: Sequence[GameType],
    last_played: dict[GameType, date],
    last_offered: dict[GameType, date],
    today: date,
    count: int = MORE_GAMES_SHOWN,
) -> list[GameType]:
    """"More games" for `today` (CLAUDE.md section 7, "More games rotation").

    1. Due first: a game not offered on either of the last 2 days (or never offered) must be offered
       today, so every game appears at least once in any 3 days. With 3 slots and up to 5 games, at
       most 2 are ever due at once.
    2. Then the least recently played (never played first); playing a game, or seeing it offered,
       moves it to the back.
    3. Ties: a shuffle seeded with the date, so the list and its order are the same all day.
    `last_played` holds plays before today only.
    """
    order = _seeded_order(candidates, today)
    due_before = today - timedelta(days=DUE_AFTER_DAYS - 1)

    def key(g: GameType) -> tuple[int, date, int]:
        offered = last_offered.get(g)
        due = offered is None or offered < due_before
        seen = max(last_played.get(g, date.min), offered or date.min)
        return (0 if due else 1, seen, order[g])

    return sorted(candidates, key=key)[:count]


def _last_played(db: Session, patient: User, games: Sequence[GameType], today: date) -> dict[GameType, date]:
    """The last day each game was played before today (local days)."""
    rows = db.execute(
        select(GameSession.game_type, func.max(GameSession.started_at))
        .where(
            GameSession.patient_id == patient.id,
            GameSession.game_type.in_(games),
            GameSession.started_at < local_day_start(today),
        )
        .group_by(GameSession.game_type)
    ).all()
    return {GameType(g): local(as_utc(started)).date() for g, started in rows}


def _state(patient: User) -> tuple[str | None, list[str], dict[str, str]]:
    state = patient.more_games_state or {}
    picks = state.get("picks")
    offered = state.get("offered")
    return (
        state.get("day") if isinstance(state.get("day"), str) else None,  # type: ignore[return-value]
        [str(g) for g in picks] if isinstance(picks, list) else [],
        {str(k): str(v) for k, v in offered.items()} if isinstance(offered, dict) else {},
    )


def todays_more(db: Session, patient: User, today: date) -> list[GameType]:
    """Today's 3, worked out once a day and kept (the stored state is the offer history)."""
    candidates = more_candidates(patient)
    day, picks, offered = _state(patient)
    keep = [GameType(g) for g in picks if g in GameType._value2member_map_]
    if day == today.isoformat() and set(keep) <= set(candidates) and len(keep) == min(MORE_GAMES_SHOWN, len(candidates)):
        return keep
    last_offered = {
        GameType(g): date.fromisoformat(d)
        for g, d in offered.items()
        if g in GameType._value2member_map_ and d < today.isoformat()
    }
    new = rotate(candidates, _last_played(db, patient, candidates, today), last_offered, today)
    for g in new:
        offered[g.value] = today.isoformat()
    patient.more_games_state = {"day": today.isoformat(), "picks": [g.value for g in new], "offered": offered}
    db.commit()
    return new


def more_games(db: Session, patient: User, today: date) -> list[TodayGame]:
    """"More games": 3 levelled games outside the core set, by the rotation above. At most 3, so
    the screen keeps to the 3-button rule; "See other games" opens the full list."""
    picks = todays_more(db, patient, today)
    done_today = _done_today(db, patient, local_day_start(today))
    return [TodayGame(game_type=g, done_today=g in done_today) for g in picks]


def all_more_games(db: Session, patient: User, today: date) -> list[TodayGame]:
    """"See other games": every levelled game, core ones included (pin-fairness), so any game can
    always be reached; only games the family hid are left out (core games can't be hidden).
    Today's 3 More games first, then the rest, least recently played first. A core game played
    from here counts toward its baseline like any other session."""
    hidden = hidden_games(patient)
    candidates = [g for g in LEVELLED_GAMES if g not in hidden]
    first = todays_more(db, patient, today)
    last = _last_played(db, patient, candidates, today)
    order = _seeded_order(candidates, today)
    rest = sorted((g for g in candidates if g not in first), key=lambda g: (last.get(g, date.min), order[g]))
    done_today = _done_today(db, patient, local_day_start(today))
    return [TodayGame(game_type=g, done_today=g in done_today) for g in [*first, *rest]]
