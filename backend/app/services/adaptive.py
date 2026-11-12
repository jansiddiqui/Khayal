"""Game levels and session storage; level decisions come from ml.adaptive."""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import NON_ADAPTIVE_GAMES, GameRound, GameSession, GameType, PlayerLevel, User
from ml.adaptive import rule_based

# Level stored for games without difficulty levels.
FIXED_LEVEL = 1


def current_level(db: Session, patient_id: int, game_type: GameType) -> int:
    if game_type in NON_ADAPTIVE_GAMES:
        return FIXED_LEVEL
    row = db.get(PlayerLevel, (patient_id, game_type))
    return row.current_level if row is not None else rule_based.START_LEVEL


def _mean_reaction(rounds: Sequence[rule_based.Round]) -> float | None:
    times = [r.reaction_ms for r in rounds if r.reaction_ms is not None]
    return sum(times) / len(times) if times else None


def record_session(
    db: Session,
    patient: User,
    *,
    game_type: GameType,
    started_at: datetime,
    ended_at: datetime,
    rounds: Sequence[rule_based.Round],
    completed: bool = True,
) -> GameSession:
    """Store a session and its rounds, then apply the adaptive rule once for the block.

    The level the rounds were played at is the server's stored level, not a client value.
    Sessions that were stopped early, and games without levels, never change the level.
    """
    level_start = current_level(db, patient.id, game_type)
    adapts = completed and game_type not in NON_ADAPTIVE_GAMES
    level_end = rule_based.next_level(level_start, list(rounds)) if adapts else level_start

    session = GameSession(
        patient_id=patient.id,
        game_type=game_type,
        level_start=level_start,
        level_end=level_end,
        started_at=started_at,
        ended_at=ended_at,
        rounds_played=len(rounds),
        rounds_correct=sum(r.correct for r in rounds),
        avg_reaction_ms=_mean_reaction(rounds),
        hints_used=sum(r.hint_used for r in rounds),
        completed=completed,
        rounds=[
            GameRound(
                level=level_start,
                correct=r.correct,
                reaction_ms=r.reaction_ms,
                hint_used=r.hint_used,
                study_ms=r.study_ms,
            )
            for r in rounds
        ],
    )
    db.add(session)

    if adapts:
        level_row = db.get(PlayerLevel, (patient.id, game_type))
        if level_row is None:
            db.add(PlayerLevel(patient_id=patient.id, game_type=game_type, current_level=level_end))
        else:
            level_row.current_level = level_end

    db.commit()
    return session


def sessions_for(db: Session, patient_id: int, game_type: GameType | None = None) -> list[GameSession]:
    stmt = select(GameSession).where(GameSession.patient_id == patient_id)
    if game_type is not None:
        stmt = stmt.where(GameSession.game_type == game_type)
    return list(db.scalars(stmt.order_by(GameSession.started_at.desc(), GameSession.id.desc())))
