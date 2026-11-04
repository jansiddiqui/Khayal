"""App configuration, read from environment variables with local-dev defaults."""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("KHAYAL_DATA_DIR", REPO_ROOT / "data"))
# Private files (family photos). Never served as static files; only through authenticated routes.
UPLOAD_DIR = DATA_DIR / "uploads"

# Switch to PostgreSQL by setting e.g. postgresql+psycopg://user:pass@host/khayal
DATABASE_URL = os.getenv("KHAYAL_DATABASE_URL", f"sqlite:///{(DATA_DIR / 'khayal.db').as_posix()}")

JWT_SECRET = os.getenv("KHAYAL_JWT_SECRET", "dev-only-insecure-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("KHAYAL_TOKEN_MINUTES", str(60 * 24 * 7)))

# Everyone uses one local clock for "today" (reminders, today's games). Default: IST (UTC+5:30).
APP_UTC_OFFSET_MINUTES = int(os.getenv("KHAYAL_UTC_OFFSET_MINUTES", "330"))

# How often the server checks every patient for missed reminders (0 turns the background check off).
REMINDER_CHECK_MINUTES = float(os.getenv("KHAYAL_REMINDER_CHECK_MINUTES", "15"))

CORS_ORIGINS = os.getenv("KHAYAL_CORS_ORIGINS", "http://localhost:5173").split(",")
