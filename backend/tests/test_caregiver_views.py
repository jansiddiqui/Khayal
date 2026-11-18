"""Caregiver views (Round 2 batch 2): glance, insights, weekly summary, timeline, doctor report."""

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import DeviceSession
from app.services.clock import LOCAL_TZ
from tests.conftest import Clock, Register, bearer
from tests.test_games import session_body
from tests.test_overdue_reminders import add, answer
from tests.test_reminders import Setup


def at(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def glance(s: Setup) -> dict[str, Any]:
    response = s.client.get("/api/caregiver/glance", headers=s.cg)
    assert response.status_code == 200, response.text
    cards = response.json()
    assert len(cards) == 1
    return dict(cards[0])


def play(s: Setup, when: datetime, pattern: str = "11110", game: str = "word_recall") -> None:
    body = session_body(pattern, game)
    body["started_at"] = when.isoformat()
    body["ended_at"] = (when + timedelta(minutes=4)).isoformat()
    assert s.client.post("/api/sessions", json=body, headers=s.patient).status_code == 201


def pair_device(db: Session, patient_id: int, when: datetime) -> None:
    db.add(DeviceSession(patient_id=patient_id, created_at=when, last_seen_at=when, device_label="Android phone"))
    db.commit()


def test_next_action_priorities(client: TestClient, register: Register, clock: Clock, db: Session) -> None:
    clock.now = at(17, 7)
    s = Setup(client, register)
    card = glance(s)
    assert card["name"] == "Kamala"
    assert card["next_action"] == {"kind": "pair", "text": "Pair Kamala's phone or tablet"}

    pair_device(db, s.pid, clock.now)
    assert glance(s)["next_action"]["kind"] == "add_reminders"

    rid = add(s, "Blood pressure tablet", "09:00")
    add(s, "Lunch", "13:00", kind="meal")
    card = glance(s)
    assert card["medicines"] == {"taken": 0, "missed": 0, "unsure": 0, "to_come": 1}
    assert card["next_action"]["kind"] == "all_good"

    clock.now = at(17, 11)
    assert answer(s, rid, "unsure").status_code == 200
    card = glance(s)
    assert card["medicines"]["unsure"] == 1
    assert card["alerts_open"] == 1
    # The dose they weren't sure about comes before the alert it raised.
    assert card["next_action"] == {"kind": "check_dose", "text": "Check the 9:00 AM Blood pressure tablet with Kamala"}

    assert client.post(f"/api/patients/{s.pid}/alerts/ack", json={}, headers=s.cg).status_code == 200
    answer(s, rid, "done")
    assert glance(s)["next_action"]["kind"] == "all_good"


def test_inactive_after_three_days(client: TestClient, register: Register, clock: Clock, db: Session) -> None:
    clock.now = at(10, 10)
    s = Setup(client, register)
    pair_device(db, s.pid, clock.now)
    add(s, "Tablet", "21:00")
    play(s, at(10, 10))
    clock.now = at(14, 9)
    action = glance(s)["next_action"]
    assert action["kind"] == "inactive"
    assert "since Tuesday" in action["text"]


def test_glance_counts_todays_games(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(17, 10)
    s = Setup(client, register)
    play(s, at(17, 10), game="daily_orientation")
    card = glance(s)
    assert (card["games_done"], card["games_total"]) == (1, 3)


def test_insights_in_plain_words_with_numbers_on_tap(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(10, 8)
    s = Setup(client, register)
    tablet = add(s, "Tablet", "09:00")
    for day in range(10, 17):
        clock.now = at(day, 9, 30)
        if day == 12:
            answer(s, tablet, "unsure")
        elif day == 13:
            clock.now = at(day, 12)
            s.alerts()  # the sweep logs the missed dose (2 hours after its time)
        else:
            answer(s, tablet, "done")
        play(s, at(day, 10))
    clock.now = at(16, 23)
    insights = {i["key"]: i for i in client.get(f"/api/patients/{s.pid}/insights", headers=s.cg).json()}
    assert insights["activity"]["text"] == "Played on 7 of the last 7 days"
    assert insights["doses"]["text"] == "1 dose unsure this week"
    assert insights["doses"]["tone"] == "attention"
    assert "taken 5" in insights["doses"]["detail"] and "missed 1" in insights["doses"]["detail"]
    learning = insights["games_learning"]
    assert learning["text"] == "Still learning Kamala's normal for 1 game"
    assert "Word Recall 7/15 sessions" in learning["detail"]
    # No z-score in the sentence itself; numbers only in the detail.
    assert all("z =" not in i["text"] for i in insights.values())


def test_weekly_compares_with_the_week_before(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(3, 8)
    s = Setup(client, register)
    for day in (4, 5):
        play(s, at(day, 10), "11111")
    for day in (12, 13, 14):
        play(s, at(day, 10), "11100")
    play(s, at(14, 11), "11")  # stopped early
    clock.now = at(16, 20)
    w = client.get(f"/api/patients/{s.pid}/weekly", headers=s.cg).json()
    this, last = w["this_week"], w["last_week"]
    assert (this["start"], this["end"]) == ("2026-11-10", "2026-11-16")
    assert (this["days_played"], this["sessions"], this["completed"]) == (3, 4, 3)
    assert this["accuracy"] == 0.6
    assert (last["days_played"], last["completed"], last["accuracy"]) == (2, 2, 1.0)


def test_timeline_has_settings_changes_and_filters(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(16, 9)
    s = Setup(client, register)
    assert client.patch(f"/api/patients/{s.pid}", json={"city": "Lucknow"}, headers=s.cg).status_code == 200
    rid = add(s, "Tablet", "10:00")
    play(s, at(16, 9, 30))
    clock.now = at(16, 10, 5)
    answer(s, rid, "done")
    clock.now = at(16, 12)
    events = client.get(f"/api/patients/{s.pid}/timeline", headers=s.cg).json()
    titles = [e["title"] for e in events]
    assert "City set to Lucknow" in titles
    assert "Reminder added: Tablet at 10:00 AM" in titles
    assert "Tablet (10:00 AM): done" in titles
    assert any(t.startswith("Word Recall: 4 of 5 right") for t in titles)
    assert [e["at"] for e in events] == sorted((e["at"] for e in events), reverse=True)

    only = client.get(f"/api/patients/{s.pid}/timeline?kinds=settings", headers=s.cg).json()
    assert {e["kind"] for e in only} == {"settings"}
    two = client.get(f"/api/patients/{s.pid}/timeline?kinds=session&kinds=reminder", headers=s.cg).json()
    assert {e["kind"] for e in two} == {"session", "reminder"}
    # Nothing is logged when a setting doesn't actually change.
    client.patch(f"/api/patients/{s.pid}", json={"city": "Lucknow"}, headers=s.cg)
    again = client.get(f"/api/patients/{s.pid}/timeline?kinds=settings", headers=s.cg).json()
    assert len(again) == len(only)


def test_report_and_access(client: TestClient, register: Register, clock: Clock) -> None:
    clock.now = at(16, 9)
    s = Setup(client, register)
    for day in range(2, 16):
        play(s, at(day, 10))
    report = client.get(f"/api/patients/{s.pid}/report?days=30", headers=s.cg).json()
    assert report["name"] == "Kamala"
    assert (report["start"], report["end"], report["days"]) == ("2026-10-18", "2026-11-16", 30)
    games = {g["game_type"]: g for g in report["games"]}
    assert "daily_orientation" in games and "word_recall" in games
    assert games["word_recall"]["sessions"] == 14
    assert len(games["word_recall"]["points"]) == 14
    # 15 finished sessions make the baseline; one to go.
    assert (games["word_recall"]["status"], games["word_recall"]["sessions_to_baseline"]) == ("insufficient", 1)
    assert client.get(f"/api/patients/{s.pid}/report?days=2", headers=s.cg).status_code == 422

    # Patients and unlinked caregivers can't read any of these views.
    other = bearer(register("Meera", "m@example.com", "caregiver"))
    for path in ("insights", "weekly", "timeline", "report"):
        assert client.get(f"/api/patients/{s.pid}/{path}", headers=other).status_code == 403
        assert client.get(f"/api/patients/{s.pid}/{path}", headers=s.patient).status_code == 403
    assert client.get("/api/caregiver/glance", headers=s.patient).status_code == 403
    assert client.get("/api/caregiver/glance", headers=other).json() == []
