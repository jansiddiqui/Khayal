"""Server text as message keys (Round 2 batch 5b; app/services/messages.py)."""

import re
from pathlib import Path

import pytest

from app.services.messages import TEMPLATES, Msg, msg, parse_alert, parse_event, parse_explanation, render_en
from ml.decline.zscore import learning_text

SERVER_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n" / "caregiver" / "sections" / "server.ts"


def frontend_english() -> dict[str, str | tuple[str, str]]:
    """The English templates in the frontend dictionary (the `en` block of server.ts)."""
    text = SERVER_TS.read_text(encoding="utf-8")
    block = text[text.index("export const en"): text.index("export const hi")]
    string = r'"((?:[^"\\]|\\.)*)"'
    out: dict[str, str | tuple[str, str]] = {}
    for key, one, other in re.findall(rf'"([\w.]+)":\s*{{\s*one:\s*{string},\s*other:\s*{string}\s*}}', block):
        out[key] = (one.replace('\\"', '"'), other.replace('\\"', '"'))
    for key, value in re.findall(rf'"([\w.]+)":\s*{string}', block):
        out.setdefault(key, value.replace('\\"', '"'))
    return out


def test_frontend_english_matches_the_server() -> None:
    assert frontend_english() == TEMPLATES


def test_hindi_has_every_key() -> None:
    text = SERVER_TS.read_text(encoding="utf-8")
    hindi = text[text.index("export const hi"):]
    assert set(re.findall(r'"([\w.]+)":', hindi)) == set(TEMPLATES)


def test_english_renders_values_by_name() -> None:
    assert render_en([msg("next.check_dose", time="09:00", title="Blood pressure tablet", name="Kamala")]) == (
        "Check the 9:00 AM Blood pressure tablet with Kamala"
    )
    assert render_en([msg("next.alerts", n=1)]) == "Look at 1 new alert"
    assert render_en([msg("next.alerts", n=3)]) == "Look at 3 new alerts"
    assert render_en([msg("insight.played_days", days=["2026-11-16", "2026-11-17"])]) == (
        "Days with at least one game: Monday, Tuesday."
    )
    assert render_en([msg("tl.consent_given", consent="photos")]) == "Consent given: Family photos"
    assert render_en([msg("tl.mood", mood="not_so_good")]) == "Feeling: Not so good"


STORED_EVENTS = [
    ("Family member added: Rahul (Grandson)", Msg("event.family_added", {"name": "Rahul", "relation": "Grandson"})),
    ("Family member added: Ravi (Grandson (daughter's son))",
     Msg("event.family_added", {"name": "Ravi", "relation": "Grandson (daughter's son)"})),
    ("Reminder added: Tea at the club at 4:30 PM", Msg("event.reminder_added", {"title": "Tea at the club", "time": "16:30"})),
    ("Reminder removed: Evening walk", Msg("event.reminder_removed", {"title": "Evening walk"})),
    ("Tutorial will show again: Paired Associates (object location)", Msg("event.tutorial", {"game": "object_location"})),
    ("Core games changed to Word Recall, Spatial Span, Colour Trails, Money Handling",
     Msg("event.core_games", {"games": ["word_recall", "spatial_span", "colour_trails", "money_handling"]})),
    ("Pinned Memory Match and Clock Setting", Msg("event.pinned", {"game": "memory_match", "game2": "clock_setting"})),
    ("Hidden from More games: none", Msg("event.hidden_none", {})),
    ("Hidden from More games: Reaction Tap", Msg("event.hidden", {"games": ["reaction_tap"]})),
    ("App language set to Hindi", Msg("event.language", {"language": "hi"})),
    ("Festival question: 3 festivals ticked", Msg("event.festivals", {"n": 3})),
    ("City set to Lucknow", Msg("event.city", {"city": "Lucknow"})),
]


@pytest.mark.parametrize(("summary", "expected"), STORED_EVENTS)
def test_stored_settings_changes_read_back(summary: str, expected: Msg) -> None:
    assert parse_event(summary) == [expected]
    assert render_en([expected]) == summary


def test_unknown_text_stays_english_only() -> None:
    assert parse_event("Something the server never wrote") is None
    assert parse_event("Hidden from More games: Not a game") is None
    assert parse_alert("A note typed by hand.") is None


def test_alerts_read_back() -> None:
    unsure = 'Kamala Devi wasn\'t sure about the 9:00 AM reminder "BP tablet". Please check with them.'
    assert parse_alert(unsure) == [Msg("alert.unsure", {"name": "Kamala Devi", "time": "09:00", "title": "BP tablet"})]
    missed = "Kamala missed 4 reminders in the last 48 hours."
    assert parse_alert(missed) == [Msg("alert.missed", {"name": "Kamala", "n": 4})]
    two = (
        "Memory Match average dropped from 0.62 to 0.41 over the last 5 sessions (z = −2.7). "
        "Word Recall average dropped from 0.50 to 0.38 over the last 5 sessions (z ≤ −4.0)."
    )
    parts = parse_alert(two)
    assert parts is not None and [p.params["game"] for p in parts] == ["memory_match", "word_recall"]
    assert parts[1].params["z"] == "≤ −4.0"
    assert render_en(parts) == two


def test_decline_explanations_read_back() -> None:
    steady = "Clock Setting average is 0.44 over the last 5 sessions, against a baseline of 0.40 (z = +0.3)."
    found = parse_explanation(steady)
    assert found is not None and found[0].key == "decline.steady" and found[0].params["game"] == "clock_setting"
    learning = parse_explanation(learning_text(8, 15))
    assert learning == [Msg("decline.learning", {"sessions": 8, "needed": 15})]


def _render(items: list[dict[str, object]] | None) -> str | None:
    if items is None:
        return None
    return render_en([Msg(str(i["key"]), dict(i["params"])) for i in items])  # type: ignore[arg-type]


def test_api_text_and_messages_agree(client, register, clock) -> None:  # type: ignore[no-untyped-def]
    """Every caregiver line the API sends with messages renders back to its English text."""
    from tests.test_caregiver_views import at, glance, play
    from tests.test_overdue_reminders import add, answer
    from tests.test_reminders import Setup

    clock.now = at(16, 9)
    s = Setup(client, register)
    client.patch(f"/api/patients/{s.pid}", json={"city": "Lucknow"}, headers=s.cg)
    rid = add(s, "Tablet", "10:00")
    play(s, at(16, 9, 30))
    clock.now = at(16, 10, 5)
    answer(s, rid, "done")
    clock.now = at(16, 12)
    events = client.get(f"/api/patients/{s.pid}/timeline", headers=s.cg).json()
    insights = client.get(f"/api/patients/{s.pid}/insights", headers=s.cg).json()
    card = glance(s)
    checked = 0
    for text, items in [
        *((e["title"], e["title_i18n"]) for e in events),
        *((e["detail"], e["detail_i18n"]) for e in events),
        *((i["text"], i["text_i18n"]) for i in insights),
        *((i["detail"], i["detail_i18n"]) for i in insights),
        (card["next_action"]["text"], card["next_action"]["text_i18n"]),
    ]:
        if items is not None:
            assert _render(items) == text
            checked += 1
    assert checked >= 8
    assert all(e["title_i18n"] for e in events), [e["title"] for e in events if not e["title_i18n"]]


COMMON_TS = SERVER_TS.parent / "common.ts"
UPLOAD_SOURCES = ["services/family.py", "services/memories.py", "services/speech.py", "routes/family.py", "routes/memories.py", "routes/speech.py"]


def test_upload_reasons_have_hindi() -> None:
    """Every reason the upload routes send (English, numbers as {n}) is in the caregiver dictionary."""
    app_dir = Path(__file__).resolve().parents[1] / "app"
    found: set[str] = set()
    for name in UPLOAD_SOURCES:
        text = (app_dir / name).read_text(encoding="utf-8")
        found |= set(re.findall(r'(?:detail=|Error\()f?"([A-Z][^"{]*(?:\{[^}]+\}[^"{]*)*)"', text))
    from app.services.speech import too_big_message

    found.add(too_big_message())
    reasons = {re.sub(r"\{[^}]+\}|\d+", "{n}", r) for r in found}
    common = COMMON_TS.read_text(encoding="utf-8")
    block = common[common.index("serverErrors: {"): common.index("} as Record<string, string>,")]
    assert "Photos must be {n} MB or smaller." in reasons and "Photo not found" in reasons
    assert reasons - set(re.findall(r'"([^"]+)":', block)) == set()

