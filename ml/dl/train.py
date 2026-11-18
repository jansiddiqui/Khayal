"""Training with early stopping on the validation loss, and day-by-day predictions for the test split.

Loss = cross-entropy on the profile + binary cross-entropy on the decline flag, at every
session (sequence models) or snapshot (MLP). Adam, gradient clipping, early stopping with
patience; the weights with the lowest validation loss are kept. Everything is seeded.
"""

import copy
import random
from dataclasses import dataclass, field

import numpy as np
import torch
from torch import nn

from ml.dl.data import Sequences, Summaries, last_session_index_by_day
from ml.dl.models import SequenceModel, SummaryMLP


@dataclass(frozen=True)
class TrainConfig:
    epochs: int = 60
    patience: int = 6
    batch_size: int = 64
    lr: float = 1e-3
    weight_decay: float = 1e-4
    clip: float = 1.0


@dataclass
class History:
    train_loss: list[float] = field(default_factory=list)
    val_loss: list[float] = field(default_factory=list)
    best_epoch: int = 0


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True)


def _pad(xs: list[np.ndarray], targets: list[np.ndarray]) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    lengths = torch.tensor([len(x) for x in xs])
    steps, n_features = int(lengths.max()), xs[0].shape[1]
    x = torch.zeros(len(xs), steps, n_features)
    y = torch.zeros(len(xs), steps)
    for i, (xi, yi) in enumerate(zip(xs, targets)):
        x[i, : len(xi)] = torch.from_numpy(xi)
        y[i, : len(yi)] = torch.from_numpy(yi)
    return x, y, lengths


def _sequence_loss(model: SequenceModel, data: Sequences, idx: np.ndarray) -> torch.Tensor:
    x, flag, lengths = _pad([data.x[i] for i in idx], [data.flag[i] for i in idx])
    profile_logits, decline_logits = model(x)
    mask = torch.arange(x.shape[1])[None, :] < lengths[:, None]
    profile = torch.as_tensor(data.profile[idx])[:, None].expand(-1, x.shape[1])
    ce = nn.functional.cross_entropy(profile_logits[mask], profile[mask])
    bce = nn.functional.binary_cross_entropy_with_logits(decline_logits[mask], flag[mask])
    return ce + bce


def _summary_loss(model: SummaryMLP, data: Summaries, idx: np.ndarray) -> torch.Tensor:
    profile_logits, decline_logits = model(torch.from_numpy(data.x[idx]))
    ce = nn.functional.cross_entropy(profile_logits, torch.as_tensor(data.profile[idx]))
    bce = nn.functional.binary_cross_entropy_with_logits(decline_logits, torch.from_numpy(data.flag[idx]))
    return ce + bce


def _fit(model: nn.Module, loss_fn, n_train: int, n_val: int, cfg: TrainConfig, seed: int) -> History:  # type: ignore[no-untyped-def]
    """Generic loop: `loss_fn(model, split, idx)` with split "train" / "val"."""
    rng = np.random.default_rng(seed)
    opt = torch.optim.Adam(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    history = History()
    best = float("inf")
    best_state = copy.deepcopy(model.state_dict())
    stale = 0
    for epoch in range(cfg.epochs):
        model.train()
        order = rng.permutation(n_train)
        total, seen = 0.0, 0
        for start in range(0, n_train, cfg.batch_size):
            idx = order[start : start + cfg.batch_size]
            opt.zero_grad()
            loss = loss_fn(model, "train", idx)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), cfg.clip)
            opt.step()
            total += loss.item() * len(idx)
            seen += len(idx)
        history.train_loss.append(total / seen)

        model.eval()
        with torch.no_grad():
            val_total = 0.0
            for start in range(0, n_val, 128):
                idx = np.arange(start, min(n_val, start + 128))
                val_total += loss_fn(model, "val", idx).item() * len(idx)
        val = val_total / n_val
        history.val_loss.append(val)
        if val < best - 1e-4:
            best, stale, history.best_epoch = val, 0, epoch
            best_state = copy.deepcopy(model.state_dict())
        else:
            stale += 1
            if stale >= cfg.patience:
                break
    model.load_state_dict(best_state)
    model.eval()
    return history


def train_sequence(
    model: SequenceModel, train: Sequences, val: Sequences, cfg: TrainConfig, seed: int
) -> History:
    splits = {"train": train, "val": val}
    return _fit(model, lambda m, s, idx: _sequence_loss(m, splits[s], idx), len(train.x), len(val.x), cfg, seed)


def train_summary(model: SummaryMLP, train: Summaries, val: Summaries, cfg: TrainConfig, seed: int) -> History:
    splits = {"train": train, "val": val}
    return _fit(model, lambda m, s, idx: _summary_loss(m, splits[s], idx), len(train.x), len(val.x), cfg, seed)


@dataclass
class DailyPredictions:
    """Per test patient and day: P(decline) and profile probabilities after that day's play."""

    p_decline: np.ndarray  # (n_patients, days); days before the first session are 0
    profile_by_day: np.ndarray  # (n_patients, days, 3); NaN before the first session

    @property
    def final_profile(self) -> np.ndarray:
        return self.profile_by_day[:, -1]


@torch.no_grad()
def predict_sequence(model: SequenceModel, data: Sequences, days: int) -> DailyPredictions:
    p_decline = np.zeros((len(data.x), days))
    profile = np.full((len(data.x), days, 3), np.nan)
    for start in range(0, len(data.x), 128):
        idx = np.arange(start, min(len(data.x), start + 128))
        x, _, lengths = _pad([data.x[i] for i in idx], [data.flag[i] for i in idx])
        profile_logits, decline_logits = model(x)
        probs = torch.sigmoid(decline_logits).numpy()
        prof = torch.softmax(profile_logits, dim=-1).numpy()
        for row, i in enumerate(idx):
            by_day = last_session_index_by_day(data.session_day[i], days)
            played = by_day >= 0
            p_decline[i, played] = probs[row, by_day[played]]
            profile[i, played] = prof[row, by_day[played]]
    return DailyPredictions(p_decline, profile)


@torch.no_grad()
def predict_summary(model: SummaryMLP, data: Summaries, days: int) -> DailyPredictions:
    """`data` must have one snapshot per patient per day (0..days-1), in patient then day order."""
    profile_logits, decline_logits = model(torch.from_numpy(data.x))
    n = len(data.patients)
    p_decline = torch.sigmoid(decline_logits).numpy().reshape(n, days)
    prof = torch.softmax(profile_logits, dim=-1).numpy().reshape(n, days, 3)
    # No sessions yet → no prediction (as for the sequence models).
    for i, p in enumerate(data.patients):
        first = p.sessions[0].day if p.sessions else days
        p_decline[i, :first] = 0.0
        prof[i, :first] = np.nan
    return DailyPredictions(p_decline, prof)
