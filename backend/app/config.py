"""App configuration, read from environment variables with local-dev defaults."""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("KHAYAL_DATA_DIR", REPO_ROOT / "data"))

# Switch to PostgreSQL by setting e.g. postgresql+psycopg://user:pass@host/khayal
DATABASE_URL = os.getenv("KHAYAL_DATABASE_URL", f"sqlite:///{(DATA_DIR / 'khayal.db').as_posix()}")

CORS_ORIGINS = os.getenv("KHAYAL_CORS_ORIGINS", "http://localhost:5173").split(",")
