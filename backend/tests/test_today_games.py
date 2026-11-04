from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import LEVELLED_GAMES, GameType, Role, User
from app.services import adaptive, auth
from app.services.clock import LOCAL_TZ
from app.services.today_games import TodayGame, least_recent, todays_games
from ml.adaptive.rule_based import Round
from tests.conftest import Register, bearer

TODAY = date(2026, 11, 4)


def local_time(day: date, hour: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def play(db: Session, patient: User, game: GameType, when: datetime, completed: bool = True) -> None:
    rounds = [Round(correct=True, reaction_ms=1000)] * (5 if completed else 2)
    adaptive.record_session(
        db, patient, game_type=game, started_at=when, ended_at=when + timedelta(minutes=3), rounds=rounds, completed=completed
    )


def new_patient(db: Session) -> User:
    return auth.register_user(db, name="Kamala", email="k@example.com", password="password123", role=Role.patient)


def types(games: list[TodayGame]) -> list[GameType]:
    return [g.game_type for g in games]


def test_slot_one_is_always_about_today(db: Session) -> None:
    patient = new_patient(db)
    for offset in range(7):
        games = todays_games(db, patient, TODAY + timedelta(days=offset))
        assert len(games) == 3
        assert games[0].game_type == GameType.daily_orientation
        assert set(types(games[1:])) <= set(LEVELLED_GAMES)


def test_slots_two_and_three_are_least_recently_played(db: Session) -> None:
    patient = new_patient(db)
    yesterday = TODAY - timedelta(days=1)
    play(db, patient, GameType.memory_match, local_time(yesterday, 9))
    play(db, patient, GameType.sequence_recall, local_time(yesterday, 10))
    play(db, patient, GameType.word_recall, local_time(yesterday - timedelta(days=3), 10))
    play(db, patient, GameType.reaction_tap, local_time(yesterday - timedelta(days=2), 10), completed=False)

    # Word Recall (4 days ago), then Reaction Tap (3 days ago; stopped early still counts as played).
    assert types(todays_games(db, patient, TODAY)[1:]) == [GameType.word_recall, GameType.reaction_tap]


def test_list_stays_the_same_all_day(db: Session) -> None:
    patient = new_patient(db)
    before = types(todays_games(db, patient, TODAY))
    # Playing today's games does not reshuffle today's list.
    for game in before[1:]:
        play(db, patient, game, local_time(TODAY, 9))
    assert types(todays_games(db, patient, TODAY)) == before


def test_ties_are_seeded_by_date() -> None:
    days = [TODAY + timedelta(days=i) for i in range(30)]
    picks = [least_recent({}, d) for d in days]
    assert picks == [least_recent({}, d) for d in days]  # deterministic per date
    assert len({tuple(p) for p in picks}) > 1  # but not the same every day


def test_done_today_needs_a_finished_session_today(db: Session) -> None:
    patient = new_patient(db)
    play(db, patient, GameType.daily_orientation, local_time(TODAY, 8))
    play(db, patient, GameType.daily_orientation, local_time(TODAY - timedelta(days=1), 20))
    games = todays_games(db, patient, TODAY)
    assert games[0].done_today is True
    assert not any(g.done_today for g in games[1:])

    play(db, patient, games[1].game_type, local_time(TODAY, 9), completed=False)
    assert todays_games(db, patient, TODAY)[1].done_today is False  # stopped early isn't "done"

    # Just after local midnight the new day starts fresh.
    assert todays_games(db, patient, TODAY + timedelta(days=1))[0].done_today is False


def test_pins_fix_slots_two_and_three(client: TestClient, register: Register) -> None:
    cg = bearer(register("Priya", "p@example.com", "caregiver"))
    payload = register("Kamala", "k@example.com", "patient")
    patient = bearer(payload)
    pid = payload["user"]["id"]  # type: ignore[index]
    client.post("/api/patients/link", json={"patient_email": "k@example.com"}, headers=cg)

    auto = client.get("/api/me/games/today", headers=patient).json()
    assert auto["pinned"] is False
    assert auto["games"][0] == {"game_type": "daily_orientation", "done_today": False}

    pins = ["reaction_tap", "memory_match"]
    response = client.patch(f"/api/patients/{pid}", json={"pinned_games": pins}, headers=cg)
    assert response.status_code == 200
    assert response.json()["pinned_games"] == pins
    pinned = client.get("/api/me/games/today", headers=patient).json()
    assert pinned["pinned"] is True
    assert [g["game_type"] for g in pinned["games"]] == ["daily_orientation", *pins]
    assert client.get("/api/auth/me", headers=patient).json()["pinned_games"] == pins

    # Changing the city leaves pins alone; null unpins.
    client.patch(f"/api/patients/{pid}", json={"city": "Pune"}, headers=cg)
    assert client.get("/api/patients", headers=cg).json()[0]["pinned_games"] == pins
    client.patch(f"/api/patients/{pid}", json={"pinned_games": None}, headers=cg)
    assert client.get("/api/me/games/today", headers=patient).json()["pinned"] is False


def test_invalid_pins_are_rejected(client: TestClient, register: Register) -> None:
    cg = bearer(register("Priya", "p@example.com", "caregiver"))
    pid = register("Kamala", "k@example.com", "patient")["user"]["id"]  # type: ignore[index]
    client.post("/api/patients/link", json={"patient_email": "k@example.com"}, headers=cg)
    for bad in (["memory_match"], ["memory_match", "memory_match"], ["memory_match", "daily_orientation"], ["a", "b"]):
        assert client.patch(f"/api/patients/{pid}", json={"pinned_games": bad}, headers=cg).status_code == 422, bad


def test_only_patients_get_todays_games(client: TestClient, register: Register) -> None:
    cg = bearer(register("Priya", "p@example.com", "caregiver"))
    assert client.get("/api/me/games/today", headers=cg).status_code == 403
