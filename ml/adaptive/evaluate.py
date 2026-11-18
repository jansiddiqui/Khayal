"""Compare the adaptive-difficulty engines on simulated patients (Round 2, batch 1).

    python -m ml.adaptive.evaluate --patients-per-profile 30 --seeds 5
    (run from ml/.venv to include the neural bandit; without PyTorch it is skipped)

For each seed and engine, a fresh engine plays the same simulated cohort (healthy, mci and
moderate patients interleaved, 90 days each, `ml.decline.simulator` with `frustration`: a
level that is too hard makes stopping early more likely). Bandits learn online across the
cohort, as one shared model for all patients and games would in the app.

Metrics per engine (pooled over seeds; ± = standard deviation across seeds):
- zone: share of completed levelled sessions with a success rate of 60-80%;
- stopped early: share of levelled sessions stopped early;
- level changes and reversals per 100 decisions (a reversal = a move in the opposite
  direction to the previous move for the same patient and game: oscillation);
- regret: expected reward of the best action minus that of the chosen action, from the
  simulator's true ability on the day (`DecisionLog.regret`); mean per decision and
  cumulative per patient;
- bandit share: decisions the bandit made itself (the rest: rule fallback or one option);
- masking: change in mean level and in success rate from the first to the last 15 days;
- decline detection: the same replay as `ml.decline.evaluate` (current settings, alert
  rule B) on each engine's sessions: final-status accuracy, false alarms, detected, delay.

Writes adaptive_eval.md, adaptive_eval.csv (engine, metric, group, value),
adaptive_regret.png, adaptive_metrics.png and adaptive_decline.png to --out.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from statistics import mean, stdev

import numpy as np

from ml.adaptive.bandit import ZONE, make_engine
from ml.decline import evaluate as decline_eval
from ml.decline import zscore
from ml.decline.simulator import DELAYED, ORIENTATION, PROFILES, DecisionLog, Profile, SimOptions, SimSession, simulate_patient

ENGINES = ("rule", "linucb", "thompson", "neural", "fixed")
TITLES = {
    "rule": "Rule engine (current)",
    "linucb": "LinUCB",
    "thompson": "Linear Thompson sampling",
    "neural": "Neural bandit (ensemble MLP)",
    "fixed": "No adaptation (level stays at 2; reference)",
}
COLOURS = {"rule": "#2a78d6", "linucb": "#d55e00", "thompson": "#009e73", "neural": "#8e5bc9", "fixed": "#8a8984"}
FRUSTRATION = 0.6
EDGE_DAYS = 15
START = decline_eval.START


@dataclass
class EngineRun:
    seed: int
    sessions: dict[tuple[Profile, int], list[SimSession]] = field(default_factory=dict)
    log: list[DecisionLog] = field(default_factory=list)
    seconds: float = 0.0


def available(names: Sequence[str]) -> list[str]:
    if "neural" in names and importlib.util.find_spec("torch") is None:
        print("PyTorch not found: skipping the neural bandit (run from ml/.venv to include it).")
        return [n for n in names if n != "neural"]
    return list(names)


def simulate_engine(name: str, seed: int, patients_per_profile: int, days: int, frustration: float) -> EngineRun:
    t0 = time.perf_counter()
    run = EngineRun(seed)
    options = SimOptions(make_engine(name, seed=seed), frustration=frustration, log=run.log)
    rng = np.random.default_rng(seed)
    for k in range(patients_per_profile):
        for profile in PROFILES:  # interleaved, as families join over time
            run.sessions[(profile, k)] = simulate_patient(k, profile, days, rng, START, options=options)
    run.seconds = time.perf_counter() - t0
    return run


def _levelled(sessions: Sequence[SimSession]) -> list[SimSession]:
    return [s for s in sessions if s.game_type not in (ORIENTATION, DELAYED)]


def _success(s: SimSession) -> float:
    return sum(r.correct for r in s.rounds) / len(s.rounds)


def _ratio(a: float, b: float) -> float:
    return a / b if b else 0.0


@dataclass(frozen=True)
class GroupStats:
    zone: float
    stopped: float
    changes: float  # per 100 decisions
    reversals: float  # per 100 decisions
    regret: float  # mean per decision
    cum_regret: float  # mean per patient over the whole period
    bandit_share: float
    level_change: float  # mean level, last 15 days minus first 15 days
    success_change: float
    final_level: float


def group_stats(runs: Sequence[EngineRun], profiles: Sequence[Profile], days: int) -> GroupStats:
    sessions = [s for r in runs for (p, _), ss in r.sessions.items() if p in profiles for s in _levelled(ss)]
    completed = [s for s in sessions if s.completed]
    logs = [d for r in runs for d in r.log if d.profile in profiles]
    patients = sum(1 for r in runs for (p, _) in r.sessions if p in profiles)

    changes = reversals = 0
    last_move: dict[tuple[int, int, str], int] = {}
    for r in runs:
        for d in r.log:
            if d.profile not in profiles or d.decision.action == 0:
                continue
            changes += 1
            key = (r.seed, d.patient_id * 10 + PROFILES.index(d.profile), d.game_type)
            if last_move.get(key, d.decision.action) != d.decision.action:
                reversals += 1
            last_move[key] = d.decision.action

    early = [s for s in completed if s.day < EDGE_DAYS]
    late = [s for s in completed if s.day >= days - EDGE_DAYS]
    final = [ss_[-1].level_end for r in runs for (p, _), ss in r.sessions.items() if p in profiles
             if (ss_ := _levelled(ss))]
    return GroupStats(
        zone=_ratio(sum(ZONE[0] <= _success(s) <= ZONE[1] for s in completed), len(completed)),
        stopped=_ratio(sum(not s.completed for s in sessions), len(sessions)),
        changes=100 * _ratio(changes, len(logs)),
        reversals=100 * _ratio(reversals, len(logs)),
        regret=mean(d.regret for d in logs) if logs else 0.0,
        cum_regret=_ratio(sum(d.regret for d in logs), patients),
        bandit_share=_ratio(sum(d.decision.source == "bandit" for d in logs), len(logs)),
        level_change=(mean(s.level_start for s in late) - mean(s.level_start for s in early)) if early and late else 0.0,
        success_change=(mean(map(_success, late)) - mean(map(_success, early))) if early and late else 0.0,
        final_level=mean(final) if final else 0.0,
    )


def decline_outcomes(runs: Sequence[EngineRun], days: int) -> list[decline_eval.PatientOutcome]:
    out = []
    for r in runs:
        for (profile, _), sessions in r.sessions.items():
            final, alerts = decline_eval.replay(sessions, days, zscore.DEFAULT)
            out.append(decline_eval.PatientOutcome(r.seed, profile, final, alerts))
    return out


def regret_curve(runs: Sequence[EngineRun]) -> np.ndarray:
    """Mean over seeds of the cumulative regret after each decision (cohort order)."""
    n = min(len(r.log) for r in runs)
    return np.mean([np.cumsum([d.regret for d in r.log[:n]]) for r in runs], axis=0)


@dataclass(frozen=True)
class EngineResult:
    name: str
    overall: GroupStats
    by_profile: dict[Profile, GroupStats]
    by_seed: list[GroupStats]
    decline: decline_eval.Metrics
    curve: np.ndarray
    decisions: int
    seconds: float


def evaluate_engine(name: str, seeds: int, patients_per_profile: int, days: int, frustration: float) -> EngineResult:
    runs = [simulate_engine(name, seed, patients_per_profile, days, frustration) for seed in range(seeds)]
    return EngineResult(
        name=name,
        overall=group_stats(runs, PROFILES, days),
        by_profile={p: group_stats(runs, (p,), days) for p in PROFILES},
        by_seed=[group_stats([r], PROFILES, days) for r in runs],
        decline=decline_eval.metrics(decline_outcomes(runs, days)),
        curve=regret_curve(runs),
        decisions=sum(len(r.log) for r in runs),
        seconds=sum(r.seconds for r in runs),
    )


def _sd(values: Sequence[float], scale: float = 1.0, digits: int = 1) -> str:
    return f" ± {stdev(values) * scale:.{digits}f}" if len(values) > 1 else ""


def _pct(x: float) -> str:
    return f"{100 * x:.1f}%"


def to_markdown(results: dict[str, EngineResult], args: argparse.Namespace,
                reference: decline_eval.Metrics | None = None) -> str:
    n = args.patients_per_profile * args.seeds
    rule = results["rule"]
    lines = [
        "# Learning-based difficulty: bandits vs the rule engine",
        "",
        f"Generated by `python -m ml.adaptive.evaluate --patients-per-profile {args.patients_per_profile} "
        f"--seeds {args.seeds} --days {args.days} --frustration {args.frustration}` (from `ml/.venv`).",
        "",
        f"{n} simulated patients per profile ({args.patients_per_profile} × {args.seeds} seeds), {args.days} days, "
        "the default core set. Each engine starts untrained on every seed and learns online across the cohort. "
        f"Frustration {args.frustration}: the chance of stopping early rises by {args.frustration} × how far the "
        "expected success rate is below 60%, the same for every engine. Reward: 1 − |s − 0.70| / 0.30 "
        "(clipped to −1..1) for the next session's success rate s, minus 0.5 if it was stopped early. "
        "Regret uses the simulator's true ability on the day. ± is the standard deviation across seeds.",
        "",
        "## Difficulty",
        "",
        "| Engine | In 60–80% zone | Stopped early | Level changes / 100 | Reversals / 100 | Regret / decision "
        "| Cumulative regret / patient | Decided by the bandit |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for name, r in results.items():
        o, s = r.overall, r.by_seed
        lines.append(
            f"| {TITLES[name]} | {_pct(o.zone)}{_sd([x.zone for x in s], 100)} "
            f"| {_pct(o.stopped)}{_sd([x.stopped for x in s], 100)} | {o.changes:.1f} | {o.reversals:.1f} "
            f"| {o.regret:.4f}{_sd([x.regret for x in s], 1, 4)} | {o.cum_regret:.2f} "
            f"| {'—' if name in ('rule', 'fixed') else _pct(o.bandit_share)} |"
        )
    lines += [
        "",
        "![Cumulative regret](adaptive_regret.png)",
        "",
        "![Zone, stopped early and reversals by profile](adaptive_metrics.png)",
        "",
        "### By profile",
        "",
        "| Engine | Profile | In zone | Stopped early | Reversals / 100 | Regret / decision | Final level "
        "| Level change (first → last 15 days) | Success change |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for name, r in results.items():
        for p in PROFILES:
            g = r.by_profile[p]
            lines.append(
                f"| {TITLES[name]} | {p} | {_pct(g.zone)} | {_pct(g.stopped)} | {g.reversals:.1f} | {g.regret:.4f} "
                f"| {g.final_level:.1f} | {g.level_change:+.2f} | {100 * g.success_change:+.1f} pts |"
            )
    lines += [
        "",
        "## Does adaptive difficulty hide decline?",
        "",
        "The decline replay of `ml.decline.evaluate` (current settings, alert rule B) on each engine's sessions. "
        "The last row is the rule engine without frustration (the default simulator of `decline_eval.md`): "
        f"frustration ({args.frustration}) changes how often patients stop early, and so the numbers.",
        "",
        "| Engine | Final-status accuracy | False alarms (healthy) | MCI detected | MCI delay, days "
        "| Moderate detected | Moderate delay, days |",
        "|---|---|---|---|---|---|---|",
    ]
    for name, r in results.items():
        m = r.decline
        lines.append(
            f"| {TITLES[name]} | {m.accuracy:.3f}{_sd(m.accuracy_by_seed, 1, 3)} | {m.false_alarm_rate:.3f} "
            f"| {m.detected['mci']:.3f} | {decline_eval._delay_text(m.delay['mci'])} "
            f"| {m.detected['moderate']:.3f} | {decline_eval._delay_text(m.delay['moderate'])} |"
        )
    if reference is not None:
        m = reference
        lines.append(
            f"| Rule engine, no frustration (reference) | {m.accuracy:.3f}{_sd(m.accuracy_by_seed, 1, 3)} "
            f"| {m.false_alarm_rate:.3f} | {m.detected['mci']:.3f} | {decline_eval._delay_text(m.delay['mci'])} "
            f"| {m.detected['moderate']:.3f} | {decline_eval._delay_text(m.delay['moderate'])} |"
        )
    lines += ["", "![Decline detection by engine](adaptive_decline.png)", ""]
    lines += findings(results)
    lines += [
        "",
        "## Run time",
        "",
        "| Engine | Decisions | Seconds |",
        "|---|---|---|",
        *[f"| {TITLES[n]} | {r.decisions} | {r.seconds:.0f} |" for n, r in results.items()],
        "",
        f"Rule engine baseline for comparison: {rule.decisions} decisions.",
    ]
    return "\n".join(lines)


def findings(results: dict[str, EngineResult]) -> list[str]:
    """Plain statements computed from the numbers (the narrative is in the docstring of the report)."""
    rule = results["rule"]
    bandits = [n for n in ("linucb", "thompson", "neural") if n in results]
    best = min(bandits, key=lambda n: results[n].overall.regret) if bandits else None
    out = ["## Findings (computed)", ""]
    for n in bandits:
        r = results[n]
        out.append(
            f"- {TITLES[n]}: zone {_pct(r.overall.zone)} vs {_pct(rule.overall.zone)} for the rule engine, "
            f"stopped early {_pct(r.overall.stopped)} vs {_pct(rule.overall.stopped)}, regret per decision "
            f"{r.overall.regret:.4f} vs {rule.overall.regret:.4f}, reversals {r.overall.reversals:.1f} vs "
            f"{rule.overall.reversals:.1f} per 100; decline accuracy {r.decline.accuracy:.3f} vs "
            f"{rule.decline.accuracy:.3f}, MCI detected {r.decline.detected['mci']:.3f} vs "
            f"{rule.decline.detected['mci']:.3f}, false alarms {r.decline.false_alarm_rate:.3f} vs "
            f"{rule.decline.false_alarm_rate:.3f}."
        )
    for n in bandits:
        r = results[n]
        det = r.decline.detected["mci"] - rule.decline.detected["mci"]
        fa = r.decline.false_alarm_rate - rule.decline.false_alarm_rate
        lv = r.by_profile["mci"].level_change - rule.by_profile["mci"].level_change
        if det < -0.02:
            verdict = "hides decline: fewer MCI patients are detected than with the rule engine"
        elif det > 0.02 and fa > 0.02:
            verdict = ("does not hide decline but exaggerates it: more MCI patients detected and more false alarms "
                       "among healthy patients")
        elif det > 0.02:
            verdict = "detects more MCI patients without more false alarms"
        else:
            verdict = "detects decline about as well as the rule engine"
        out.append(
            f"- {TITLES[n]} {verdict}. Its MCI patients' level moves {lv:+.2f} levels more than with the rule engine "
            "from the first to the last 15 days (the composite multiplies accuracy by level, so a level that "
            "falls faster makes decline look larger)."
        )
    if best:
        out.append(f"- Lowest regret among the bandits: {TITLES[best]}.")
    if "fixed" in results:
        f = results["fixed"]
        out.append(
            f"- No adaptation (reference): zone {_pct(f.overall.zone)}, MCI detected {f.decline.detected['mci']:.3f}, "
            f"false alarms {f.decline.false_alarm_rate:.3f}."
        )
    return out


def to_rows(results: dict[str, EngineResult]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []

    def add(engine: str, metric: str, group: str, value: float) -> None:
        rows.append({"engine": engine, "metric": metric, "group": group, "value": round(float(value), 6)})

    for name, r in results.items():
        groups: list[tuple[str, GroupStats]] = [("all", r.overall), *r.by_profile.items(),
                                                *((f"seed_{i}", g) for i, g in enumerate(r.by_seed))]
        for group, g in groups:
            for metric, value in vars(g).items():
                add(name, metric, group, value)
        m = r.decline
        add(name, "decline_accuracy", "all", m.accuracy)
        add(name, "decline_false_alarm_rate", "healthy", m.false_alarm_rate)
        add(name, "decline_alert_accuracy", "all", m.alert_accuracy)
        for p in ("mci", "moderate"):
            add(name, "decline_detected", p, m.detected[p])
            if (d := m.delay[p]) is not None:
                add(name, "decline_delay_median_days", p, d[0])
        add(name, "decisions", "all", r.decisions)
    return rows


def _style(ax: object) -> None:
    grid, muted = "#e5e4df", "#52514e"
    ax.grid(True, color=grid, linewidth=0.8)  # type: ignore[attr-defined]
    ax.set_axisbelow(True)  # type: ignore[attr-defined]
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)  # type: ignore[attr-defined]
    for side in ("left", "bottom"):
        ax.spines[side].set_color(grid)  # type: ignore[attr-defined]
    ax.tick_params(colors=muted, labelsize=8)  # type: ignore[attr-defined]


def plot(results: dict[str, EngineResult], out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    ink, muted = "#1f1e1c", "#52514e"

    # 1. Cumulative regret over the cohort's decisions.
    fig, ax = plt.subplots(figsize=(6.6, 4.0), dpi=200)
    for name, r in results.items():
        ax.plot(r.curve, color=COLOURS[name], linewidth=2, linestyle="--" if name == "fixed" else "-",
                label=TITLES[name])
    ax.set_xlabel("Decisions so far (whole cohort, mean over seeds)", fontsize=9, color=muted)
    ax.set_ylabel("Cumulative regret", fontsize=9, color=muted)
    ax.set_title("Cumulative regret (lower is better)", fontsize=10, color=ink, loc="left")
    ax.legend(fontsize=7, frameon=False, loc="upper left")
    _style(ax)
    ax.set_xlim(0, max(len(r.curve) for r in results.values()))
    ax.set_ylim(bottom=0)
    fig.tight_layout()
    fig.savefig(out / "adaptive_regret.png", facecolor="white")
    plt.close(fig)

    # 2. Zone, stopped early, reversals by profile (small multiples, one row of dots per engine).
    names = list(results)
    panels = [("In 60–80% zone (%)", lambda g: 100 * g.zone), ("Stopped early (%)", lambda g: 100 * g.stopped),
              ("Reversals per 100 decisions", lambda g: g.reversals)]
    fig, axes = plt.subplots(1, 3, figsize=(9.6, 3.4), dpi=200, sharey=True)
    markers = {"healthy": "o", "mci": "s", "moderate": "^"}
    for ax, (title, f) in zip(axes, panels):
        for i, name in enumerate(names):
            for p in PROFILES:
                ax.plot(f(results[name].by_profile[p]), i, marker=markers[p], color=COLOURS[name], markersize=7,
                        markeredgecolor="white", markeredgewidth=1.2, linestyle="none")
        ax.set_title(title, fontsize=9, color=ink, loc="left")
        _style(ax)
    axes[0].set_yticks(range(len(names)), [TITLES[n].split(" (")[0] for n in names])
    axes[0].invert_yaxis()
    handles = [plt.Line2D([], [], marker=m, color=muted, linestyle="none", label=p) for p, m in markers.items()]
    fig.legend(handles=handles, loc="lower center", ncol=3, fontsize=8, frameon=False)
    fig.tight_layout(rect=(0, 0.08, 1, 1))
    fig.savefig(out / "adaptive_metrics.png", facecolor="white")
    plt.close(fig)

    # 3. Decline detection per engine.
    fig, ax = plt.subplots(figsize=(6.6, 3.4), dpi=200)
    metrics = [("MCI detected", lambda m: m.detected["mci"]), ("Moderate detected", lambda m: m.detected["moderate"]),
               ("False alarms (healthy)", lambda m: m.false_alarm_rate), ("Final-status accuracy", lambda m: m.accuracy)]
    width = 0.8 / len(names)
    for i, name in enumerate(names):
        xs = [j + (i - (len(names) - 1) / 2) * width for j in range(len(metrics))]
        vals = [100 * f(results[name].decline) for _, f in metrics]
        ax.bar(xs, vals, width=width - 0.02, color=COLOURS[name], label=TITLES[name].split(" (")[0])
    ax.set_xticks(range(len(metrics)), [t for t, _ in metrics], fontsize=8)
    ax.set_ylabel("%", fontsize=9, color=muted)
    ax.set_title("Decline detection with each engine (alert rule B)", fontsize=10, color=ink, loc="left")
    ax.legend(fontsize=7, frameon=False, ncol=len(names), loc="upper center", bbox_to_anchor=(0.5, -0.12))
    _style(ax)
    fig.tight_layout()
    fig.savefig(out / "adaptive_decline.png", facecolor="white")
    plt.close(fig)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Compare adaptive-difficulty engines on simulated patients.")
    parser.add_argument("--patients-per-profile", type=int, default=30)
    parser.add_argument("--seeds", type=int, default=5)
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--frustration", type=float, default=FRUSTRATION)
    parser.add_argument("--engines", default=",".join(ENGINES))
    parser.add_argument("--out", type=Path, default=Path("ml/results"))
    parser.add_argument("--no-plots", action="store_true")
    args = parser.parse_args(argv)

    names = available(args.engines.split(","))
    if "rule" not in names:
        names.insert(0, "rule")
    results: dict[str, EngineResult] = {}
    for name in names:
        results[name] = evaluate_engine(name, args.seeds, args.patients_per_profile, args.days, args.frustration)
        o = results[name].overall
        print(f"{name}: zone {o.zone:.3f}, stopped {o.stopped:.3f}, regret {o.regret:.4f}, reversals "
              f"{o.reversals:.1f}, decline accuracy {results[name].decline.accuracy:.3f} "
              f"({results[name].seconds:.0f}s)", flush=True)

    # Reference: the rule engine on the default simulator (no frustration), as in decline_eval.md.
    reference = decline_eval.metrics(decline_outcomes(
        [simulate_engine("rule", seed, args.patients_per_profile, args.days, 0.0) for seed in range(args.seeds)],
        args.days))
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "adaptive_eval.md").write_text(to_markdown(results, args, reference) + "\n", encoding="utf-8")
    with (args.out / "adaptive_eval.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["engine", "metric", "group", "value"])
        writer.writeheader()
        writer.writerows(to_rows(results))
    if not args.no_plots:
        plot(results, args.out)
    print(f"Wrote adaptive_eval.md and adaptive_eval.csv to {args.out}")


if __name__ == "__main__":
    main()
