"""App configuration, read from environment variables only, with local-development defaults.

Production (KHAYAL_ENV=production) refuses to start without a real JWT secret. The public
demo (KHAYAL_DEMO_MODE=1) adds the demo banner, "Try the demo", smaller upload limits and
the 7-day clean-up of demo accounts. See docs/DEPLOY-VOROA.md for every variable.
"""

import logging
import os
from collections.abc import Mapping
from datetime import timedelta, timezone, tzinfo
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

REPO_ROOT = Path(__file__).resolve().parents[2]


def _flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


ENV = os.getenv("KHAYAL_ENV", "development").strip().lower()
if ENV not in ("development", "production", "test"):
    raise ValueError(f"Unknown KHAYAL_ENV: {ENV} (use development or production)")
IS_PRODUCTION = ENV == "production"

DATA_DIR = Path(os.getenv("KHAYAL_DATA_DIR", REPO_ROOT / "data"))
# Private files (family photos, voice recordings) on local disk. Never served as static
# files; only through authenticated routes.
UPLOAD_DIR = DATA_DIR / "uploads"


def normalize_database_url(url: str) -> str:
    """Hosting providers hand out postgres://USER:PASS@HOST:PORT/DB?sslmode=require.
    SQLAlchemy needs the driver named: postgresql+psycopg://... (query string kept as is)."""
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


# SQLite in data/ for development; set a Postgres URL in production. KHAYAL_DATABASE_URL
# wins; DATABASE_URL (the name hosting dashboards suggest) is the fallback.
def database_url_from(env: Mapping[str, str]) -> str:
    return normalize_database_url(
        env.get("KHAYAL_DATABASE_URL", "").strip()
        or env.get("DATABASE_URL", "").strip()
        or f"sqlite:///{(DATA_DIR / 'khayal.db').as_posix()}"
    )


DATABASE_URL = database_url_from(os.environ)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

# Postgres connection pool: small, because the free database allows few connections.
DB_POOL_SIZE = int(os.getenv("KHAYAL_DB_POOL_SIZE", "3"))
DB_MAX_OVERFLOW = int(os.getenv("KHAYAL_DB_MAX_OVERFLOW", "2"))

_DEV_JWT_SECRET = "dev-only-insecure-secret-change-me"
JWT_SECRET = os.getenv("KHAYAL_JWT_SECRET", "").strip() or _DEV_JWT_SECRET
if IS_PRODUCTION and (JWT_SECRET == _DEV_JWT_SECRET or len(JWT_SECRET) < 32):
    raise RuntimeError(
        "KHAYAL_JWT_SECRET must be set to a random value of at least 32 characters in production "
        '(for example: python -c "import secrets; print(secrets.token_urlsafe(48))").'
    )
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("KHAYAL_TOKEN_MINUTES", str(60 * 24 * 7)))

# Device pairing for patients (CLAUDE.md section 4): a 6-digit code from the caregiver,
# valid this long; a paired device then stays signed in for PAIRED_DEVICE_DAYS.
PAIRING_CODE_MINUTES = 10
PAIRED_DEVICE_DAYS = 90
# Decline alert rule (ml/decline/zscore.py): "persistence" (rule B, default), "any" (A),
# "two_games" (C), "index" (D) or "persistence_or_index" (E). Compared in ml.decline.evaluate.
ALERT_RULE = os.getenv("KHAYAL_ALERT_RULE", "persistence")
if ALERT_RULE not in ("any", "persistence", "two_games", "index", "persistence_or_index"):
    raise ValueError(f"Unknown KHAYAL_ALERT_RULE: {ALERT_RULE}")

# Adaptive difficulty (ml/adaptive): "rule" (rule_based.next_level, the default) or "bandit"
# (a simulator-warmed linear Thompson-sampling bandit with the rule engine as fallback;
# research, Round 2 batch 1, ml/results/adaptive_eval.md). Production stays on "rule".
ADAPTIVE_ENGINE = os.getenv("KHAYAL_ADAPTIVE_ENGINE", "rule").strip().lower()
if ADAPTIVE_ENGINE not in ("rule", "bandit"):
    raise ValueError(f"Unknown KHAYAL_ADAPTIVE_ENGINE: {ADAPTIVE_ENGINE} (use rule or bandit)")

# Wrong codes allowed per client address in PAIRING_CODE_MINUTES before pairing pauses.
PAIRING_MAX_FAILURES = 10


def _local_timezone() -> tzinfo:
    """Everyone uses one local clock for "today" (reminders, today's games).

    KHAYAL_TIMEZONE (an IANA name such as Asia/Kolkata) wins; otherwise a fixed
    KHAYAL_UTC_OFFSET_MINUTES (default 330 = IST). If the IANA database is missing on the
    machine (e.g. Windows without tzdata), the fixed offset is used instead.
    """
    offset = timezone(timedelta(minutes=int(os.getenv("KHAYAL_UTC_OFFSET_MINUTES", "330"))))
    name = os.getenv("KHAYAL_TIMEZONE", "").strip()
    if not name:
        return offset
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        logging.getLogger("khayal").warning("Time zone %s not found; using UTC offset %s", name, offset)
        return offset


LOCAL_TIMEZONE = _local_timezone()

# How often the server checks every patient for missed reminders and removes expired demo
# accounts (0 turns the repeating loop off; it still runs once at startup).
REMINDER_CHECK_MINUTES = float(os.getenv("KHAYAL_REMINDER_CHECK_MINUTES", "15"))

# The frontend's address(es), comma-separated, e.g. https://khayal-web.example.app
CORS_ORIGINS = [o.strip().rstrip("/") for o in os.getenv("KHAYAL_CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

# Secret for POST /api/internal/tick (an optional external cron). Unset = the route is off.
TICK_SECRET = os.getenv("KHAYAL_TICK_SECRET", "").strip() or None

# Where uploaded photos and recordings live: "disk" (data/uploads) or "db" (a database
# table, for hosts without persistent disk or object storage). Default: db in production.
STORAGE_BACKEND = os.getenv("KHAYAL_STORAGE", "db" if IS_PRODUCTION else "disk").strip().lower()
if STORAGE_BACKEND not in ("disk", "db"):
    raise ValueError(f"Unknown KHAYAL_STORAGE: {STORAGE_BACKEND} (use disk or db)")

# Public demo (CLAUDE.md is about the prototype; this is only for the hosted demo).
DEMO_MODE = _flag("KHAYAL_DEMO_MODE")
# Demo accounts (and every account created while in demo mode) are removed after this long.
DEMO_ACCOUNT_DAYS = int(os.getenv("KHAYAL_DEMO_ACCOUNT_DAYS", "7"))
# At most this many demo caregivers at once; the oldest are removed first (the free database is 1 GB).
DEMO_MAX_CAREGIVERS = int(os.getenv("KHAYAL_DEMO_MAX_CAREGIVERS", "200"))

# Shown on the landing page's footer and privacy text, e.g. hello@khayal.example. Unset = no address shown.
CONTACT_EMAIL = os.getenv("KHAYAL_CONTACT_EMAIL", "").strip() or None

# Real pilot (CLAUDE.md section 11, Phase B).
# Admins: these emails may create an account without an invite and see the admin page.
ADMIN_EMAILS = frozenset(e.strip().lower() for e in os.getenv("KHAYAL_ADMIN_EMAILS", "").split(",") if e.strip())
# Sign-up invite links and family share links stay valid this long; reset links for RESET_HOURS.
INVITE_DAYS = 14
SHARE_DAYS = 14
RESET_HOURS = 48
PASSWORD_MIN_LENGTH = 10
# Version of the privacy policy and terms that consents are recorded against (frontend/src/pages/landing/legal.ts).
POLICY_VERSION = "2026-11-draft-1"
