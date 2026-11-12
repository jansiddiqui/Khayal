"""Deep-learning decline detection vs the rule, for the paper.

    python -m ml.dl.run                      # 600 patients per profile, 90 days, 5 seeds
    python -m ml.dl.run --per-profile 60 --seeds 2 --epochs 5 --out <dir> --cache <dir>   # quick check

For each seed: simulate a fresh cohort, split it 70/15/15 by patient, fit the scalers on the
training patients, train the models (GRU, LSTM, GRU without study time, MLP on summary
features), then predict every day for the validation patients, the test patients and five
shifted test cohorts (robustness: the models are not retrained). The rule (variants A–E,
replayed each evening exactly as in ml.decline.evaluate) runs on the same patients.

Trained models and each seed's predictions are saved under --cache (default data/dl,
gitignored), so an interrupted run resumes where it stopped and the report can be redone
without retraining (--re-evaluate recomputes predictions from the saved models).
"""

import argparse
import json
import pickle
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch

from ml.decline.evaluate import CONFIGS, STATUS_FOR_PROFILE, VARIANTS, replay
from ml.decline.simulator import PROFILES, Profile
from ml.dl import data as D
from ml.dl.metrics import Outcome, alarm_day, score
from ml.dl.models import SequenceModel, SummaryMLP
from ml.dl.train import (
    DailyPredictions,
    History,
    TrainConfig,
    predict_sequence,
    predict_summary,
    set_seed,
    train_sequence,
    train_summary,
)

MODELS = ("mlp", "gru", "lstm", "gru_no_study")
METHODS = ("rule_b", *MODELS)
METHOD_TITLES = {
    "rule_b": "Rule B (app: same game z < −1.5 on 3 sessions in a row)",
    "mlp": "MLP on summary features",
    "gru": "GRU (2 layers)",
    "lstm": "LSTM (2 layers)",
    "gru_no_study": "GRU without study time",
}
SEQUENCE_MODELS = {"gru": ("gru", True), "lstm": ("lstm", True), "gru_no_study": ("gru", False)}
PROFILE_FOR_STATUS: dict[str, Profile] = {status: profile for profile, status in STATUS_FOR_PROFILE.items()}
# Days at which every method's profile is also scored (how early each one can tell; label-free).
CHECKPOINT_DAYS = (14, 30, 60)
CACHE_VERSION = 2


def checkpoint_days(days: int) -> tuple[int, ...]:
    """The checkpoint days that fall inside a `days`-day window (the last day is scored separately)."""
    return tuple(d for d in CHECKPOINT_DAYS if d < days - 1)


@dataclass
class EvalSet:
    """Everything needed to score one group of patients, for every method and threshold."""

    profiles: list[Profile]
    onsets: list[int]
    rule: dict[str, list[Outcome]]  # rule variant label ("A".."E") -> outcomes over the full window
    rule_checkpoints: dict[int, list[Outcome]]  # rule B: profile on a checkpoint day
    p_decline: dict[str, np.ndarray] = field(default_factory=dict)  # model -> (patients, days)
    predicted: dict[str, np.ndarray] = field(default_factory=dict)  # model -> (patients, days) profile index, -1 = none

    def outcomes(self, method: str, threshold: float = 0.5, day: int | None = None) -> list[Outcome]:
        """Outcomes for a method: profile on `day` (default: last day), flag day at `threshold`."""
        if method.startswith("rule_"):
            variant = method.removeprefix("rule_").upper()
            if day is None:
                return self.rule[variant]
            assert variant == "B", "checkpoints are kept for rule B only"
            return self.rule_checkpoints[day]
        pred = self.predicted[method]
        d = pred.shape[1] - 1 if day is None else day
        return [
            Outcome(prof, PROFILES[pred[i, d]] if pred[i, d] >= 0 else None,
                    alarm_day(self.p_decline[method][i], threshold), self.onsets[i])
            for i, prof in enumerate(self.profiles)
        ]


@dataclass
class SeedResult:
    seed: int
    n_patients: dict[str, int]
    histories: dict[str, History]
    val: EvalSet
    test: EvalSet
    shifts: dict[str, EvalSet]
    seconds: float

    @property
    def outcomes(self) -> dict[str, list[Outcome]]:
        """Test outcomes at the default threshold, per method."""
        return {m: self.test.outcomes(m) for m in METHODS}

    @property
    def checkpoints(self) -> dict[str, dict[int, list[Outcome]]]:
        days = self.test.predicted["gru"].shape[1]
        return {m: {d: self.test.outcomes(m, day=d) for d in checkpoint_days(days)} for m in METHODS}


def rule_eval(patients: list[D.Patient], days: int, variants: tuple[str, ...] = ("B",)) -> EvalSet:
    """The rule on each patient: per variant, final index status and first decline alert; rule B on checkpoint days."""
    def outcomes(config_name: str, upto: int) -> list[Outcome]:
        out = []
        for p in patients:
            final, alerts = replay(p.sessions, upto, CONFIGS[config_name])
            out.append(Outcome(p.profile, PROFILE_FOR_STATUS.get(final), alerts[0][0] if alerts else None, p.onset_day))
        return out

    rule = {label: outcomes(VARIANTS[label][0], days) for label in variants}
    checkpoints = {d: outcomes(VARIANTS["B"][0], d + 1) for d in checkpoint_days(days)}
    return EvalSet([p.profile for p in patients], [p.onset_day for p in patients], rule, checkpoints)


def _store(es: EvalSet, name: str, pred: DailyPredictions) -> None:
    es.p_decline[name] = pred.p_decline.astype(np.float32)
    labels = np.where(np.isnan(pred.profile_by_day).any(axis=2), -1, np.nan_to_num(pred.profile_by_day).argmax(axis=2))
    es.predicted[name] = labels.astype(np.int8)


@dataclass
class Trained:
    models: dict[str, torch.nn.Module]
    scaler: D.Scaler
    summary_scaler: D.SummaryScaler
    histories: dict[str, History]


def _meta(per_profile: int, days: int, cfg: TrainConfig) -> dict[str, object]:
    return {"version": CACHE_VERSION, "per_profile": per_profile, "days": days, "epochs": cfg.epochs,
            "patience": cfg.patience, "batch_size": cfg.batch_size, "lr": cfg.lr}


def _snapshot_days(days: int) -> list[int]:
    return sorted({*range(4, days, 5), days - 1})


def train_all(split: dict[str, list[D.Patient]], seed: int, days: int, cfg: TrainConfig, log) -> Trained:  # type: ignore[no-untyped-def]
    scaler = D.Scaler.fit([D.raw_session_rows(p, days) for p in split["train"]])
    models: dict[str, torch.nn.Module] = {}
    histories: dict[str, History] = {}
    for name, (kind, use_study) in SEQUENCE_MODELS.items():
        seqs = {s: D.build_sequences(split[s], scaler, days, use_study) for s in ("train", "val")}
        set_seed(seed)
        model = SequenceModel(seqs["train"].x[0].shape[1], kind)  # type: ignore[arg-type]
        histories[name] = train_sequence(model, seqs["train"], seqs["val"], cfg, seed)
        models[name] = model
        log(f"seed {seed}: {name} best epoch {histories[name].best_epoch + 1}, val loss {min(histories[name].val_loss):.3f}")

    snapshots = _snapshot_days(days)
    raw_train, *_ = D.summary_rows(split["train"], days, snapshots)
    summary_scaler = D.SummaryScaler.fit(raw_train)
    train_s = D.build_summaries(split["train"], days, snapshots, summary_scaler)
    val_s = D.build_summaries(split["val"], days, snapshots, summary_scaler)
    set_seed(seed)
    mlp = SummaryMLP(train_s.x.shape[1])
    histories["mlp"] = train_summary(mlp, train_s, val_s, cfg, seed)
    models["mlp"] = mlp
    log(f"seed {seed}: mlp best epoch {histories['mlp'].best_epoch + 1}, val loss {min(histories['mlp'].val_loss):.3f}")
    return Trained(models, scaler, summary_scaler, histories)


def save_trained(trained: Trained, folder: Path, meta: dict[str, object]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    shapes = {name: _n_features(m) for name, m in trained.models.items()}
    torch.save({name: m.state_dict() for name, m in trained.models.items()}, folder / "models.pt")
    with (folder / "trained.pkl").open("wb") as f:
        pickle.dump({"scaler": trained.scaler, "summary_scaler": trained.summary_scaler,
                     "histories": trained.histories, "shapes": shapes}, f)
    (folder / "meta.json").write_text(json.dumps(meta), encoding="utf-8")


def _n_features(model: torch.nn.Module) -> int:
    if isinstance(model, SequenceModel):
        return int(model.rnn.input_size)
    assert isinstance(model, SummaryMLP)
    return int(model.body[0].in_features)  # type: ignore[union-attr]


def load_trained(folder: Path, meta: dict[str, object]) -> Trained | None:
    try:
        if json.loads((folder / "meta.json").read_text(encoding="utf-8")) != meta:
            return None
        with (folder / "trained.pkl").open("rb") as f:
            extra = pickle.load(f)
        states = torch.load(folder / "models.pt", weights_only=True)
    except FileNotFoundError:
        return None
    models: dict[str, torch.nn.Module] = {}
    for name, state in states.items():
        if name == "mlp":
            model: torch.nn.Module = SummaryMLP(extra["shapes"][name])
        else:
            model = SequenceModel(extra["shapes"][name], SEQUENCE_MODELS[name][0])  # type: ignore[arg-type]
        model.load_state_dict(state)
        model.eval()
        models[name] = model
    return Trained(models, extra["scaler"], extra["summary_scaler"], extra["histories"])


def predict_all(trained: Trained, es: EvalSet, patients: list[D.Patient], days: int) -> None:
    """Every model's day-by-day predictions for these patients, stored in `es`."""
    for name, (_, use_study) in SEQUENCE_MODELS.items():
        seqs = D.build_sequences(patients, trained.scaler, days, use_study)
        _store(es, name, predict_sequence(trained.models[name], seqs, days))  # type: ignore[arg-type]
    summaries = D.build_summaries(patients, days, range(days), trained.summary_scaler)
    _store(es, "mlp", predict_summary(trained.models["mlp"], summaries, days))  # type: ignore[arg-type]


def run_seed(  # type: ignore[no-untyped-def]
    seed: int, per_profile: int, days: int, cfg: TrainConfig, log=print, cache: Path | None = None,
    re_evaluate: bool = False,
) -> SeedResult:
    t0 = time.time()
    meta = _meta(per_profile, days, cfg)
    folder = cache / f"seed_{seed}" if cache else None
    if folder and not re_evaluate and (folder / "result.pkl").exists() and load_trained(folder, meta) is not None:
        with (folder / "result.pkl").open("rb") as f:
            log(f"seed {seed}: loaded from {folder}")
            return pickle.load(f)

    cohort = D.simulate_cohort(seed, per_profile, days)
    split = D.split_by_patient(cohort, seed)
    log(f"seed {seed}: {len(cohort)} patients simulated "
        f"({', '.join(f'{k} {len(v)}' for k, v in split.items())}) in {time.time() - t0:.0f}s")

    trained = load_trained(folder, meta) if folder else None
    if trained is None:
        trained = train_all(split, seed, days, cfg, log)
        if folder:
            save_trained(trained, folder, meta)
    else:
        log(f"seed {seed}: models loaded from {folder}")

    val = rule_eval(split["val"], days)
    predict_all(trained, val, split["val"], days)
    test = rule_eval(split["test"], days, tuple(VARIANTS))
    predict_all(trained, test, split["test"], days)
    shifts: dict[str, EvalSet] = {}
    n_shift = len(split["test"]) // len(PROFILES)
    for shift in D.SHIFTS:
        patients = D.simulate_shifted_cohort(seed, n_shift, days, shift)
        shifts[shift.name] = rule_eval(patients, days)
        predict_all(trained, shifts[shift.name], patients, days)
        log(f"seed {seed}: shift {shift.name} done")

    result = SeedResult(seed, {k: len(v) for k, v in split.items()}, trained.histories, val, test, shifts,
                        time.time() - t0)
    for name in METHODS:
        s = score(result.test.outcomes(name))
        log(f"seed {seed}: {name:13s} acc {s.accuracy:.3f} macroF1 {s.macro_f1:.3f} FA {s.false_alarm_rate:.3f} "
            f"delay mci {s.delay_median['mci']} moderate {s.delay_median['moderate']}")
    if folder:
        with (folder / "result.pkl").open("wb") as f:
            pickle.dump(result, f)
    return result


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Deep-learning decline detection vs the rule, on simulated patients.")
    parser.add_argument("--per-profile", type=int, default=600)
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--seeds", type=int, default=5)
    parser.add_argument("--epochs", type=int, default=TrainConfig.epochs)
    parser.add_argument("--threads", type=int, default=0, help="torch CPU threads (0 = torch default)")
    parser.add_argument("--out", type=Path, default=Path("ml/results"))
    parser.add_argument("--cache", type=Path, default=Path("data/dl"), help="saved models and predictions per seed")
    parser.add_argument("--re-evaluate", action="store_true", help="recompute predictions from the saved models")
    args = parser.parse_args(argv)
    if args.threads:
        torch.set_num_threads(args.threads)

    from ml.dl.report import write_report  # matplotlib only needed here

    cfg = TrainConfig(epochs=args.epochs)
    results = [
        run_seed(seed, args.per_profile, args.days, cfg, cache=args.cache, re_evaluate=args.re_evaluate)
        for seed in range(args.seeds)
    ]
    write_report(results, args.per_profile, args.days, cfg, args.out)
    print(f"Wrote dl_decline.md, dl_decline.csv and figures to {args.out}")


if __name__ == "__main__":
    main()
