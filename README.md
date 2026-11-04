# Khayal (خیال)

AI-based cognitive gaming and memory assistance platform for elderly dementia patients.
CSE471 Deep Learning — Satyam Kumar, Jan Mohammad.

`CLAUDE.md` is the build spec. Current status: **Milestone 6 — Family + Who Is This?**.

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

Create or update the database tables (run this after every `git pull`):

```powershell
alembic upgrade head
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
| Patient | `kamala@khayal.test` (has demo reminders and 3 demo family members with placeholder pictures), `rahim@khayal.test`, `shanti@khayal.test` |

The API is at http://127.0.0.1:8000 — health check: http://127.0.0.1:8000/api/health, docs: http://127.0.0.1:8000/docs.

Config is read from environment variables (see `backend/app/config.py`): `KHAYAL_DATABASE_URL` (SQLite by default; set a PostgreSQL URL to switch), `KHAYAL_DATA_DIR`, `KHAYAL_CORS_ORIGINS`, `KHAYAL_JWT_SECRET` (set this anywhere other than local dev), `KHAYAL_TOKEN_MINUTES`, `KHAYAL_UTC_OFFSET_MINUTES` (the app's local clock for "today"; default 330 = IST), `KHAYAL_REMINDER_CHECK_MINUTES` (background missed-reminder check interval; default 15, 0 = off).

The schema is managed by Alembic (`backend/migrations/`). The server refuses to start if the database is not at the latest migration and tells you to run `alembic upgrade head`. If you have a `data/khayal.db` created before Alembic was added (Milestone 5), run `alembic stamp 0001` once, then `alembic upgrade head`; your data is kept.

Making a model change: edit `backend/app/models.py`, then from `backend/` run `alembic revision --autogenerate -m "what changed"`, review the generated file, and `alembic upgrade head`. `tests/test_migrations.py` fails if the migrations and models disagree.

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
- `/patient/games` — today's 3 games (see CLAUDE.md section 7); `/patient/games/<game_type>` plays a 5-round session (`memory_match`, `sequence_recall`, `word_recall`, `daily_orientation`, `reaction_tap`).
- `/patient/reminders` — today's reminders with big Done buttons.
- `/patient/who-is-this` — family photo grid with name + relation; tapping a photo shows it big and reads aloud who it is.
- `/patient/voice` — placeholder for Milestone 8.
- `/caregiver` — linked patients and a form to link a patient by account email (caregivers only).
- `/caregiver/patients/:id/family` — add, edit and delete people (name, relation, note) and their photos.
- `/caregiver/patients/:id/reminders` — add, edit, pause and delete the patient's reminders; today's status for each.
- `/caregiver/patients/:id` — alerts (with Acknowledge), the patient's home city (for Daily Orientation), pinned games, current level per game, and session history including stopped-early sessions.

## API so far

- `POST /api/auth/register`, `POST /api/auth/login` → `{access_token, token_type, user}`; `GET /api/auth/me`. Send `Authorization: Bearer <token>`.
- `GET /api/patients` (caregiver's linked patients), `POST /api/patients/link` `{patient_email}`, `PATCH /api/patients/{id}` `{city?, pinned_games?}` (caregiver only, linked patients).
- `GET /api/me/games/today` (patient) — today's 3 games with `done_today`.
- `GET/POST /api/patients/{id}/reminders`, `PUT/DELETE /api/patients/{id}/reminders/{reminder_id}` (create/edit/delete: linked caregiver) — `{title, type, time_of_day "HH:MM", days_of_week [0=Mon..6=Sun], active}`.
- `POST /api/reminders/{id}/log` `{status: "done"}` — marks today's occurrence done (the patient or a linked caregiver; recorded as `marked_by`).
- `GET /api/patients/{id}/reminders/adherence?days=7` — `{done_by_patient, done_by_caregiver, missed, rate}`.
- `GET /api/me/reminders/today` (patient) — today's reminders with `status` (`pending`/`done`/`missed`) and `due`.
- `GET /api/patients/{id}/alerts`, `POST /api/alerts/{id}/ack` (caregiver).
- `GET/POST /api/patients/{id}/family`, `PUT/DELETE /api/patients/{id}/family/{member_id}` — people `{name, relation, note}` with `photos: [{id, url}]` (create/edit/delete: linked caregiver).
- `POST /api/patients/{id}/family/{member_id}/photos` — the request **body is the image itself** with `Content-Type: image/jpeg` or `image/png` (no multipart form). `DELETE …/photos/{photo_id}`.
- `GET /api/patients/{id}/family/{member_id}/photos/{photo_id}` — the photo, only for the patient and linked caregivers.
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

## Reminders

- A reminder repeats on chosen weekdays at a local time. The patient's Today screen shows a Done button for reminders whose time has come (at most 3 at once), lists later ones without buttons, and lists finished ones with ✓ Done. Wording stays positive: an overdue reminder says "Let's do this now."
- **Missed:** a background task (started with the server) checks every patient every 15 minutes, and the same check also runs whenever reminders or alerts are opened. Any occurrence still not done 2 hours after its time is logged as missed. Occurrences from before a reminder was created are never counted. Marking a reminder done later the same day replaces "missed" with "done".
- **Alert:** when 3 or more reminders were missed in the last 48 hours, a `warning` alert is raised for the caregiver, at most once per 48 hours.
- The patient Home "Next reminder" card shows something due now first, otherwise the next one later today.
- **Who marked it done:** each log records `marked_by` (`patient` or `caregiver`). The caregiver page shows "Done (by caregiver)" and an adherence rate over the last 7 days that counts only reminders the patient marked done themself.

## Family photos

- JPG or PNG only, at most 5 MB, at most 5 photos per person. The server checks the actual image (not just the file name), re-encodes it as JPEG at most 800 px on the long side, and drops EXIF data such as GPS location.
- Stored under `data/uploads/family/{patient_id}/` (gitignored). These are private family photos: they are **never** served as static files. The only way to get one is the authenticated photo route, and the frontend shows them from in-memory blobs.
- **Who is this?** is help, not a test: no scoring. About Today's last question becomes "Who is this?" (one photo, 3 names, a kind reply) once 3 or more people have photos; otherwise it asks the city, or the year if no city is set.

## Known limitations (prototype)

- **Linking by email without confirmation:** a caregiver links a patient just by typing the patient's account email; the patient is not asked to approve.
- **No caregiver verification:** anyone can register as a caregiver/doctor; there is no identity or credential check.
- **One clock for everyone:** "today" (today's games, reminders) uses a single app-wide UTC offset, not each patient's own time zone.
