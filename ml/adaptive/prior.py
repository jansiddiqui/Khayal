"""A bandit warmed up on simulated patients, for KHAYAL_ADAPTIVE_ENGINE=bandit.

The app has too few sessions to learn from scratch, and storing learned weights would mean
committing a model file. Instead the bandit is trained in-process the first time it is
needed, on a small seeded simulated cohort (deterministic, about 3 seconds), and cached.
The backend then copies it and replays the patient's own sessions of the game on top
(`app.services.adaptive`), so every decision depends only on the database and this seed.
"""

import copy
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np

from ml.adaptive.bandit import SafeBandit, make_engine
from ml.decline.simulator import PROFILES, SimOptions, simulate_patient

# The bandit the app uses for KHAYAL_ADAPTIVE_ENGINE=bandit (NumPy only; no PyTorch in the backend).
APP_BANDIT = "thompson"
PRIOR_PATIENTS_PER_PROFILE = 8
PRIOR_DAYS = 90
PRIOR_SEED = 2026
PRIOR_FRUSTRATION = 0.6


@lru_cache(maxsize=4)
def _trained(name: str) -> SafeBandit:
    engine = make_engine(name, seed=PRIOR_SEED)
    if not isinstance(engine, SafeBandit):
        raise ValueError(f"{name} is not a bandit")
    options = SimOptions(engine, frustration=PRIOR_FRUSTRATION)
    rng = np.random.default_rng(PRIOR_SEED)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for k in range(PRIOR_PATIENTS_PER_PROFILE):
        for profile in PROFILES:
            simulate_patient(k, profile, PRIOR_DAYS, rng, start, options=options)
    return engine


def warmed_bandit(name: str = APP_BANDIT, seed: int = 0) -> SafeBandit:
    """A fresh copy of the simulator-trained bandit; `seed` drives its own sampling."""
    engine = copy.deepcopy(_trained(name))
    engine.rng = np.random.default_rng(seed)
    return engine
