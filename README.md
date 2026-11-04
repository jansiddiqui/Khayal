# Khayal (خیال)

AI-based cognitive gaming and memory assistance platform for elderly dementia patients.
CSE471 Deep Learning — Satyam Kumar, Jan Mohammad.

`CLAUDE.md` is the build spec. Current status: **Milestone 4 — Remaining games**.

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
- `/patient/games` — games list; `/patient/games/<game_type>` plays a 5-round session (`memory_match`, `sequence_recall`, `word_recall`, `daily_orientation`, `reaction_tap`).
- `/patient/reminders`, `/patient/who-is-this`, `/patient/voice` — placeholders for later milestones.
- `/caregiver` — linked patients and a form to link a patient by account email (caregivers only).
- `/caregiver/patients/:id` — the patient's home city (for Daily Orientation), current level per game, and session history including stopped-early sessions.

## API so far

- `POST /api/auth/register`, `POST /api/auth/login` → `{access_token, token_type, user}`; `GET /api/auth/me`. Send `Authorization: Bearer <token>`.
- `GET /api/patients` (caregiver's linked patients), `POST /api/patients/link` `{patient_email}`, `PATCH /api/patients/{id}` `{city}` (caregiver only, linked patients).
- `GET /api/games/{game_type}/level` (patient) — current level, 2 for a new player.
- `POST /api/sessions` (patient) `{game_type, started_at, ended_at, rounds: [{correct, reaction_ms|null, hint_used}], completed}` → stored session, `new_level`, `level_change` (`up`/`down`/`same`). `completed` must be true with exactly 5 rounds and false with fewer.
- `GET /api/patients/{id}/sessions?game_type=` — the patient themself or a linked caregiver.

## Games and the adaptive engine

- One session = 5 rounds; the level (1–10, start 2) changes at most once, at the end of a completed session, using `ml/adaptive/rule_based.py` (≥85% → up, <55% → down). The server uses its stored level, not one sent by the client.
- **Stopped early:** leaving mid-game (Home button, closing the page) saves the rounds played with `completed=false`. These never change the level and show as "Stopped early (3/5 rounds)" for the caregiver.
- **Show me again:** one hint per round where the game has one. Using it sets `hint_used=true`; the round can still be correct.
- **Memory Match:** one round = one full board of everyday Indian pictures (chai, roti, mango, auto-rickshaw…). Pairs grow from 2 to 10 with level and the opening preview gets shorter. Correct = finished with mistakes ≤ number of pairs; reaction time = average time per pair found.
- **Memory Match hint:** every card is shown again for the preview time.
- **Sequence Recall:** one round = one sequence of coloured, labelled tiles (length 2 → 7). Correct = the whole sequence repeated in order; reaction time = end of the latest playback to the last tap. Hint: the sequence plays once more and the patient starts over.
- **Word Recall:** 3 → 8 everyday words (Tea, Bus, Temple…) shown one at a time for 2 s, a 15 s star-tapping distraction (not scored), then pick the seen words from a list that has as many new words. Correct = (found − wrong) / shown ≥ 0.8; reaction time = list shown → Done. Hint: first letter of each word not yet picked.
- **Daily Orientation** (patients see "About Today"): day of week, month, season (Mar–May Summer, Jun–Sep Monsoon, Oct–Feb Winter), time of day (5–12 Morning, 12–17 Afternoon, otherwise Evening) and home city, or the year if no city is set. No levels (stored at level 1, never adapted), no hint. Every answer gets a kind reply with the right answer ("It's Wednesday today.").
- **Reaction Tap:** one round = one trial. After a random 2–5 s wait the circle turns green; a tap within 3 s is correct and the reaction time is recorded. From level 4 some circles are red (10% rising to 40% at level 10): not tapping is correct. Tapping too early shows "Wait for green" and the trial repeats without counting. Rounds with no tap store no reaction time (`null`).
- Patients never see their level. The end screen says "Great work! Next time will be a little more interesting" after a level-up, otherwise "Nice playing! Let's keep it comfortable". Caregivers see levels on the patient page.

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

## Known limitations (prototype)

- **Linking by email without confirmation:** a caregiver links a patient just by typing the patient's account email; the patient is not asked to approve.
- **No caregiver verification:** anyone can register as a caregiver/doctor; there is no identity or credential check.
- **No database migrations:** tables are created with `create_all` on startup. After a model change, delete `data/khayal.db` and re-run the seed.
