"""First-time tutorial per game (docs/games/research.md 3.4: errorless learning).

The first time a patient opens a game they see a short spoken demo and an easier practice round
that is never stored. Patients who have already played a game don't get its tutorial, unless a
caregiver asks for it again.
"""

from datetime import datetime

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models import GameSession, GameType, TutorialState


def needed(db: Session, patient_id: int, game_type: GameType) -> bool:
    state = db.get(TutorialState, (patient_id, game_type))
    if state is not None:
        return state.seen_at is None
    played = db.scalar(
        select(exists().where(GameSession.patient_id == patient_id, GameSession.game_type == game_type))
    )
    return not played


def mark_seen(db: Session, patient_id: int, game_type: GameType, now: datetime) -> None:
    state = db.get(TutorialState, (patient_id, game_type))
    if state is None:
        db.add(TutorialState(patient_id=patient_id, game_type=game_type, seen_at=now))
    else:
        state.seen_at = now
    db.commit()


def reset(db: Session, patient_id: int, game_type: GameType) -> None:
    state = db.get(TutorialState, (patient_id, game_type))
    if state is None:
        db.add(TutorialState(patient_id=patient_id, game_type=game_type, seen_at=None))
    else:
        state.seen_at = None
    db.commit()
