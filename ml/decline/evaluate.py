"""Evaluate the decline rule on simulated patients, for the paper.

    python -m ml.decline.evaluate --patients-per-profile 50 --seeds 5

For each seed, simulates `patients-per-profile` patients of each profile (healthy / mci /
moderate) over `days` days with ml.decline.simulator, then replays the decline rule day by
day exactly as the backend does: every evening each game's status comes from its latest
z (only sessions up to that day count) and `alert_decision` decides whether to raise a
decline alert. The same simulated patients are scored with the current settings
(`zscore.DEFAULT`) and the first version (`zscore.LEGACY`: floor 0.02, no clipping, no
warm-up, no escalation) as an ablation.

Metrics, per setting:
- confusion matrix of true profile vs final status (overall cognitive index on the last
  day: Stable / Watch / Declining, or Learning if no game has a baseline yet), accuracy
  with healthy → Stable, mci → Watch, moderate → Declining, and per-class precision,
  recall and F1;
- detection delay: for mci and moderate, the day of the first decline alert (warning or
  critical). Decline starts on day 0 in the simulator, so the day is the delay. Median and
  IQR over detected patients, plus the share detected within `days` days;
- false alarm rate: the share of healthy patients with any decline alert.

Writes `<out>/decline_eval.md` and `<out>/decline_eval.csv` (long format: setting, metric,
group, value).
"""

import argparse
import csv
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean, stdev

import numpy as np

from ml.decline import zscore
from ml.decline.simulator import PROFILES, Profile, SimSession, simulate_patient

STATUS_FOR_PROFILE: dict[Profile, zscore.IndexStatus] = {"healthy": "stable", "mci": "watch", "moderate": "declining"}
STATUS_LABELS: dict[zscore.IndexStatus, str] = {
    "stable": "Stable",
    "watch": "Watch",
    "declining": "Declining",
    "insufficient": "Learning",
}
CLASSES: tuple[zscore.IndexStatus, ...] = ("stable", "watch", "declining")
SETTINGS: dict[str, zscore.DeclineConfig] = {"current": zscore.DEFAULT, "legacy": zscore.LEGACY}
SETTING_TITLES = {
    "current": "Current (floor max(0.05, 0.15×mean), z clipped to ±4, 5-session warm-up, escalation)",
    "legacy": "Legacy (floor 0.02, no clipping, no warm-up, no escalation)",
}
START = datetime(2026, 1, 1, tzinfo=timezone(timedelta(hours=5, minutes=30)))
ALERT_HOUR = 20  # the backend replays the decline check each evening


@dataclass(frozen=True)
class PatientOutcome:
    seed: int
    profile: Profile
    final_status: zscore.IndexStatus
    alerts: tuple[tuple[int, zscore.Severity], ...]  # (day, severity)

    @property
    def first_alert_day(self) -> int | None:
        return self.alerts[0][0] if self.alerts else None


def replay(sessions: Sequence[SimSession], days: int, config: zscore.DeclineConfig) -> tuple[
    zscore.IndexStatus, tuple[tuple[int, zscore.Severity], ...]
]:
    """Final index status and every decline alert (day, severity) for one patient."""
    # Per game: (day, z) for each completed session with a z, in time order. Each point only
    # depends on earlier sessions, so the latest point up to a day is the status that evening.
    z_by_game: dict[str, list[tuple[int, float | None]]] = {}
    day_of = {i: s.day for i, s in enumerate(sessions)}
    for game in sorted({s.game_type for s in sessions}):
        summaries = [s.summary(session_id=i) for i, s in enumerate(sessions) if s.game_type == game]
        z_by_game[game] = [(day_of[p.session.session_id or 0], p.z) for p in zscore.trend(summaries, config)]

    alerts: list[tuple[int, zscore.Severity]] = []
    cursor = {g: -1 for g in z_by_game}
    latest: dict[str, float | None] = {g: None for g in z_by_game}
    for day in range(days):
        for game, points in z_by_game.items():
            while cursor[game] + 1 < len(points) and points[cursor[game] + 1][0] <= day:
                cursor[game] += 1
                latest[game] = points[cursor[game]][1]
        now = START + timedelta(days=day, hours=ALERT_HOUR)
        recent = [(START + timedelta(days=d, hours=ALERT_HOUR), sev) for d, sev in alerts]
        severity = zscore.alert_decision((zscore.status_for(z) for z in latest.values()), recent, now, config)
        if severity is not None:
            alerts.append((day, severity))
    final = zscore.index_status(zscore.overall_index(latest.values()))
    return final, tuple(alerts)


def run(patients_per_profile: int, seeds: int, days: int) -> dict[str, list[PatientOutcome]]:
    outcomes: dict[str, list[PatientOutcome]] = {name: [] for name in SETTINGS}
    for seed in range(seeds):
        rng = np.random.default_rng(seed)
        for profile in PROFILES:
            for k in range(patients_per_profile):
                sessions = simulate_patient(k, profile, days, rng, START)
                for name, config in SETTINGS.items():
                    final, alerts = replay(sessions, days, config)
                    outcomes[name].append(PatientOutcome(seed, profile, final, alerts))
    return outcomes


@dataclass(frozen=True)
class Metrics:
    confusion: dict[Profile, dict[zscore.IndexStatus, int]]
    accuracy: float
    accuracy_by_seed: list[float]
    precision: dict[zscore.IndexStatus, float]
    recall: dict[zscore.IndexStatus, float]
    f1: dict[zscore.IndexStatus, float]
    delay: dict[Profile, tuple[float, float, float] | None]  # median, Q1, Q3 of first-alert day
    detected: dict[Profile, float]
    false_alarm_rate: float
    false_alarm_by_seed: list[float]


def _ratio(a: int, b: int) -> float:
    return a / b if b else 0.0


def _accuracy(outcomes: Sequence[PatientOutcome]) -> float:
    return _ratio(sum(o.final_status == STATUS_FOR_PROFILE[o.profile] for o in outcomes), len(outcomes))


def _false_alarms(outcomes: Sequence[PatientOutcome]) -> float:
    healthy = [o for o in outcomes if o.profile == "healthy"]
    return _ratio(sum(bool(o.alerts) for o in healthy), len(healthy))


def metrics(outcomes: Sequence[PatientOutcome]) -> Metrics:
    statuses: tuple[zscore.IndexStatus, ...] = (*CLASSES, "insufficient")
    confusion = {p: {s: 0 for s in statuses} for p in PROFILES}
    for o in outcomes:
        confusion[o.profile][o.final_status] += 1

    precision: dict[zscore.IndexStatus, float] = {}
    recall: dict[zscore.IndexStatus, float] = {}
    f1: dict[zscore.IndexStatus, float] = {}
    for profile, status in STATUS_FOR_PROFILE.items():
        tp = confusion[profile][status]
        predicted = sum(confusion[p][status] for p in PROFILES)
        actual = sum(confusion[profile].values())
        precision[status] = _ratio(tp, predicted)
        recall[status] = _ratio(tp, actual)
        pr = precision[status] + recall[status]
        f1[status] = 2 * precision[status] * recall[status] / pr if pr else 0.0

    delay: dict[Profile, tuple[float, float, float] | None] = {}
    detected: dict[Profile, float] = {}
    for profile in ("mci", "moderate"):
        group = [o for o in outcomes if o.profile == profile]
        firsts = [d for o in group if (d := o.first_alert_day) is not None]
        detected[profile] = _ratio(len(firsts), len(group))
        if firsts:
            q1, med, q3 = np.percentile(firsts, [25, 50, 75])
            delay[profile] = (float(med), float(q1), float(q3))
        else:
            delay[profile] = None

    seeds = sorted({o.seed for o in outcomes})
    by_seed = [[o for o in outcomes if o.seed == s] for s in seeds]
    return Metrics(
        confusion=confusion,
        accuracy=_accuracy(outcomes),
        accuracy_by_seed=[_accuracy(g) for g in by_seed],
        precision=precision,
        recall=recall,
        f1=f1,
        delay=delay,
        detected=detected,
        false_alarm_rate=_false_alarms(outcomes),
        false_alarm_by_seed=[_false_alarms(g) for g in by_seed],
    )


def _spread(values: Sequence[float]) -> str:
    return f"± {stdev(values):.3f}" if len(values) > 1 else ""


def _delay_text(d: tuple[float, float, float] | None) -> str:
    return "—" if d is None else f"{d[0]:.0f} (IQR {d[1]:.0f}–{d[2]:.0f})"


def to_markdown(results: dict[str, Metrics], patients_per_profile: int, seeds: int, days: int) -> str:
    n = patients_per_profile * seeds
    lines = [
        "# Decline detection on simulated patients",
        "",
        f"Generated by `python -m ml.decline.evaluate --patients-per-profile {patients_per_profile} --seeds {seeds}"
        f" --days {days}`.",
        "",
        f"{n} simulated patients per profile ({patients_per_profile} × {seeds} seeds), {days} days each, from "
        "`ml.decline.simulator` (rounds pass through the real adaptive engine). The decline rule is replayed "
        "each evening as in the backend. Decline starts on day 0, so the detection delay is the day of the "
        "first decline alert (warning or critical). Final status is the overall cognitive index on the last day.",
        "",
        "## Ablation",
        "",
        "| Setting | Accuracy | False alarm rate (healthy) | MCI detected | MCI delay, days | "
        "Moderate detected | Moderate delay, days |",
        "|---|---|---|---|---|---|---|",
    ]
    for name, m in results.items():
        lines.append(
            f"| {name} | {m.accuracy:.3f} {_spread(m.accuracy_by_seed)} "
            f"| {m.false_alarm_rate:.3f} {_spread(m.false_alarm_by_seed)} "
            f"| {m.detected['mci']:.3f} | {_delay_text(m.delay['mci'])} "
            f"| {m.detected['moderate']:.3f} | {_delay_text(m.delay['moderate'])} |"
        )
    lines += ["", "± is the standard deviation across seeds. Delays are median (IQR) over detected patients.", ""]

    for name, m in results.items():
        statuses = [s for s in (*CLASSES, "insufficient") if s != "insufficient" or any(
            m.confusion[p]["insufficient"] for p in PROFILES)]
        lines += [f"## {SETTING_TITLES[name]}", "", "Confusion matrix (rows: true profile, columns: final status):", ""]
        lines.append("| Profile | " + " | ".join(STATUS_LABELS[s] for s in statuses) + " |")
        lines.append("|---|" + "---|" * len(statuses))
        for p in PROFILES:
            lines.append(f"| {p} | " + " | ".join(str(m.confusion[p][s]) for s in statuses) + " |")
        lines += ["", f"Accuracy: {m.accuracy:.3f}", "", "| Class | Precision | Recall | F1 |", "|---|---|---|---|"]
        for profile, s in STATUS_FOR_PROFILE.items():
            lines.append(f"| {STATUS_LABELS[s]} ({profile}) | {m.precision[s]:.3f} | {m.recall[s]:.3f} | {m.f1[s]:.3f} |")
        lines.append("")
    return "\n".join(lines)


def to_rows(results: dict[str, Metrics]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []

    def add(setting: str, metric: str, group: str, value: float | int) -> None:
        rows.append({"setting": setting, "metric": metric, "group": group, "value": round(float(value), 6)})

    for name, m in results.items():
        add(name, "accuracy", "all", m.accuracy)
        for i, a in enumerate(m.accuracy_by_seed):
            add(name, "accuracy", f"seed_{i}", a)
        add(name, "false_alarm_rate", "healthy", m.false_alarm_rate)
        for i, f in enumerate(m.false_alarm_by_seed):
            add(name, "false_alarm_rate", f"seed_{i}", f)
        for s in CLASSES:
            add(name, "precision", s, m.precision[s])
            add(name, "recall", s, m.recall[s])
            add(name, "f1", s, m.f1[s])
        for profile in ("mci", "moderate"):
            add(name, "detected", profile, m.detected[profile])
            d = m.delay[profile]
            if d is not None:
                add(name, "delay_median_days", profile, d[0])
                add(name, "delay_q1_days", profile, d[1])
                add(name, "delay_q3_days", profile, d[2])
        for p in PROFILES:
            for s, count in m.confusion[p].items():
                add(name, f"confusion_{s}", p, count)
    return rows


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Evaluate decline detection on simulated patients.")
    parser.add_argument("--patients-per-profile", type=int, default=50)
    parser.add_argument("--seeds", type=int, default=5)
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--out", type=Path, default=Path("ml/results"))
    args = parser.parse_args(argv)

    outcomes = run(args.patients_per_profile, args.seeds, args.days)
    results = {name: metrics(o) for name, o in outcomes.items()}
    args.out.mkdir(parents=True, exist_ok=True)
    md = to_markdown(results, args.patients_per_profile, args.seeds, args.days)
    (args.out / "decline_eval.md").write_text(md + "\n", encoding="utf-8")
    with (args.out / "decline_eval.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["setting", "metric", "group", "value"])
        writer.writeheader()
        writer.writerows(to_rows(results))
    for name, m in results.items():
        print(f"{name}: accuracy {m.accuracy:.3f} (mean over seeds {mean(m.accuracy_by_seed):.3f}), "
              f"false alarms {m.false_alarm_rate:.3f}, detected mci {m.detected['mci']:.2f} "
              f"moderate {m.detected['moderate']:.2f}")
    print(f"Wrote {args.out / 'decline_eval.md'} and {args.out / 'decline_eval.csv'}")


if __name__ == "__main__":
    main()
