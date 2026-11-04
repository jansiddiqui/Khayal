# Khayal (خیال)

AI-based cognitive gaming and memory assistance platform for elderly dementia patients.
CSE471 Deep Learning — Satyam Kumar, Jan Mohammad.

`CLAUDE.md` is the build spec. Current status: **Milestone 1 — Skeleton**.

## Layout

```
frontend/   React 18 + Vite + TypeScript + Tailwind (patient + caregiver UI)
backend/    FastAPI app (routes are thin; logic lives in services/ and ml/)
ml/         Plain-Python AI modules imported by backend/app/services
data/       SQLite DB and uploads (gitignored, created on demand)
```

## Prerequisites

- Python 3.11+ (developed against 3.11; 3.12 also works)
- Node.js 20+

## Backend

One-time setup (from the repo root, Windows PowerShell shown; use `source .venv/bin/activate` on macOS/Linux):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Run (from `backend/`, venv active):

```powershell
python -m app
```

The API is at http://127.0.0.1:8000 — health check: http://127.0.0.1:8000/api/health, docs: http://127.0.0.1:8000/docs.

Config is read from environment variables (see `backend/app/config.py`): `KHAYAL_DATABASE_URL` (SQLite by default; set a PostgreSQL URL to switch), `KHAYAL_DATA_DIR`, `KHAYAL_CORS_ORIGINS`.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to the backend on port 8000.

Routes so far: `/` (temporary role picker until login exists), `/patient` (patient home), `/patient/games`, `/patient/reminders`, `/patient/who-is-this`, `/patient/voice` (placeholders), `/caregiver` (dashboard showing backend status).

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
- Patient screens use `Layout` (big Home button, top-left) and `BigButton` (≥64px tall, full width on mobile, icon + words).
- Never commit `data/`, `.env`, uploads or model weights.
