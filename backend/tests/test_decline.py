from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Alert, AlertType, GameType, Role, User
from app.services import adaptive, auth, care, decline
from ml.adaptive.rule_based import Round
from tests.conftest import Clock, Register, bearer

T0 = datetime(2026, 8, 1, 4, 30, tzinfo=timezone.utc)  # 10:00 IST


def play(db: Session, patient: User, game: GameType, day: int, correct: int, hints: int = 0, completed: bool = True) -> None:
    n = 5 if completed else 3
    rounds = [Round(correct=i < correct, reaction_ms=1000, hint_used=i < hints) for i in range(n)]
    when = T0 + timedelta(days=day)
    adaptive.record_session(db, patient, game_type=game, started_at=when, ended_at=when + timedelta(minutes=3),
                            rounds=rounds, completed=completed)


def patient_and_caregiver(db: Session) -> tuple[User, User]:
    patient = auth.register_user(db, name="Kamala", email="k@example.com", password="password123", role=Role.patient)
    cg = auth.register_user(db, name="Priya", email="p@example.com", password="password123", role=Role.caregiver)
    care.link_patient(db, cg, patient)
    return patient, cg


WARMUP = 5  # days 0-4: warm-up, ignored
NEEDED = 15  # days 5-14: baseline; z from the 15th completed session


def steady_then_drop(db: Session, patient: User, game: GameType, drop_to: int) -> None:
    """5 warm-up sessions (2 of 5 right, ignored), 10 steady baseline sessions (4-5 of 5),
    then 5 at `drop_to` of 5."""
    for d in range(WARMUP):
        play(db, patient, game, d, correct=2)
    for d in range(WARMUP, NEEDED):
        play(db, patient, game, d, correct=4 + d % 2)
    for d in range(NEEDED, NEEDED + 5):
        play(db, patient, game, d, correct=drop_to)


def test_no_alert_and_learning_before_fifteen_sessions(db: Session) -> None:
    patient, _ = patient_and_caregiver(db)
    for d in range(NEEDED - 1):
        play(db, patient, GameType.daily_orientation, d, correct=1)
    result = decline.overview(db, patient.id)
    assert result.status == "insufficient" and result.index is None
    game = result.games[GameType.daily_orientation]
    assert game.explanation == "Learning this patient's normal (14/15 sessions)"
    assert decline.evaluate_and_alert(db, patient, T0 + timedelta(days=NEEDED)) is None


def test_decline_alert_with_plain_explanation_and_7_day_cooldown(db: Session) -> None:
    patient, _ = patient_and_caregiver(db)
    steady_then_drop(db, patient, GameType.daily_orientation, drop_to=2)
    now = T0 + timedelta(days=NEEDED + 5)
    alert = decline.evaluate_and_alert(db, patient, now)
    assert alert is not None
    assert alert.type == AlertType.decline and alert.severity.value == "critical"
    # Baseline mean 0.9 (alternating 0.8 / 1.0), std floored at 0.15 × 0.9; last 5 at 0.4.
    assert alert.message == "About Today average dropped from 0.90 to 0.40 over the last 5 sessions (z = −3.7)."

    assert decline.evaluate_and_alert(db, patient, now + timedelta(days=6)) is None  # within 7 days
    assert decline.evaluate_and_alert(db, patient, now + timedelta(days=7, minutes=1)) is not None
    assert len(db.scalars(select(Alert)).all()) == 2


def test_critical_escalates_within_7_days_of_a_warning(db: Session) -> None:
    patient, _ = patient_and_caregiver(db)
    steady_then_drop(db, patient, GameType.daily_orientation, drop_to=3)  # 0.6: z = −2.2
    for d in range(NEEDED + 5, NEEDED + 10):
        play(db, patient, GameType.daily_orientation, d, correct=1)  # 0.2: z clipped to −4
    first = decline.evaluate_and_alert(db, patient, T0 + timedelta(days=NEEDED + 4, hours=1))
    assert first is not None and first.severity.value == "warning"
    # One session at 0.2 brings the rolling mean to 0.52: z = −2.8, critical, 1 day after the warning.
    second = decline.evaluate_and_alert(db, patient, T0 + timedelta(days=NEEDED + 5, hours=1))
    assert second is not None and second.severity.value == "critical"
    # Critical again within 7 days is throttled, and so is a step back down to warning.
    last = T0 + timedelta(days=NEEDED + 9, hours=1)
    assert decline.overview(db, patient.id, until=last).games[GameType.daily_orientation].z == -4.0
    assert decline.evaluate_and_alert(db, patient, last) is None


def test_stopped_early_sessions_do_not_count(db: Session) -> None:
    patient, _ = patient_and_caregiver(db)
    for d in range(NEEDED):
        play(db, patient, GameType.daily_orientation, d, correct=5)
    for d in range(NEEDED, NEEDED + 10):
        play(db, patient, GameType.daily_orientation, d, correct=0, completed=False)
    result = decline.overview(db, patient.id)
    assert result.games[GameType.daily_orientation].status == "stable"


def test_only_sessions_up_to_now_are_used(db: Session) -> None:
    patient, _ = patient_and_caregiver(db)
    steady_then_drop(db, patient, GameType.daily_orientation, drop_to=1)
    # Replaying history: at day 15 the drop hasn't happened yet.
    assert decline.evaluate_and_alert(db, patient, T0 + timedelta(days=NEEDED - 1, hours=1)) is None


def test_overall_index_and_history(db: Session) -> None:
    patient, _ = patient_and_caregiver(db)
    steady_then_drop(db, patient, GameType.daily_orientation, drop_to=3)
    for d in range(NEEDED + 2):
        play(db, patient, GameType.word_recall, d, correct=4 + d % 2)
    result = decline.overview(db, patient.id)
    zs = [r.z for r in result.games.values() if r.z is not None]
    assert len(zs) == 2
    assert result.index == sum(zs) / 2
    history = decline.index_history(result)
    assert history[0][0] == (T0 + timedelta(days=NEEDED - 1)).date()  # first day with a baseline
    assert history[-1][1] == result.index


def test_signals(db: Session, clock: Clock) -> None:
    patient, _ = patient_and_caregiver(db)
    play(db, patient, GameType.memory_match, 0, correct=5, hints=2)
    play(db, patient, GameType.memory_match, 1, correct=1, completed=False)
    play(db, patient, GameType.memory_match, -30, correct=5)  # outside the 14 days
    s = decline.signals(db, patient.id, T0 + timedelta(days=2))
    assert s.sessions == 2
    assert s.stopped_early_rate == 0.5
    assert s.hint_rate == 2 / 8  # 2 hinted rounds out of 5 + 3


def test_trend_and_signals_api(client: TestClient, register: Register, clock: Clock) -> None:
    cg_payload = register("Priya", "p@example.com", "caregiver")
    cg = bearer(cg_payload)
    payload = register("Kamala", "k@example.com", "patient")
    patient = bearer(payload)
    pid = payload["user"]["id"]  # type: ignore[index]
    client.post("/api/patients/link", json={"patient_email": "k@example.com"}, headers=cg)

    for d in range(NEEDED + 5):
        clock.now = T0 + timedelta(days=d, minutes=10)
        correct = 2 if d < WARMUP else (4 + d % 2) if d < NEEDED else 2
        body = {
            "game_type": "daily_orientation",
            "started_at": (T0 + timedelta(days=d)).isoformat(),
            "ended_at": (T0 + timedelta(days=d, minutes=3)).isoformat(),
            "rounds": [{"correct": i < correct, "reaction_ms": 900, "hint_used": False} for i in range(5)],
            "completed": True,
        }
        assert client.post("/api/sessions", json=body, headers=patient).status_code == 201

    trend = client.get(f"/api/patients/{pid}/trend", params={"game_type": "daily_orientation"}, headers=cg).json()
    assert trend["cognitive_status"] == "declining"
    (game,) = trend["games"]
    assert game["status"] == "critical"
    assert len(game["points"]) == NEEDED + 5
    assert game["points"][NEEDED - 2]["z"] is None and game["points"][NEEDED - 1]["z"] is not None
    assert game["baseline_mean"] == 0.9
    assert game["sessions_needed"] == NEEDED and game["z_raw"] == game["z"]
    assert trend["index_history"][-1]["index"] == game["z"]

    alerts = client.get(f"/api/patients/{pid}/alerts", headers=cg).json()
    decline_alerts = [a for a in alerts if a["type"] == "decline"]
    # A warning at the first drop, then escalated to critical within the 7 days, then throttled.
    assert [a["severity"] for a in sorted(decline_alerts, key=lambda a: a["created_at"])] == ["warning", "critical"]
    assert "About Today average dropped from 0.90" in decline_alerts[0]["message"]

    listed = client.get("/api/patients", headers=cg).json()[0]
    assert listed["cognitive_status"] == "declining" and listed["cognitive_index"] < -1.5

    signals = client.get(f"/api/patients/{pid}/signals", headers=cg).json()
    assert signals["days"] == 14 and signals["stopped_early_rate"] == 0.0 and signals["hint_rate"] == 0.0
    assert signals["adherence"]["rate"] is None

    stranger = bearer(register("Sam", "s@example.com", "caregiver"))
    assert client.get(f"/api/patients/{pid}/trend", headers=stranger).status_code == 403
    assert client.get(f"/api/patients/{pid}/signals", headers=stranger).status_code == 403
