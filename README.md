# Khayal (خیال)

AI-based cognitive gaming and memory assistance platform for elderly dementia patients.
CSE471 Deep Learning — Satyam Kumar, Jan Mohammad.

`CLAUDE.md` is the build spec. Current status: **Milestone 2 — Auth + roles**.

## Layout

```
frontend/   React 18 + Vite + TypeScript + Tailwind (patient + caregiver UI)
backend/    FastAPI app (routes are thin; logic lives in services/ and ml/)
ml/         Plain-Python AI modules imported by backend/app/services
data/       SQLite DB and uploads (gitignored, created on demand)
```

## Prerequisites

- Python 3.11+ (3.12 is fine)
- Node.js 20+

## Backend

One-time setup (from the repo root, Windows PowerShell shown; use `source .venv/bin/activate` on macOS/Linux):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Load the demo accounts (safe to re-run):

```powershell
python -m app.seed
```

Run (from `backend/`, venv active):

```powershell
python -m app
```

Demo accounts created by the seed (password `khayal-demo` for all):

| Role | Email |
|---|---|
| Caregiver | `caregiver@khayal.test` (linked to all three patients) |
| Patient | `kamala@khayal.test`, `rahim@khayal.test`, `shanti@khayal.test` |

The API is at http://127.0.0.1:8000 — health check: http://127.0.0.1:8000/api/health, docs: http://127.0.0.1:8000/docs.

Config is read from environment variables (see `backend/app/config.py`): `KHAYAL_DATABASE_URL` (SQLite by default; set a PostgreSQL URL to switch), `KHAYAL_DATA_DIR`, `KHAYAL_CORS_ORIGINS`, `KHAYAL_JWT_SECRET` (set this anywhere other than local dev), `KHAYAL_TOKEN_MINUTES`.

Tables are created on startup (`create_all`); there are no migrations yet, so delete `data/khayal.db` and re-seed after a model change.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to the backend on port 8000.

Routes so far:

- `/login`, `/register` — sign in or create an account; `/` sends you to your role's home.
- `/patient` — patient Home: Next reminder card + Play a game / Today's reminders / Who is this? (patients only).
- `/patient/games`, `/patient/reminders`, `/patient/who-is-this`, `/patient/voice` — placeholders for later milestones.
- `/caregiver` — linked patients and a form to link a patient by account email (caregivers only).

## API so far

- `POST /api/auth/register`, `POST /api/auth/login` → `{access_token, token_type, user}`; `GET /api/auth/me`. Send `Authorization: Bearer <token>`.
- `GET /api/patients` (caregiver's linked patients), `POST /api/patients/link` `{patient_email}` (caregiver only).

## Tests

Backend + ML (from the repo root, with the backend venv active):

```powershell
pytest
```

Frontend:

```powershell
cd frontend
npm test          # Vitest + React Testing Library
npm run typecheck # tsc strict
```

## Conventions

- All patient-facing text lives in `frontend/src/copy.ts`.
- Patient screens use `Layout` (top bar with Home + Read aloud, same on every screen) and `BigButton` (≥64px tall, full width on mobile, icon + words).
- Patient-scoped backend routes must call `ensure_patient_access` (`backend/app/deps.py`).
- Never commit `data/`, `.env`, uploads or model weights.
