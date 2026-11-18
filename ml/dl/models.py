"""Small models for decline detection. Each has two heads: profile (3 classes) and decline (1 logit).

- SequenceModel: a 2-layer GRU or LSTM over a patient's sessions in time order. It predicts
  after every session, using only that session and the ones before it (causal), so the
  prediction at a day is what the model would have said that evening. Batches are padded at
  the end; because the RNN is causal, padding never changes the outputs at real sessions
  (the loss ignores padded steps), and running it unpacked is several times faster on CPU.
- SummaryMLP: a 2-layer MLP on hand-made summary features of all sessions up to a day.
"""

from typing import Literal

import torch
from torch import nn

N_PROFILES = 3
Kind = Literal["gru", "lstm"]


class SequenceModel(nn.Module):
    def __init__(self, n_features: int, kind: Kind, hidden: int = 64, layers: int = 2, dropout: float = 0.2) -> None:
        super().__init__()
        rnn = nn.GRU if kind == "gru" else nn.LSTM
        self.rnn = rnn(n_features, hidden, num_layers=layers, batch_first=True, dropout=dropout)
        self.profile_head = nn.Linear(hidden, N_PROFILES)
        self.decline_head = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """x: (batch, steps, features), padded at the end → profile logits (b, t, 3), decline logits (b, t)."""
        hidden, _ = self.rnn(x)
        return self.profile_head(hidden), self.decline_head(hidden).squeeze(-1)


class SummaryMLP(nn.Module):
    def __init__(self, n_features: int, hidden: int = 64, dropout: float = 0.2) -> None:
        super().__init__()
        self.body = nn.Sequential(
            nn.Linear(n_features, hidden),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.profile_head = nn.Linear(hidden, N_PROFILES)
        self.decline_head = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.body(x)
        return self.profile_head(h), self.decline_head(h).squeeze(-1)
