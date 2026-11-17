"""The core set (CLAUDE.md section 7, docs/games/research.md D7)."""

import json
from datetime import date, datetime, timedelta, timezone

from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.models import LEVELLED_GAMES, GameType
from app.services import core_games, decline
from app.services.today_games import todays_games
from ml.decline import zscore

from tests.conftest import Register, bearer, link_patient
from tests.test_migrations import alembic_config, database_url  # noqa: F401  (fixture)
from tests.test_today_games import new_patient


def setup(client: TestClient, register: Register) -> tuple[dict[str, str], dict[str, str], int]:
    patient = bearer(register("Kamala", "k@example.com", "patient"))
    caregiver = bearer(register("Ravi", "r@example.com", "caregiver"))
    link_patient(client, "k@example.com", caregiver)
    return patient, caregiver, int(client.get("/api/auth/me", headers=patient).json()["id"])


def test_new_patients_get_the_default_core_set(client: TestClient, register: Register) -> None:
    _, caregiver, pid = setup(client, register)
    [p] = client.get("/api/patients", headers=caregiver).json()
    assert p["core_games"] == [g.value for g in core_games.DEFAULT_CORE]
    assert p["core_is_default"] is True
    assert core_games.valid_core(core_games.DEFAULT_CORE)
    # Every levelled game has a domain for the caregiver's picker.
    assert set(core_games.DOMAINS) == set(LEVELLED_GAMES)


def test_caregiver_changes_the_core_set_and_pins_stay_inside_it(client: TestClient, register: Register) -> None:
    _, caregiver, pid = setup(client, register)
    core = [g.value for g in core_games.DEFAULT_CORE]
    pins = core[:2]
    assert client.patch(f"/api/patients/{pid}", json={"pinned_games": pins}, headers=caregiver).status_code == 200

    # Not 4 different levelled games: refused.
    for bad in (core[:3], [*core[:3], core[0]], [*core[:3], "daily_orientation"]):
        assert client.patch(f"/api/patients/{pid}", json={"core_games": bad}, headers=caregiver).status_code == 422

    # A new set in a different order keeps pins that are still in it.
    reordered = list(reversed(core))
    out = client.patch(f"/api/patients/{pid}", json={"core_games": reordered}, headers=caregiver).json()
    assert out["core_games"] == reordered
    assert out["core_is_default"] is False
    assert out["pinned_games"] == pins

    # Back to the default.
    out = client.patch(f"/api/patients/{pid}", json={"core_games": None}, headers=caregiver).json()
    assert out["core_is_default"] is True


def test_pins_outside_the_core_set_are_refused(client: TestClient, register: Register) -> None:
    _, caregiver, pid = setup(client, register)
    others = [g.value for g in LEVELLED_GAMES if g not in core_games.DEFAULT_CORE]
    if others:
        bad = [core_games.DEFAULT_CORE[0].value, others[0]]
        assert client.patch(f"/api/patients/{pid}", json={"pinned_games": bad}, headers=caregiver).status_code == 422


def test_today_rotates_only_through_the_core_set(db: Session) -> None:
    patient = new_patient(db)
    patient.core_games = [g.value for g in core_games.DEFAULT_CORE]
    db.commit()
    for offset in range(14):
        games = todays_games(db, patient, date(2026, 11, 4) + timedelta(days=offset))
        assert {g.game_type for g in games[1:]} <= set(core_games.DEFAULT_CORE)


def test_more_games_are_the_levelled_games_outside_the_core_set(client: TestClient, register: Register) -> None:
    patient, _, _ = setup(client, register)
    more = client.get("/api/me/games/more", headers=patient).json()
    others = {g.value for g in LEVELLED_GAMES if g not in core_games.DEFAULT_CORE}
    assert len(more) == min(3, len(others))
    assert {m["game_type"] for m in more} <= others


def _declining(game: str) -> list[zscore.SessionSummary]:
    """15 good sessions (warm-up + baseline), then 5 poor ones: a clear decline."""
    start = datetime(2026, 1, 1, 10, tzinfo=timezone.utc)
    out = []
    for i in range(20):
        right = 5 if i < 15 else 1
        rounds = tuple(zscore.RoundSummary(n < right, False, 1000) for n in range(5))
        out.append(zscore.SessionSummary(game, start + timedelta(days=i), 5, rounds, True, i))
    return out


def test_games_outside_the_core_set_never_raise_alerts_or_move_the_index() -> None:
    summaries = {g: [] for g in GameType}
    summaries[GameType.memory_match] = _declining("memory_match")
    now = datetime(2026, 2, 1, tzinfo=timezone.utc)

    tracked = decline.overview_of(summaries, frozenset({GameType.memory_match, GameType.daily_orientation}))
    assert tracked.index is not None and tracked.index < -1.5
    assert decline.decide_alert(tracked, [], now) is not None

    untracked = decline.overview_of(summaries, frozenset({GameType.word_recall, GameType.daily_orientation}))
    assert untracked.index is None
    assert decline.decide_alert(untracked, [], now) is None
    # Its own chart still shows the decline.
    assert untracked.games[GameType.memory_match].status in ("warning", "critical")


def test_migration_keeps_existing_players_on_their_four_games(database_url: str) -> None:  # noqa: F811
    cfg = alembic_config(database_url)
    command.upgrade(cfg, "0011")
    engine = create_engine(database_url)
    with engine.begin() as c:
        for uid, email in ((1, "played@example.com"), (2, "new@example.com")):
            c.execute(
                text(
                    "INSERT INTO users (id, name, email, role, created_at, voice_task_enabled, token_version, photos_enabled)"
                    " VALUES (:id, 'P', :email, 'patient', CURRENT_TIMESTAMP, false, 0, false)"
                ),
                {"id": uid, "email": email},
            )
        c.execute(
            text(
                "INSERT INTO game_sessions (patient_id, game_type, level_start, level_end, started_at, ended_at,"
                " rounds_played, rounds_correct, hints_used, completed)"
                " VALUES (1, 'memory_match', 2, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 5, 5, 0, true)"
            )
        )
    command.upgrade(cfg, "head")
    with engine.connect() as c:
        rows = dict(c.execute(text("SELECT id, core_games FROM users ORDER BY id")).all())
    engine.dispose()
    played = rows[1] if isinstance(rows[1], list) else json.loads(rows[1])
    assert played == ["memory_match", "sequence_recall", "word_recall", "reaction_tap"]
    assert rows[2] is None


def test_simulated_patients_play_the_default_core_set() -> None:
    from ml.decline import simulator

    assert simulator.CORE == tuple(g.value for g in core_games.DEFAULT_CORE)


def test_catalog_lists_every_levelled_game_with_its_domain(client: TestClient, register: Register) -> None:
    _, caregiver, _ = setup(client, register)
    catalog = client.get("/api/games/catalog", headers=caregiver).json()
    assert {c["game_type"] for c in catalog} == {g.value for g in LEVELLED_GAMES}
    assert all(c["domain"] for c in catalog)
