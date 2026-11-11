"""Evaluate the decline rule on simulated patients, for the paper.

    python -m ml.decline.evaluate --patients-per-profile 50 --seeds 5

For each seed, simulates `patients-per-profile` patients of each profile (healthy / mci /
moderate) over `days` days with ml.decline.simulator, then replays the decline rule day by
day exactly as the backend does: every evening each game's status comes from its latest
z (only sessions up to that day count) and `alert_decision` decides whether to raise a
decline alert. The same simulated patients are scored with the current settings
(`zscore.DEFAULT`) and the first version (`zscore.LEGACY`: floor 0.02, no clipping, no
warm-up, no escalation) as an ablation, and with the alert rule variants A-E
(`zscore.DeclineConfig.alert_rule`; everything else as in the current settings).

Metrics, per setting:
- confusion matrix of true profile vs final status (overall cognitive index on the last
  day: Stable / Watch / Declining, or Learning if no game has a baseline yet), accuracy
  with healthy → Stable, mci → Watch, moderate → Declining, and per-class precision,
  recall and F1;
- detection delay: for mci and moderate, the day of the first decline alert (warning or
  critical). Decline starts on day 0 in the simulator, so the day is the delay. Median and
  IQR over detected patients, plus the share detected within `days` days;
- false alarm rate: the share of healthy patients with any decline alert;
- alert accuracy: the share of patients the alerts get right (healthy: no alert; mci and
  moderate: at least one alert). Final-status accuracy does not depend on the alert rule.

Writes `<out>/decline_eval.md`, `<out>/decline_eval.csv` (long format: setting, metric,
group, value) and `<out>/decline_tradeoff.png` (false alarm rate vs median detection
delay, one point per alert rule variant; needs matplotlib, see ml/requirements-results.txt).
"""

import argparse
import csv
from collections.abc import Sequence
from dataclasses import dataclass, replace
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
# Alert rule variants: label -> (setting name, rule). A is the current setting.
VARIANTS: dict[str, tuple[str, zscore.AlertRule]] = {
    "A": ("current", "any"),
    "B": ("B", "persistence"),
    "C": ("C", "two_games"),
    "D": ("D", "index"),
    "E": ("E", "persistence_or_index"),
}
VARIANT_TITLES = {
    "A": "any game z < −1.5 (current)",
    "B": "same game z < −1.5 on 3 consecutive sessions",
    "C": "at least 2 games z < −1.5 at once",
    "D": "overall index < −1.5",
    "E": "B or D",
}
CHART_NAMES = {"A": "any game", "B": "persistence", "C": "two games", "D": "index", "E": "B or D"}
LABEL_OFFSETS = {"C": (6, 17), "D": (6, 5)}  # C and D sit close together
CONFIGS: dict[str, zscore.DeclineConfig] = {
    **SETTINGS,
    **{name: replace(zscore.DEFAULT, alert_rule=rule) for name, rule in VARIANTS.values() if name not in SETTINGS},
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
    # depends on earlier sessions, so the points up to a day are what the backend sees that evening.
    z_by_game: dict[str, list[tuple[int, float | None]]] = {}
    day_of = {i: s.day for i, s in enumerate(sessions)}
    for game in sorted({s.game_type for s in sessions}):
        summaries = [s.summary(session_id=i) for i, s in enumerate(sessions) if s.game_type == game]
        z_by_game[game] = [(day_of[p.session.session_id or 0], p.z) for p in zscore.trend(summaries, config)]

    alerts: list[tuple[int, zscore.Severity]] = []
    cursor = {g: -1 for g in z_by_game}
    history: dict[str, list[float]] = {g: [] for g in z_by_game}
    for day in range(days):
        for game, points in z_by_game.items():
            while cursor[game] + 1 < len(points) and points[cursor[game] + 1][0] <= day:
                cursor[game] += 1
                z = points[cursor[game]][1]
                if z is not None:
                    history[game].append(z)
        now = START + timedelta(days=day, hours=ALERT_HOUR)
        recent = [(START + timedelta(days=d, hours=ALERT_HOUR), sev) for d, sev in alerts]
        candidate = zscore.candidate_alert(history, config)
        severity = zscore.alert_decision([candidate] if candidate is not None else [], recent, now, config)
        if severity is not None:
            alerts.append((day, severity))
    final = zscore.index_status(zscore.overall_index(zs[-1] if zs else None for zs in history.values()))
    return final, tuple(alerts)


def run(patients_per_profile: int, seeds: int, days: int) -> dict[str, list[PatientOutcome]]:
    outcomes: dict[str, list[PatientOutcome]] = {name: [] for name in CONFIGS}
    for seed in range(seeds):
        rng = np.random.default_rng(seed)
        for profile in PROFILES:
            for k in range(patients_per_profile):
                sessions = simulate_patient(k, profile, days, rng, START)
                for name, config in CONFIGS.items():
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
    delay_declining: tuple[float, float, float] | None  # mci and moderate pooled
    detected: dict[Profile, float]
    alert_accuracy: float
    false_alarm_rate: float
    false_alarm_by_seed: list[float]


def _ratio(a: int, b: int) -> float:
    return a / b if b else 0.0


def _accuracy(outcomes: Sequence[PatientOutcome]) -> float:
    return _ratio(sum(o.final_status == STATUS_FOR_PROFILE[o.profile] for o in outcomes), len(outcomes))


def _quartiles(days: Sequence[int]) -> tuple[float, float, float] | None:
    """(median, Q1, Q3), or None if empty."""
    if not days:
        return None
    q1, med, q3 = np.percentile(days, [25, 50, 75])
    return float(med), float(q1), float(q3)


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
        delay[profile] = _quartiles(firsts)
    pooled = [d for o in outcomes if o.profile != "healthy" and (d := o.first_alert_day) is not None]
    alert_right = sum(bool(o.alerts) == (o.profile != "healthy") for o in outcomes)

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
        delay_declining=_quartiles(pooled),
        detected=detected,
        alert_accuracy=_ratio(alert_right, len(outcomes)),
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
    for name in SETTINGS:
        m = results[name]
        lines.append(
            f"| {name} | {m.accuracy:.3f} {_spread(m.accuracy_by_seed)} "
            f"| {m.false_alarm_rate:.3f} {_spread(m.false_alarm_by_seed)} "
            f"| {m.detected['mci']:.3f} | {_delay_text(m.delay['mci'])} "
            f"| {m.detected['moderate']:.3f} | {_delay_text(m.delay['moderate'])} |"
        )
    lines += ["", "± is the standard deviation across seeds. Delays are median (IQR) over detected patients.", ""]

    lines += [
        "## Alert rule variants",
        "",
        "Everything else as in the current settings (floors, clipping, warm-up, escalation, 7-day throttle). "
        "False alarm = a healthy patient with any decline alert. Alert accuracy = healthy patients without an "
        "alert plus mci/moderate patients with one, over all patients. Final-status accuracy is the same for "
        f"every variant ({results['current'].accuracy:.3f}) because the final status comes from the index, "
        "not from the alerts.",
        "",
        "| Variant | Rule | False alarm rate (healthy) | Alert accuracy | MCI detected | MCI delay, days "
        "| Moderate detected | Moderate delay, days |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for label, (name, _) in VARIANTS.items():
        m = results[name]
        lines.append(
            f"| {label} | {VARIANT_TITLES[label]} | {m.false_alarm_rate:.3f} {_spread(m.false_alarm_by_seed)} "
            f"| {m.alert_accuracy:.3f} | {m.detected['mci']:.3f} | {_delay_text(m.delay['mci'])} "
            f"| {m.detected['moderate']:.3f} | {_delay_text(m.delay['moderate'])} |"
        )
    lines += ["", "![False alarm rate vs median detection delay](decline_tradeoff.png)", ""]

    for name in SETTINGS:
        m = results[name]
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
        add(name, "alert_accuracy", "all", m.alert_accuracy)
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


def plot_tradeoff(results: dict[str, Metrics], out: Path) -> None:
    """False alarm rate vs median detection delay (mci and moderate pooled), one point per variant."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    series, ink, muted, grid = "#2a78d6", "#1f1e1c", "#52514e", "#e5e4df"
    fig, ax = plt.subplots(figsize=(6.4, 4.2), dpi=200)
    # Variants that land on the same point share one marker and one label.
    points: dict[tuple[float, float], list[str]] = {}
    for label, (name, _) in VARIANTS.items():
        m = results[name]
        if m.delay_declining is not None:
            points.setdefault((m.delay_declining[0], round(100 * m.false_alarm_rate, 1)), []).append(label)
    for (med, y), labels in points.items():
        m = results[VARIANTS[labels[0]][0]]
        assert m.delay_declining is not None
        _, q1, q3 = m.delay_declining
        detected = mean(m.detected[p] for p in ("mci", "moderate"))
        ax.errorbar(med, y, xerr=[[med - q1], [q3 - med]], fmt="o", color=series, ecolor=series, elinewidth=1.2,
                    capsize=0, markersize=8, markeredgecolor="white", markeredgewidth=1.5, zorder=3, clip_on=False)
        text = " = ".join(f"{label} {CHART_NAMES[label]}" for label in labels) + f" · {detected:.0%} detected"
        ax.annotate(text, (med, y), xytext=LABEL_OFFSETS.get(labels[0], (6, 7)), textcoords="offset points",
                    fontsize=8, color=ink)
    ax.set_xlabel("Median detection delay, days (MCI + moderate; bar = IQR; detected = mean of the two)",
                  fontsize=9, color=muted)
    ax.set_ylabel("False alarm rate (% of healthy patients)", fontsize=9, color=muted)
    ax.set_title("Alert rules: false alarms vs detection delay (lower left is better)", fontsize=10, color=ink,
                 loc="left")
    ax.set_ylim(-1.5, None)
    ax.grid(True, color=grid, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(grid)
    ax.tick_params(colors=muted, labelsize=8)
    fig.tight_layout()
    fig.savefig(out, facecolor="white")
    plt.close(fig)


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
    plot_tradeoff(results, args.out / "decline_tradeoff.png")
    for name, m in results.items():
        print(f"{name}: accuracy {m.accuracy:.3f} (mean over seeds {mean(m.accuracy_by_seed):.3f}), "
              f"false alarms {m.false_alarm_rate:.3f}, detected mci {m.detected['mci']:.2f} "
              f"moderate {m.detected['moderate']:.2f}, alert accuracy {m.alert_accuracy:.3f}")
    print(f"Wrote decline_eval.md, decline_eval.csv and decline_tradeoff.png to {args.out}")


if __name__ == "__main__":
    main()
