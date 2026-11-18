"""A small neural contextual bandit (research only; needs PyTorch from ml/.venv).

A bootstrapped ensemble of 5 tiny MLPs (10 -> 32 -> 32 -> 3, one output per action) predicts
the reward of each action from the same context as the linear bandits (`bandit.Context`).
Each decision samples one ensemble member and takes its best allowed action (Thompson
sampling by bootstrap, Osband et al., 2016). Uncertainty = the standard deviation of the
chosen action's prediction across the members; above `max_uncertainty`, or before
`min_obs` rewards, the rule engine decides (`SafeBandit`).

Training: every `train_every` new rewards, each member takes `steps` Adam steps on
minibatches from the last `buffer` rewards, each sample weighted by that member's own
Poisson(1) bootstrap weight. Only the chosen action's output gets a loss.
"""

from __future__ import annotations

import numpy as np
import torch
from torch import nn

from ml.adaptive.bandit import ACTIONS, N_FEATURES, SafeBandit


def _mlp() -> nn.Module:
    return nn.Sequential(nn.Linear(N_FEATURES, 32), nn.ReLU(), nn.Linear(32, 32), nn.ReLU(), nn.Linear(32, len(ACTIONS)))


class NeuralBandit(SafeBandit):
    name = "neural"

    def __init__(
        self,
        *,
        members: int = 5,
        min_obs: int = 200,
        max_uncertainty: float = 0.12,
        train_every: int = 50,
        steps: int = 25,
        batch: int = 64,
        buffer: int = 4000,
        lr: float = 3e-3,
        seed: int = 0,
    ) -> None:
        super().__init__(min_obs=min_obs, max_uncertainty=max_uncertainty, seed=seed)
        torch.manual_seed(seed)
        self.nets = [_mlp() for _ in range(members)]
        self.opts = [torch.optim.Adam(n.parameters(), lr=lr) for n in self.nets]
        self.train_every, self.steps, self.batch, self.buffer = train_every, steps, batch, buffer
        self.xs: list[np.ndarray] = []
        self.actions: list[int] = []
        self.rewards: list[float] = []
        self.weights: list[np.ndarray] = []  # one bootstrap weight per member

    @torch.no_grad()
    def _predict(self, x: np.ndarray) -> np.ndarray:
        """(members, actions) predicted rewards."""
        t = torch.as_tensor(x, dtype=torch.float32).unsqueeze(0)
        return np.stack([n(t).squeeze(0).numpy() for n in self.nets])

    def choose(self, x: np.ndarray, allowed: tuple[int, ...]) -> tuple[int, float]:
        preds = self._predict(x)
        member = int(self.rng.integers(len(self.nets)))
        index = {a: ACTIONS.index(a) for a in allowed}
        best = max(allowed, key=lambda a: (float(preds[member, index[a]]), a == 0))
        return best, float(preds[:, index[best]].std())

    def update(self, x: np.ndarray, action: int, reward: float) -> None:
        self.xs.append(x.astype(np.float32))
        self.actions.append(ACTIONS.index(action))
        self.rewards.append(reward)
        self.weights.append(self.rng.poisson(1.0, size=len(self.nets)).astype(np.float32))
        if len(self.rewards) % self.train_every == 0:
            self._train()

    def _train(self) -> None:
        start = max(0, len(self.rewards) - self.buffer)
        x = torch.as_tensor(np.stack(self.xs[start:]))
        a = torch.as_tensor(self.actions[start:], dtype=torch.long)
        r = torch.as_tensor(self.rewards[start:], dtype=torch.float32)
        w = torch.as_tensor(np.stack(self.weights[start:]))
        n = len(r)
        for k, (net, opt) in enumerate(zip(self.nets, self.opts)):
            for _ in range(self.steps):
                idx = torch.as_tensor(self.rng.integers(0, n, size=min(self.batch, n)))
                pred = net(x[idx]).gather(1, a[idx].unsqueeze(1)).squeeze(1)
                loss = (w[idx, k] * (pred - r[idx]) ** 2).sum() / w[idx, k].sum().clamp(min=1.0)
                opt.zero_grad()
                loss.backward()
                opt.step()
