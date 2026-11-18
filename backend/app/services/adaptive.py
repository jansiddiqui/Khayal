"""Game levels and session storage; level decisions come from ml.adaptive."""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import NON_ADAPTIVE_GAMES, GameRound, GameSession, GameType, PlayerLevel, User
from ml.adaptive import bandit, rule_based

# Own sessions of a game replayed into the bandit before each decision.
BANDIT_HISTORY = 60

# Level stored for games without difficulty levels.
FIXED_LEVEL = 1


def current_level(db: Session, patient_id: int, game_type: GameType) -> int:
    if game_type == GameType.word_recall_delayed:
        return delayed_recall_level(db, patient_id)
    if game_type in NON_ADAPTIVE_GAMES:
        return FIXED_LEVEL
    row = db.get(PlayerLevel, (patient_id, game_type))
    return row.current_level if row is not None else rule_based.START_LEVEL


def delayed_recall_level(db: Session, patient_id: int) -> int:
    """Delayed recall is scored at the level its words were shown at: the latest finished
    Remember the Words session's starting level (D4)."""
    level = db.scalar(
        select(GameSession.level_start)
        .where(
            GameSession.patient_id == patient_id,
            GameSession.game_type == GameType.word_recall,
            GameSession.completed.is_(True),
        )
        .order_by(GameSession.started_at.desc(), GameSession.id.desc())
        .limit(1)
    )
    return level if level is not None else rule_based.START_LEVEL


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
    """Store a session and its rounds, then apply the adaptive engine once for the block.

    The level the rounds were played at is the server's stored level, not a client value.
    Games without levels never change the level. With the rule engine (the default),
    sessions that were stopped early don't either; the bandit (KHAYAL_ADAPTIVE_ENGINE=bandit)
    may lower or keep the level after one, never raise it (ml.adaptive.bandit guardrails).
    """
    level_start = current_level(db, patient.id, game_type)
    levelled = game_type not in NON_ADAPTIVE_GAMES
    if config.ADAPTIVE_ENGINE == "bandit" and levelled and rounds:
        adapts = True
        level_end = bandit_level(db, patient.id, game_type, level_start, rounds, completed, started_at)
    else:
        adapts = completed and levelled
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
                errors=r.errors,
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


def _day(at: datetime) -> float:
    return at.timestamp() / 86400


def bandit_level(
    db: Session,
    patient_id: int,
    game_type: GameType,
    level_start: int,
    rounds: Sequence[rule_based.Round],
    completed: bool,
    started_at: datetime,
) -> int:
    """Next level from the simulator-warmed bandit (ml.adaptive.prior) after replaying this
    patient's last sessions of the game: each session's level change is the action and the
    following session's success is its reward. Deterministic for a given history."""
    from ml.adaptive.prior import warmed_bandit  # trains on first use (a few seconds)

    earlier = list(
        db.scalars(
            select(GameSession)
            .where(GameSession.patient_id == patient_id, GameSession.game_type == game_type)
            .order_by(GameSession.started_at.desc(), GameSession.id.desc())
            .limit(BANDIT_HISTORY)
        )
    )[::-1]
    engine = warmed_bandit(seed=patient_id * 100_003 + len(earlier))
    history = [
        bandit.PlayedSession(
            s.level_start,
            tuple(rule_based.Round(r.correct, r.reaction_ms, r.hint_used, r.study_ms, r.errors) for r in s.rounds),
            s.completed,
            _day(s.started_at),
        )
        for s in earlier
    ]
    history = [h for h in history if h.rounds]
    history.append(bandit.PlayedSession(level_start, tuple(rounds), completed, _day(started_at)))
    for i in range(len(history) - 1):
        action = max(-1, min(1, history[i + 1].level - history[i].level))
        engine.learn(bandit.build_context(history[: i + 1]), action, bandit.reward(history[i + 1].rounds, history[i + 1].completed))
    decision = engine.decide(bandit.build_context(history))
    return rule_based.clamp_level(level_start + decision.action)


def sessions_for(db: Session, patient_id: int, game_type: GameType | None = None) -> list[GameSession]:
    stmt = select(GameSession).where(GameSession.patient_id == patient_id)
    if game_type is not None:
        stmt = stmt.where(GameSession.game_type == game_type)
    return list(db.scalars(stmt.order_by(GameSession.started_at.desc(), GameSession.id.desc())))
