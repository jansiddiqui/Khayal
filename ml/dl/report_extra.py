"""The added report sections: matched false-alarm thresholds, trade-off curves, robustness, early accuracy, limitations."""

import csv
from collections.abc import Callable, Sequence
from pathlib import Path

import numpy as np

from ml.decline.evaluate import VARIANT_TITLES
from ml.decline.simulator import PROFILES
from ml.dl import analysis as A
from ml.dl.data import SHIFTS
from ml.dl.metrics import Scores, mean_std, score
from ml.dl.run import METHOD_TITLES, MODELS, EvalSet, SeedResult

SERIES, RULE, INK, MUTED, GRID = "#2a78d6", "#8a8984", "#1f1e1c", "#52514e", "#e5e4df"
SHIFT_TITLES = {"default": "Default simulator (test split)", **{s.name: s.title for s in SHIFTS}}
LINESTYLES = {"gru": "-", "lstm": "--", "mlp": ":"}
CURVE_MODELS = ("gru", "lstm", "mlp")


def _fmt(ms: tuple[float, float] | None, digits: int = 3) -> str:
    return "—" if ms is None else f"{ms[0]:.{digits}f} ± {ms[1]:.{digits}f}"


def _pct(ms: tuple[float, float] | None) -> str:
    return "—" if ms is None else f"{100 * ms[0]:.1f}% ± {100 * ms[1]:.1f}"


def _delay(scores: Sequence[Scores], profile: str) -> str:
    """'26.0 ± 1.2 d (98%)': median delay over detected patients, mean ± std over seeds, and the share detected."""
    d = mean_std([s.delay_median[profile] for s in scores])  # type: ignore[index]
    det = mean_std([s.detected[profile] for s in scores])  # type: ignore[index]
    return f"{_fmt(d, 1)} ({'—' if det is None else f'{det[0]:.0%}'})"


def _sets(r: SeedResult) -> dict[str, EvalSet]:
    return {"default": r.test, **r.shifts}


def _scores(results: Sequence[SeedResult], where: str, method: str, matched: bool = False,
            day: int | None = None) -> list[Scores]:
    out = []
    for r in results:
        es = _sets(r)[where]
        if matched and method in MODELS:
            out.append(score(es.outcomes(method, threshold=A.matched_threshold(r, method), day=day)))
        else:
            out.append(score(es.outcomes(method, day=day)))
    return out


def matched_section(results: Sequence[SeedResult]) -> list[str]:
    target = mean_std([A.rule_b_false_alarm(r.val) for r in results])
    rule = _scores(results, "default", "rule_b")
    lines = [
        "## Early warning at a matched false-alarm rate",
        "",
        "A threshold of 0.5 gives the models far more false alarms than the rule, so the delays above are not a "
        "like-for-like comparison. Here each model's flag threshold is chosen on the **validation** patients: the "
        "lowest threshold whose validation false-alarm rate is at most rule B's on the same validation patients "
        f"({_pct(target)} over seeds). Test patients are scored at that threshold. Detected = recall of the flag "
        "for that profile within the 90 days.",
        "",
        "| Method | Threshold | False alarm rate (test) | MCI delay, days (detected) | Moderate delay, days (detected) |",
        "|---|---|---|---|---|",
        f"| {METHOD_TITLES['rule_b']} | — | {_pct(mean_std([s.false_alarm_rate for s in rule]))} "
        f"| {_delay(rule, 'mci')} | {_delay(rule, 'moderate')} |",
    ]
    for m in MODELS:
        s = _scores(results, "default", m, matched=True)
        thresholds = mean_std([A.matched_threshold(r, m) for r in results])
        lines.append(
            f"| {METHOD_TITLES[m]} | {_fmt(thresholds, 4)} | {_pct(mean_std([x.false_alarm_rate for x in s]))} "
            f"| {_delay(s, 'mci')} | {_delay(s, 'moderate')} |"
        )
    lines += [
        "",
        "![False alarms vs detection delay](dl_tradeoff.png)",
        "",
        "The curves sweep the flag threshold (test patients, all seeds pooled; the open circle is threshold 0.5). "
        "The grey points are the rule's variants on the same patients: "
        + "; ".join(f"{k} = {v}" for k, v in VARIANT_TITLES.items()) + ".",
        "",
    ]
    return lines


def robustness_section(results: Sequence[SeedResult]) -> list[str]:
    where = ["default", *(s.name for s in SHIFTS)]
    lines = [
        "## Robustness: shifted simulators, no retraining",
        "",
        "The models trained on the default simulator are tested on new patients from changed simulators "
        f"({results[0].n_patients['test']} per seed, same size as the test split). The rule's settings are unchanged "
        "too. Thresholds are the ones matched on the default validation set. With a later onset, the delay counts "
        "from each patient's own onset, and a flag before the decline starts is not counted as detected.",
        "",
        "**Profile**",
        "",
        "| Test set | Method | Accuracy | Macro F1 | Day-14 accuracy |",
        "|---|---|---|---|---|",
    ]
    for w in where:
        for m in A.ROBUSTNESS_METHODS:
            s = _scores(results, w, m)
            d14 = _scores(results, w, m, day=14)
            lines.append(
                f"| {SHIFT_TITLES[w]} | {METHOD_TITLES[m].split(' (')[0]} | {_fmt(mean_std([x.accuracy for x in s]))} "
                f"| {_fmt(mean_std([x.macro_f1 for x in s]))} | {_fmt(mean_std([x.accuracy for x in d14]))} |"
            )
    lines += [
        "",
        "**Early warning at the matched thresholds**",
        "",
        "| Test set | Method | False alarm rate | MCI delay, days (detected) | Moderate delay, days (detected) "
        "| Flagged before onset |",
        "|---|---|---|---|---|---|",
    ]
    for w in where:
        for m in A.ROBUSTNESS_METHODS:
            s = _scores(results, w, m, matched=True)
            before = mean_std([x.flagged_before_onset for x in s]) if w == "late_onset" else None
            lines.append(
                f"| {SHIFT_TITLES[w]} | {METHOD_TITLES[m].split(' (')[0]} | {_pct(mean_std([x.false_alarm_rate for x in s]))} "
                f"| {_delay(s, 'mci')} | {_delay(s, 'moderate')} | {'—' if before is None else _pct(before)} |"
            )
    lines += [
        "",
        "**Early warning at threshold 0.5** (for reference)",
        "",
        "| Test set | Method | False alarm rate | MCI delay, days (detected) | Moderate delay, days (detected) |",
        "|---|---|---|---|---|",
    ]
    for w in where:
        for m in A.ROBUSTNESS_METHODS[1:]:
            s = _scores(results, w, m)
            lines.append(
                f"| {SHIFT_TITLES[w]} | {METHOD_TITLES[m].split(' (')[0]} | {_pct(mean_std([x.false_alarm_rate for x in s]))} "
                f"| {_delay(s, 'mci')} | {_delay(s, 'moderate')} |"
            )
    lines.append("")
    return lines


def early_section(results: Sequence[SeedResult]) -> list[str]:
    st = A.early_stats()

    def d14(where: str, m: str) -> float:
        return float(np.mean([x.accuracy for x in _scores(results, where, m, day=14)]))

    gru_default, gru_same = d14("default", "gru"), d14("same_nuisance", "gru")
    mlp_default, mlp_same = d14("default", "mlp"), d14("same_nuisance", "mlp")
    rule_default = d14("default", "rule_b")
    lines = [
        "## What the models use in the first two weeks",
        "",
        "In the simulator, decline starts on day 0 for mci and moderate patients (ability falls linearly: "
        f"{st.ability_drop['mci'] / 14:.4f} and {st.ability_drop['moderate'] / 14:.4f} per day). By day 14 that is "
        f"only {st.ability_drop['mci']:.3f} (mci) and {st.ability_drop['moderate']:.3f} (moderate), against a "
        f"day-to-day noise of {st.daily_noise['healthy']}, {st.daily_noise['mci']} and {st.daily_noise['moderate']} "
        "(healthy, mci, moderate). But the profiles differ from day 0 in more than decline:",
        "",
        "| Days 0–14 | Healthy | MCI | Moderate |",
        "|---|---|---|---|",
        "| Expected ability lost by day 14 | " + " | ".join(f"{st.ability_drop[p]:.3f}" for p in PROFILES) + " |",
        "| Day-to-day ability noise (SD) | " + " | ".join(f"{st.daily_noise[p]:.3f}" for p in PROFILES) + " |",
        "| Chance of playing on a day | " + " | ".join(f"{st.play_probability[p]:.2f}" for p in PROFILES) + " |",
        "| Days played (of 15) | " + " | ".join(f"{st.play_days[p]:.1f}" for p in PROFILES) + " |",
        "| Sessions stopped early | " + " | ".join(f"{st.stopped_early[p]:.1%}" for p in PROFILES) + " |",
        "| SD of About Today composite within a patient | " + " | ".join(f"{st.composite_sd[p]:.3f}" for p in PROFILES)
        + " |",
        "",
        f"Day-14 profile accuracy on the default test patients: GRU {gru_default:.3f}, MLP {mlp_default:.3f}, "
        f"rule B {rule_default:.3f} (the rule has no baseline yet, so it says Learning). On patients where every "
        f"profile shares the healthy noise and play rate (only the decline differs), the GRU falls to "
        f"{gru_same:.3f} and the MLP to {mlp_same:.3f}.",
        "",
    ]
    if max(gru_default, mlp_default) > 0.6:
        lines += [
            "So the early accuracy is mostly not early detection of decline. The models pick up how often the "
            "patient plays, how often sessions are stopped early and how much scores wobble from day to day, "
            "which the simulator sets differently per profile from day 0. Real patients may differ in these "
            "ways too, but this simulator makes the separation much cleaner than real data would. The "
            "same-nuisance rows in the robustness tables show what is left when only the decline differs.",
            "",
        ]
    return lines


LIMITATIONS = [
    "## Limitations",
    "",
    "All results here come from simulated patients (`ml/decline/simulator.py`), not real ones. The simulator "
    "decides how ability falls, how noisy each profile is, how often each profile plays and stops early, and how "
    "study time behaves (an assumption added for this experiment). The models learn those choices. They are "
    "trained and tested on the same simulator, and the robustness tests only change a few of its knobs. The "
    "profiles also differ in noise and play rate from day 0, which the models exploit (see above). The "
    "early-warning target uses the simulator's true ability, which real data would not have. Before any of this "
    "goes into the app, it needs real patient data, labels from clinicians and a prospective check of false "
    "alarms. The rule's thresholds were also chosen on this simulator.",
    "",
]


# Where each model's name sits next to its threshold-0.5 point, so the names don't overlap.
LABEL_OFFSETS = {"gru": (8, -8), "lstm": (8, 6), "mlp": (-8, 6)}


def plot_tradeoff(results: Sequence[SeedResult], out: Path) -> None:
    import matplotlib.pyplot as plt

    rules = A.rule_points(results)
    fig, axes = plt.subplots(1, 2, figsize=(9.6, 4.0), dpi=200, sharey=True)
    for ax, profile in zip(axes, ("mci", "moderate")):
        for m in CURVE_MODELS:
            pts = [p for p in A.sweep(results, m) if p.delay_median[profile] is not None]
            xs = [p.delay_median[profile] for p in pts]
            ys = [100 * p.false_alarm for p in pts]
            ax.plot(xs, ys, color=SERIES, linestyle=LINESTYLES[m], linewidth=1.6)
            half = min(pts, key=lambda p: abs(p.threshold - 0.5))
            ax.plot(half.delay_median[profile], 100 * half.false_alarm, "o", markerfacecolor="white",
                    markeredgecolor=SERIES, markersize=6, zorder=3)
            ax.annotate(m.upper(), (half.delay_median[profile], 100 * half.false_alarm),
                        xytext=LABEL_OFFSETS[m], textcoords="offset points", fontsize=8, color=INK,
                        ha="right" if LABEL_OFFSETS[m][0] < 0 else "left", va="center")
        # Rule variants that land on (nearly) the same point share one label.
        merged: list[tuple[float, float, list[str]]] = []
        for label, p in rules.items():
            d = p.delay_median[profile]
            if d is None:
                continue
            x, y = float(d), 100 * p.false_alarm
            ax.plot(x, y, "s", color=RULE, markersize=6, zorder=3)
            near = next((g for g in merged if abs(g[0] - x) <= 3 and abs(g[1] - y) <= 3), None)
            if near:
                near[2].append(label)
            else:
                merged.append((x, y, [label]))
        for x, y, labels in merged:
            ax.annotate("Rule " + " ≈ ".join(labels), (x, y), xytext=(5, 6), textcoords="offset points",
                        fontsize=7, color=MUTED)
        ax.set_title(f"{'MCI' if profile == 'mci' else 'Moderate'} patients", fontsize=9, color=INK, loc="left")
        ax.set_xlabel("Median detection delay, days", fontsize=8, color=MUTED)
        ax.grid(True, color=GRID, linewidth=0.8)
        ax.set_axisbelow(True)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(GRID)
        ax.tick_params(colors=MUTED, labelsize=8)
    axes[0].set_ylabel("False alarm rate, % of healthy", fontsize=8, color=MUTED)
    fig.suptitle("False alarms vs detection delay as the flag threshold changes (lower left is better; "
                 "solid GRU, dashed LSTM, dotted MLP; open circle = 0.5)", fontsize=8.5, color=INK, x=0.01, ha="left")
    fig.tight_layout()
    fig.savefig(out, facecolor="white")
    plt.close(fig)


def extra_rows(results: Sequence[SeedResult]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []

    def add(method: str, seed: int | str, metric: str, group: str, value: float | None) -> None:
        rows.append({"method": method, "seed": seed, "metric": metric, "group": group,
                     "value": "" if value is None else round(float(value), 6)})

    for r in results:
        add("rule_b", r.seed, "val_false_alarm_rate", "healthy", A.rule_b_false_alarm(r.val))
        for m in MODELS:
            add(m, r.seed, "matched_threshold", "all", A.matched_threshold(r, m))
        for w, es in _sets(r).items():
            for m in ("rule_b", *MODELS):
                for kind, outcomes in (("t0.5", es.outcomes(m)),
                                       *((("matched", es.outcomes(m, threshold=A.matched_threshold(r, m))),)
                                         if m in MODELS else ())):
                    s = score(outcomes)
                    prefix = f"{w}:{kind}"
                    add(m, r.seed, "accuracy", prefix, s.accuracy)
                    add(m, r.seed, "macro_f1", prefix, s.macro_f1)
                    add(m, r.seed, "false_alarm_rate", prefix, s.false_alarm_rate)
                    add(m, r.seed, "flagged_before_onset", prefix, s.flagged_before_onset)
                    for p in ("mci", "moderate"):
                        add(m, r.seed, f"detected_{p}", prefix, s.detected[p])
                        add(m, r.seed, f"delay_median_days_{p}", prefix, s.delay_median[p])
                add(m, r.seed, "accuracy_day_14", w, score(es.outcomes(m, day=14)).accuracy)
            for label in r.test.rule:
                if w == "default":
                    s = score(r.test.rule[label])
                    add(f"rule_{label.lower()}", r.seed, "false_alarm_rate", "default", s.false_alarm_rate)
                    for p in ("mci", "moderate"):
                        add(f"rule_{label.lower()}", r.seed, f"delay_median_days_{p}", "default", s.delay_median[p])
    return rows


def write_sweep_csv(results: Sequence[SeedResult], out: Path) -> None:
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["model", "threshold", "false_alarm_rate", "detected_mci", "delay_median_mci",
                         "detected_moderate", "delay_median_moderate"])
        for m in MODELS:
            for p in A.sweep(results, m):
                writer.writerow([m, round(p.threshold, 6), round(p.false_alarm, 6),
                                 round(p.detected["mci"], 6), p.delay_median["mci"],
                                 round(p.detected["moderate"], 6), p.delay_median["moderate"]])


Section = Callable[[Sequence[SeedResult]], list[str]]
SECTIONS: tuple[Section, ...] = (matched_section, robustness_section, early_section)
