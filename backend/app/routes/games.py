from fastapi import APIRouter, status

from app.deps import CurrentPatient, CurrentUser, DbSession, ensure_patient_access
from app.models import GameType
from app.schemas import LevelChange, LevelOut, SessionIn, SessionOut, SessionResultOut, TodayGameOut, TodayGamesOut
from app.services import adaptive, today_games
from app.services.clock import local, utc_now
from ml.adaptive.rule_based import Round

router = APIRouter(tags=["games"])


@router.get("/games/{game_type}/level", response_model=LevelOut)
def get_level(game_type: GameType, patient: CurrentPatient, db: DbSession) -> LevelOut:
    return LevelOut(game_type=game_type, level=adaptive.current_level(db, patient.id, game_type))


@router.post("/sessions", response_model=SessionResultOut, status_code=status.HTTP_201_CREATED)
def create_session(body: SessionIn, patient: CurrentPatient, db: DbSession) -> SessionResultOut:
    session = adaptive.record_session(
        db,
        patient,
        game_type=body.game_type,
        started_at=body.started_at,
        ended_at=body.ended_at,
        rounds=[Round(correct=r.correct, reaction_ms=r.reaction_ms, hint_used=r.hint_used) for r in body.rounds],
        completed=body.completed,
    )
    change: LevelChange = (
        "up" if session.level_end > session.level_start else "down" if session.level_end < session.level_start else "same"
    )
    return SessionResultOut(session=SessionOut.model_validate(session), new_level=session.level_end, level_change=change)


@router.get("/patients/{patient_id}/sessions", response_model=list[SessionOut])
def list_sessions(
    patient_id: int, user: CurrentUser, db: DbSession, game_type: GameType | None = None
) -> list[SessionOut]:
    ensure_patient_access(db, user, patient_id)
    return [SessionOut.model_validate(s) for s in adaptive.sessions_for(db, patient_id, game_type)]


@router.get("/me/games/today", response_model=TodayGamesOut)
def get_todays_games(patient: CurrentPatient, db: DbSession) -> TodayGamesOut:
    games = today_games.todays_games(db, patient, local(utc_now()).date())
    return TodayGamesOut(
        games=[TodayGameOut(game_type=g.game_type, done_today=g.done_today) for g in games],
        pinned=today_games.pinned_games(patient) is not None,
    )
