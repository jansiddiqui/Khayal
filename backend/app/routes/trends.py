from fastapi import APIRouter

from app.deps import CurrentUser, DbSession, Now, ensure_patient_access
from app.models import GameType
from app.schemas import AdherenceOut, GameTrendOut, IndexPointOut, SignalsOut, TrendOut, TrendPointOut
from app.services import decline

router = APIRouter(prefix="/patients/{patient_id}", tags=["trends"])


@router.get("/trend", response_model=TrendOut)
def get_trend(patient_id: int, user: CurrentUser, db: DbSession, now: Now, game_type: GameType | None = None) -> TrendOut:
    """Composite scores, z-scores and baselines per game, plus the overall cognitive index."""
    ensure_patient_access(db, user, patient_id)
    result = decline.overview(db, patient_id, until=now)
    games = [
        GameTrendOut(
            game_type=game,
            status=r.status,
            z=r.z,
            score=r.score,
            baseline_mean=r.baseline_mean,
            baseline_std=r.baseline_std,
            sessions=r.sessions,
            sessions_needed=r.sessions_needed,
            z_raw=r.z_raw,
            explanation=r.explanation,
            points=[
                TrendPointOut(
                    session_id=p.session.session_id or 0,
                    started_at=p.session.started_at,
                    composite=p.composite,
                    rolling_mean=p.rolling_mean,
                    z=p.z,
                )
                for p in r.trend
            ],
        )
        for game, r in result.games.items()
        if game_type is None or game == game_type
    ]
    return TrendOut(
        cognitive_index=result.index,
        cognitive_status=result.status,
        index_history=[IndexPointOut(date=d, index=i) for d, i in decline.index_history(result)],
        games=games,
    )


@router.get("/signals", response_model=SignalsOut)
def get_signals(patient_id: int, user: CurrentUser, db: DbSession, now: Now) -> SignalsOut:
    ensure_patient_access(db, user, patient_id)
    s = decline.signals(db, patient_id, now)
    a = s.adherence
    return SignalsOut(
        days=s.days,
        sessions=s.sessions,
        stopped_early_rate=s.stopped_early_rate,
        hint_rate=s.hint_rate,
        adherence=AdherenceOut(
            days=a.days, done_by_patient=a.done_by_patient, done_by_caregiver=a.done_by_caregiver, missed=a.missed, rate=a.rate
        ),
    )
