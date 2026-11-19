"""Caregiver text as message keys with values (Round 2 batch 5b).

The server still writes English (stored alerts, settings changes, next actions, insights, timeline
lines), and now also sends each piece as `{key, params}` so caregiver screens can show it in Hindi.
The Hindi (and the same English) templates live in the frontend dictionary
(frontend/src/i18n/caregiver/sections/server.ts); `test_messages.py` checks the two English
copies match.

- Text made on request (next actions, insights, timeline lines) is built from messages here, so
  its English is `render_en(msgs)`.
- Text stored as English (alert messages, settings-change summaries) and the decline module's
  explanations are read back into messages with `parse_alert`, `parse_event` and `parse_explanation`.
  Text that matches no template gives None, and the screen shows the English as it is.

Values are raw, and the screen formats them by their name: `game*` and `games` are game types,
`time` is "HH:MM", `day` and `days` are ISO dates, `consent`, `language`, `mood` and `severity` are
codes. Everything else (names, titles, numbers) is shown as it is.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date

from app.services.game_names import GAME_NAMES

Param = str | int | list[str]
Template = str | tuple[str, str]

LANGUAGE_NAMES = {"en": "English", "hi": "Hindi", "ur": "Urdu"}
CONSENT_NAMES = {"photos": "Family photos", "voice": "Voice task", "elder_on_behalf": "Using Khayal"}
MOOD_WORDS = {"good": "Good", "okay": "Okay", "not_so_good": "Not so good"}

GROUPS = ("memory", "thinking", "orientation")
_GROUP_EN = {"memory": "Memory games", "thinking": "Thinking and everyday games", "orientation": "About Today"}

# English templates. A tuple is (singular, plural), chosen by the `n` value.
TEMPLATES: dict[str, Template] = {
    # Today at a glance: the one next action.
    "next.check_dose": "Check the {time} {title} with {name}",
    "next.missed_dose": ("{n} medicine dose missed today: check with {name}", "{n} medicine doses missed today: check with {name}"),
    "next.alerts": ("Look at {n} new alert", "Look at {n} new alerts"),
    "next.pair": "Pair {name}'s phone or tablet",
    "next.add_reminders": "Add {name}'s medicines and meals as reminders",
    "next.inactive": "{name} hasn't played since {day}. A gentle word may help.",
    "next.all_good": "Nothing needs you today",
    # Insights.
    **{f"insight.steady.{g}": f"{_GROUP_EN[g]} steady this month" for g in GROUPS},
    **{f"insight.lower.{g}": f"{_GROUP_EN[g]} lower this month" for g in GROUPS},
    **{f"insight.little_lower.{g}": f"{_GROUP_EN[g]} a little lower this month" for g in GROUPS},
    "insight.game_lower": "{game} lower this month",
    "insight.game_little_lower": "{game} a little lower this month",
    "insight.z_item": "{game}: z = {z}{sep}",
    "insight.z_item_score": "{game}: z = {z}, recent average {score}{sep}",
    "insight.z_note": "z compares the last 5 sessions with their own normal; below −0.5 is Watch, below −1.5 Declining.",
    "insight.learning": ("Still learning {name}'s normal for {n} game", "Still learning {name}'s normal for {n} games"),
    "insight.learning_intro": "Each game needs 15 finished sessions before it is compared:",
    "insight.learning_item": "{game} {sessions}/{needed} sessions{sep}",
    "insight.doses_detail": "Last 7 days, medicine reminders only: taken {taken}, missed {missed}, not sure {unsure}.",
    "insight.doses_detail_late": (
        "Last 7 days, medicine reminders only: taken {taken} ({late} confirmed later), missed {missed}, not sure {unsure}."
    ),
    "insight.doses_unsure": ("{n} dose unsure this week", "{n} doses unsure this week"),
    "insight.doses_missed": ("{n} dose missed this week", "{n} doses missed this week"),
    "insight.doses_taken": ("All {n} dose taken this week", "All {n} doses taken this week"),
    "insight.played": "Played on {n} of the last 7 days",
    "insight.not_played": "{name} didn't play this week",
    "insight.played_days": "Days with at least one game: {days}.",
    "insight.played_none": "Days with at least one game: none.",
    # Core games left out for a while (pin-fairness): their tracking pauses.
    "insight.core_idle": "Not played for 3 days or more: {games}",
    "insight.core_idle_item": "{game}: last played {date}{sep}",
    "insight.core_idle_never": "{game}: not played yet{sep}",
    "insight.core_idle_pinned": (
        "Today's games are pinned to {game} and {game2}, so the others don't come up and their tracking pauses. "
        "Unpin under Settings, or play them from See other games."
    ),
    # Timeline lines.
    "tl.stopped": "{game}: stopped early",
    "tl.stopped_detail": "{right} of {played} right before stopping",
    "tl.session": "{game}: {right} of {played} right",
    "tl.level": "Level {level}",
    "tl.level_change": "Level {level}, level {level} → {level_end}",
    "tl.reminder_done": "{title} ({time}): done",
    "tl.reminder_late": "{title} ({time}): confirmed later",
    "tl.reminder_done_family": "{title} ({time}): done (marked by family)",
    "tl.reminder_late_family": "{title} ({time}): confirmed later (marked by family)",
    "tl.reminder_unsure": "{title} ({time}): not sure",
    "tl.reminder_unsure_detail": "They were asked to check with family.",
    "tl.reminder_missed": "{title} ({time}): missed",
    "tl.alert": "Alert ({severity})",
    "tl.recording": "Voice task recorded",
    "tl.recording_detail": "Length {length}",
    "tl.consent_given": "Consent given: {consent}",
    "tl.consent_withdrawn": "Consent withdrawn: {consent}",
    "tl.device_paired": "Device paired",
    "tl.device_signed_out": "Device signed out",
    "tl.mood_skipped": "Mood question skipped",
    "tl.mood": "Feeling: {mood}",
    # Settings changes (stored as English in patient_events.summary).
    "event.family_added": "Family member added: {name} ({relation})",
    "event.family_removed": "Family member removed: {name} ({relation})",
    "event.tutorial": "Tutorial will show again: {game}",
    "event.memory_added": "Memory added: {title}",
    "event.memory_removed": "Memory removed: {title}",
    "event.reminder_added": "Reminder added: {title} at {time}",
    "event.reminder_changed": "Reminder changed: {title} at {time}",
    "event.reminder_removed": "Reminder removed: {title}",
    "event.city": "City set to {city}",
    "event.city_removed": "City removed",
    "event.core_games": "Core games changed to {games}",
    "event.festivals": "Festival question: {n} festivals ticked",
    "event.festivals_off": "Festival question turned off",
    "event.pinned": "Pinned {game} and {game2}",
    "event.pins_off": "Today's games back to automatic",
    "event.hidden": "Hidden from More games: {games}",
    "event.hidden_none": "Hidden from More games: none",
    "event.language": "App language set to {language}",
    # Alerts (stored as English in alerts.message).
    "alert.missed": "{name} missed {n} reminders in the last 48 hours.",
    "alert.unsure": "{name} wasn't sure about the {time} reminder \"{title}\". Please check with them.",
    # Decline explanations (ml/decline/zscore.py), also the decline alert's sentences.
    "decline.dropped": "{game} average dropped from {base} to {recent} over the last {window} sessions (z {z}).",
    "decline.steady": "{game} average is {recent} over the last {window} sessions, against a baseline of {base} (z {z}).",
    "decline.learning": "Learning this patient's normal ({sessions}/{needed} sessions)",
}


@dataclass(frozen=True)
class Msg:
    key: str
    params: dict[str, Param] = field(default_factory=dict)


def msg(key: str, **params: Param) -> Msg:
    assert key in TEMPLATES, key
    return Msg(key, params)


# --- English ----------------------------------------------------------------------------


def _clock_en(hhmm: str) -> str:
    h, m = (int(x) for x in hhmm.split(":")[:2])
    return f"{h % 12 or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"


def _one_en(name: str, value: str) -> str:
    if name.startswith("game"):
        return GAME_NAMES.get(value, value)
    if name == "time":
        return _clock_en(value)
    if name.startswith("day"):
        return date.fromisoformat(value).strftime("%A")
    if name.startswith("date"):
        d = date.fromisoformat(value)
        return f"{d.day} {d.strftime('%b')}"
    if name == "consent":
        return CONSENT_NAMES.get(value, value)
    if name == "language":
        return LANGUAGE_NAMES.get(value, value)
    if name == "mood":
        return MOOD_WORDS.get(value, value)
    return value


def _param_en(name: str, value: Param) -> str:
    if isinstance(value, list):
        return ", ".join(_one_en(name, v) for v in value)
    return _one_en(name, str(value))


def template_for(m: Msg) -> str:
    template = TEMPLATES[m.key]
    if isinstance(template, tuple):
        return template[0] if str(m.params.get("n")) == "1" else template[1]
    return template


def render_en(msgs: Sequence[Msg]) -> str:
    """The English text of these messages, joined by spaces."""
    return " ".join(
        re.sub(r"\{(\w+)\}", lambda g: _param_en(g.group(1), m.params[g.group(1)]), template_for(m)) for m in msgs
    )


# --- reading stored English back --------------------------------------------------------

_NAME_TO_GAME = {name: str(getattr(game, "value", game)) for game, name in GAME_NAMES.items()}
_GAME_ALT = "|".join(re.escape(n) for n in sorted(_NAME_TO_GAME, key=len, reverse=True))
_LANG_ALT = "|".join(re.escape(n) for n in LANGUAGE_NAMES.values())
_PATTERNS = {
    "time": r"\d{1,2}:\d{2} [AP]M",
    "n": r"\d+",
    "window": r"\d+",
    "sessions": r"\d+",
    "needed": r"\d+",
    "language": _LANG_ALT,
}


def _group_pattern(name: str) -> str:
    if name in _PATTERNS:
        return _PATTERNS[name]
    if name.startswith("game") and name != "games":
        return _GAME_ALT
    # Lazy, so "Rahul (Grandson (son's son))" reads as name "Rahul" and the whole relation.
    return ".+?"


def _regex(template: str) -> re.Pattern[str]:
    parts = re.split(r"\{(\w+)\}", template)
    out = ""
    for i, part in enumerate(parts):
        out += f"(?P<{part}>{_group_pattern(part)})" if i % 2 else re.escape(part)
    return re.compile(out)


def _to_hhmm(label: str) -> str:
    clock, half = label.split(" ")
    h, m = (int(x) for x in clock.split(":"))
    h = h % 12 + (12 if half == "PM" else 0)
    return f"{h:02d}:{m:02d}"


def _value(name: str, raw: str) -> Param | None:
    if name == "games":
        games = [_NAME_TO_GAME.get(n) for n in raw.split(", ")]
        return [g for g in games if g is not None] if all(games) else None
    if name.startswith("game"):
        return _NAME_TO_GAME.get(raw)
    if name == "time":
        return _to_hhmm(raw)
    if name == "language":
        return next(code for code, n in LANGUAGE_NAMES.items() if n == raw)
    if name in ("n", "window", "sessions", "needed"):
        return int(raw)
    return raw


def _parse_one(text: str, keys: Sequence[str]) -> Msg | None:
    for key in keys:
        templates = TEMPLATES[key]
        for template in templates if isinstance(templates, tuple) else (templates,):
            found = _regex(template).fullmatch(text)
            if not found:
                continue
            params: dict[str, Param] = {}
            for name, raw in found.groupdict().items():
                value = _value(name, raw)
                if value is None:
                    break
                params[name] = value
            else:
                return Msg(key, params)
    return None


_EVENT_KEYS = [k for k in TEMPLATES if k.startswith("event.")]
# Exact ones first, so "Hidden from More games: none" isn't read as a list of games.
_EVENT_KEYS.sort(key=lambda k: "{" in str(TEMPLATES[k]))
_ALERT_KEYS = ["alert.missed", "alert.unsure"]
_DECLINE_KEYS = ["decline.dropped", "decline.steady"]


def parse_event(summary: str) -> list[Msg] | None:
    """A settings change as stored (patient_events.summary)."""
    m = _parse_one(summary, _EVENT_KEYS)
    return [m] if m else None


def parse_explanation(text: str) -> list[Msg] | None:
    """A game's decline explanation (ml/decline/zscore.py)."""
    m = _parse_one(text, [*_DECLINE_KEYS, "decline.learning"])
    return [m] if m else None


def parse_alert(message: str) -> list[Msg] | None:
    """An alert message as stored: one sentence, or one decline sentence per declining game."""
    m = _parse_one(message, _ALERT_KEYS)
    if m:
        return [m]
    parts = [_parse_one(s, _DECLINE_KEYS) for s in re.split(r"(?<=\)\.) ", message)]
    return [p for p in parts if p is not None] if parts and all(parts) else None


def as_dicts(msgs: Sequence[Msg] | None) -> list[dict[str, object]] | None:
    return [{"key": m.key, "params": m.params} for m in msgs] if msgs else None
