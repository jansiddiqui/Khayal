"""More games rotation and "Hide these games" (more-games-rotation; CLAUDE.md section 7)."""

import random
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.models import GameType
from app.services.clock import LOCAL_TZ
from app.services.today_games import rotate
from tests.conftest import Clock, Register
from tests.test_games import session_body
from tests.test_reminders import Setup

NON_CORE = [GameType.memory_match, GameType.sequence_recall, GameType.reaction_tap, GameType.clock_setting, GameType.spatial_span]


def simulate(days: int, play: str, seed: int = 0) -> list[list[GameType]]:
    """The 3 offered each day for `days` days, with the patient playing: "none", "first" (only
    the first offered), "all" (all 3 offered), "random", or "outside" (a game from the full list
    that wasn't offered)."""
    rng = random.Random(seed)
    last_played: dict[GameType, date] = {}
    last_offered: dict[GameType, date] = {}
    start = date(2026, 11, 1)
    offers = []
    for k in range(days):
        day = start + timedelta(days=k)
        offered = rotate(NON_CORE, dict(last_played), dict(last_offered), day)
        offers.append(offered)
        for g in offered:
            last_offered[g] = day
        chosen = {
            "none": [],
            "first": offered[:1],
            "all": offered,
            "random": [g for g in offered if rng.random() < 0.5],
            "outside": [g for g in NON_CORE if g not in offered][:1],
        }[play]
        for g in chosen:
            last_played[g] = day
    return offers


@pytest.mark.parametrize("play", ["none", "first", "all", "random", "outside"])
def test_every_game_appears_within_any_3_days(play: str) -> None:
    offers = simulate(30, play, seed=7)
    assert all(len(o) == 3 and len(set(o)) == 3 for o in offers)
    for k in range(len(offers) - 2):
        seen = set(offers[k]) | set(offers[k + 1]) | set(offers[k + 2])
        assert seen == set(NON_CORE), (play, k, offers[k : k + 3])


def test_never_played_first_then_least_recently_played() -> None:
    last_played = {GameType.memory_match: date(2026, 11, 9), GameType.sequence_recall: date(2026, 11, 8)}
    first = rotate(NON_CORE, last_played, {}, date(2026, 11, 10))
    assert set(first) == {GameType.reaction_tap, GameType.clock_setting, GameType.spatial_span}
    # The next day the two left out are due, then the least recently played.
    offered = {g: date(2026, 11, 10) for g in first}
    nxt = rotate(NON_CORE, last_played, offered, date(2026, 11, 11))
    assert nxt[:2] == sorted(nxt[:2], key=lambda g: last_played[g]) and set(nxt[:2]) == {GameType.memory_match, GameType.sequence_recall}


def at(day: int, hour: int) -> datetime:
    return datetime(2026, 11, day, hour, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def test_hidden_games_never_appear_and_core_games_cant_be_hidden(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(17, 9)
    s = Setup(client, register)
    # The default core set: word_recall, object_location, colour_trails, money_handling.
    more = lambda path="": [g["game_type"] for g in client.get(f"/api/me/games/more{path}", headers=s.patient).json()]  # noqa: E731
    assert len(more()) == 3
    assert set(more("/all")) == {"memory_match", "sequence_recall", "reaction_tap", "clock_setting", "spatial_span"}
    assert more("/all")[:3] == more()

    hide = {"hidden_games": ["reaction_tap", "spatial_span"]}
    assert client.patch(f"/api/patients/{s.pid}", json=hide, headers=s.cg).status_code == 200
    assert set(more("/all")) == {"memory_match", "sequence_recall", "clock_setting"}
    assert set(more()) == {"memory_match", "sequence_recall", "clock_setting"}
    assert client.patch(f"/api/patients/{s.pid}", json={"hidden_games": ["word_recall"]}, headers=s.cg).status_code == 422
    assert client.patch(f"/api/patients/{s.pid}", json={"hidden_games": ["word_recall_delayed"]}, headers=s.cg).status_code == 422

    # A hidden game that joins the core set is no longer hidden.
    core = {"core_games": ["word_recall", "object_location", "colour_trails", "spatial_span"]}
    assert client.patch(f"/api/patients/{s.pid}", json=core, headers=s.cg).status_code == 200
    patient = next(p for p in client.get("/api/patients", headers=s.cg).json() if p["id"] == s.pid)
    assert patient["hidden_games"] == ["reaction_tap"]
    titles = [e["title"] for e in client.get(f"/api/patients/{s.pid}/timeline?kinds=settings", headers=s.cg).json()]
    assert any(t.startswith("Hidden from More games: Reaction Tap, Spatial Span") for t in titles)


def test_the_list_stays_the_same_all_day(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(17, 9)
    s = Setup(client, register)
    first = client.get("/api/me/games/more", headers=s.patient).json()
    body = session_body("11110", first[0]["game_type"])
    body["started_at"] = at(17, 10).isoformat()
    body["ended_at"] = at(17, 11).isoformat()
    assert client.post("/api/sessions", json=body, headers=s.patient).status_code == 201
    clock.now = at(17, 20)
    later = client.get("/api/me/games/more", headers=s.patient).json()
    assert [g["game_type"] for g in later] == [g["game_type"] for g in first]
    assert later[0]["done_today"] is True


def test_offer_moves_on_even_when_nothing_is_played(client: TestClient, register: Register, clock: Clock) -> None:
    s = Setup(client, register)
    seen: set[str] = set()
    for day in (17, 18):
        clock.now = at(day, 9)
        seen |= {g["game_type"] for g in client.get("/api/me/games/more", headers=s.patient).json()}
    assert seen == {"memory_match", "sequence_recall", "reaction_tap", "clock_setting", "spatial_span"}


def test_played_games_go_to_the_back(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(17, 9)
    s = Setup(client, register)
    body = session_body("11110", "clock_setting")
    body["started_at"] = at(16, 10).isoformat()
    body["ended_at"] = at(16, 11).isoformat()
    assert client.post("/api/sessions", json=body, headers=s.patient).status_code == 201
    # Yesterday's game waits while never-played games are offered.
    assert "clock_setting" not in [g["game_type"] for g in client.get("/api/me/games/more", headers=s.patient).json()]
