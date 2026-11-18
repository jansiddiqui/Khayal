# Khayal (خیال)

AI-based cognitive gaming and memory assistance platform for elderly dementia patients.
CSE471 Deep Learning — Satyam Kumar, Jan Mohammad.

`CLAUDE.md` is the build spec. Current status: **Milestone 7 — Decline tracking + dashboard**.

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

Add 90 days of simulated play so the dashboard charts have data (Rahim = healthy, Kamala = MCI, Shanti = moderate; skipped for anyone who already has history before today):

```powershell
python -m app.seed --demo-history
```

To regenerate it (e.g. after changing the decline rule), add `--reset`. This removes the demo patients' game sessions, levels and decline alerts and their reminder logs before today, then reloads them. Back up `data/khayal.db` first:

```powershell
python -m app.seed --demo-history --reset
```

The demo family photos are plain coloured silhouettes, with no names or initials. To replace older demo photos with them:

```powershell
python -m app.seed --refresh-demo-photos
```

Run (from `backend/`, venv active):

```powershell
python -m app
```

Demo accounts created by the seed (password `khayal-demo` for all):

| Role | Email |
|---|---|
| Caregiver | `caregiver@khayal.test` (linked to all three patients) |
| Patient | `kamala@khayal.test` (has demo reminders and 3 demo family members with silhouette placeholder photos), `rahim@khayal.test`, `shanti@khayal.test` |

The API is at http://127.0.0.1:8000 — health check: http://127.0.0.1:8000/api/health, docs: http://127.0.0.1:8000/docs.

Config is read from environment variables only (see `backend/app/config.py`):
- `KHAYAL_ENV`: `development` (default) or `production` (refuses to start without `KHAYAL_JWT_SECRET` of 32+ characters; hides `/docs`).
- `KHAYAL_DATABASE_URL` (or `DATABASE_URL` as a fallback): SQLite in `data/` by default; a `postgres://…?sslmode=require` URL switches to PostgreSQL (psycopg, small pool).
- `KHAYAL_STORAGE`: where photos and recordings live, `disk` (`data/uploads`, development default) or `db` (a database table, production default).
- `KHAYAL_JWT_SECRET`, `KHAYAL_TOKEN_MINUTES`, `KHAYAL_CORS_ORIGINS` (comma-separated frontend addresses), `KHAYAL_DATA_DIR`.
- `KHAYAL_TIMEZONE` (e.g. `Asia/Kolkata`) or `KHAYAL_UTC_OFFSET_MINUTES` (default 330 = IST): the app's clock for "today".
- `KHAYAL_REMINDER_CHECK_MINUTES`: housekeeping interval (missed reminders, demo clean-up); default 15, 0 = only at startup.
- Public demo only: `KHAYAL_DEMO_MODE=1`, `KHAYAL_TICK_SECRET`, `KHAYAL_DEMO_ACCOUNT_DAYS` (7), `KHAYAL_DEMO_MAX_CAREGIVERS` (200). See [Public demo](#public-demo-voroa).

The schema is managed by Alembic (`backend/migrations/`). The server refuses to start if the database is not at the latest migration and tells you to run `alembic upgrade head`. If you have a `data/khayal.db` created before Alembic was added (Milestone 5), run `alembic stamp 0001` once, then `alembic upgrade head`; your data is kept.

Making a model change: edit `backend/app/models.py`, then from `backend/` run `alembic revision --autogenerate -m "what changed"`, review the generated file, and `alembic upgrade head`. `tests/test_migrations.py` fails if the migrations and models disagree.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to the backend on port 8000.

### Testing on a phone (local HTTPS, optional)

Browsers only allow the microphone (the voice task) on secure pages, so a phone on your Wi-Fi needs HTTPS:

```powershell
cd frontend
npm run dev:https
```

1. Start the backend as usual; the HTTPS dev server still proxies `/api` to it.
2. Vite prints a `Network:` address such as `https://192.168.1.20:5173/`. Open it on the phone, which must be on the same Wi-Fi.
3. The certificate is self-signed (`@vitejs/plugin-basic-ssl`), so the phone warns once. Choose "Advanced" → "Continue"; it is your own computer.
4. Windows may ask to let Node.js through the firewall on private networks. Allow it, or the phone can't connect.
5. Pair the phone as a patient with a code from the caregiver page (see Device pairing).

Plain `npm run dev` stays HTTP on this computer only.

Routes so far:

- `/login`, `/register` — sign in or create an account; `/` sends you to your role's home.
- `/patient` — patient Home: a compact Next reminder card + Play a game (with today's progress, "2 of 3 done today") / Today's reminders / Who is this? (patients only). Fits a 375 × 667 phone without scrolling.
- `/patient/games` — today's 3 games (see CLAUDE.md section 7); `/patient/games/<game_type>` plays a 5-round session (`memory_match`, `sequence_recall`, `word_recall`, `daily_orientation`, `reaction_tap`).
- `/patient/reminders` — today's reminders with big Done buttons.
- `/patient/who-is-this` — family photo grid with name + relation; tapping a photo shows it big and reads aloud who it is.
- `/patient/voice` — "Tell me about a picture", the weekly voice task (see below).
- `/caregiver` — linked patients with a status dot (Stable / Watch / Declining) from the overall cognitive index, and a form to link a patient by account email (caregivers only).
- `/caregiver/patients/:id/family` — add, edit and delete people (name, relation, note) and their photos.
- `/caregiver/patients/:id/reminders` — add, edit, pause and delete the patient's reminders; today's status for each.
- `/caregiver/patients/:id` — a summary card (overall status, latest new alert, reminders done by the patient, last played), alerts with plain explanations (Acknowledge), then collapsible sections: the overall cognitive index chart with secondary-signal tiles; one card per game (the 5-session average as a bold line, single sessions as faint dots, baseline dashed, ±1.5 std band), open only for games on Watch or Declining; levels and session history including stopped-early sessions; settings (pair a device, home city, pinned games).

## API so far

- `POST /api/auth/register`, `POST /api/auth/login` → `{access_token, token_type, user}`; `GET /api/auth/me`. Send `Authorization: Bearer <token>`.
- `GET /api/patients` (caregiver's linked patients), `POST /api/patients/link` `{patient_email}`, `PATCH /api/patients/{id}` `{city?, pinned_games?}` (caregiver only, linked patients).
- `GET /api/me/games/today` (patient) — today's 3 games with `done_today`.
- `GET/POST /api/patients/{id}/reminders`, `PUT/DELETE /api/patients/{id}/reminders/{reminder_id}` (create/edit/delete: linked caregiver) — `{title, type, time_of_day "HH:MM", days_of_week [0=Mon..6=Sun], active}`.
- `POST /api/reminders/{id}/log` `{status: "done"}` — marks today's occurrence done (the patient or a linked caregiver; recorded as `marked_by`).
- `GET /api/patients/{id}/reminders/adherence?days=7` — `{done_by_patient, done_by_caregiver, missed, rate}`.
- `GET /api/me/reminders/today` (patient) — today's reminders with `status` (`pending`/`done`/`missed`) and `due`.
- `GET /api/patients/{id}/alerts`, `POST /api/alerts/{id}/ack` (caregiver).
- `GET /api/patients/{id}/trend?game_type=` — composite, rolling mean and z per completed session for each game, baselines, status and explanation, plus the overall cognitive index and its history. `GET /api/patients` includes `cognitive_index` and `cognitive_status`.
- `GET /api/patients/{id}/signals` — last 14 days: stopped-early rate, hint rate, reminder adherence (patient-marked).
- `GET/POST /api/patients/{id}/family`, `PUT/DELETE /api/patients/{id}/family/{member_id}` — people `{name, relation, note}` with `photos: [{id, url}]` (create/edit/delete: linked caregiver).
- `POST /api/patients/{id}/family/{member_id}/photos` — the request **body is the image itself** with `Content-Type: image/jpeg` or `image/png` (no multipart form). `DELETE …/photos/{photo_id}`.
- `GET /api/patients/{id}/family/{member_id}/photos/{photo_id}` — the photo, only for the patient and linked caregivers.
- `GET /api/games/{game_type}/level` (patient) — current level, 2 for a new player.
- `POST /api/sessions` (patient) `{game_type, started_at, ended_at, rounds: [{correct, reaction_ms|null, hint_used}], completed}` → stored session, `new_level`, `level_change` (`up`/`down`/`same`). `completed` must be true with exactly 5 rounds and false with fewer.
- `GET /api/patients/{id}/sessions?game_type=` — the patient themself or a linked caregiver.

## Games and the adaptive engine

No hidden timers (CLAUDE.md section 7): Memory Match cards stay up until "I've looked — hide the cards", Word Recall words stay until "Next word", and the star distraction ends after 5 stars. Each round stores `study_ms`, the time spent looking before playing. During a round the patient screen switches to a compact play mode that fits a 375 × 812 phone without scrolling. Before and after screenshots are in `docs/ui-audit/batch1/`.

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

**Read aloud** (toggle on every patient screen): each question is spoken with its choices. When it is on, a "Say it again" button sits next to the question in every game and on the Who is this? photo. On Remember the Words' pick list it shares the row with "Show me again", so all 12 words and Done still fit on a phone. Reaction Tap's red circle is a rounded square with a hand icon and "Don't tap", so it never relies on colour alone. Screenshots: `docs/ui-audit/batch4/`.

## Tests

Backend + ML (from the repo root, with the backend venv active):

```powershell
pytest
```

The backend tests use in-memory SQLite. To run them on PostgreSQL as well, set
`KHAYAL_TEST_DATABASE_URL` and `KHAYAL_TEST_MIGRATIONS_DATABASE_URL` to two empty test
databases (see `backend/tests/conftest.py`); without them the two Postgres migration tests are skipped.

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

## Device pairing (patient sign-in)

Patients never type an email or password:

1. On the caregiver's patient page, under Settings, "Pair a device" shows a 6-digit code. It is valid for 10 minutes and works once; a new code replaces the old one.
2. On the patient's phone or tablet, open Khayal. A device that isn't signed in starts at "Set up this device". Type the code.
3. The device stays signed in as that patient for 90 days.

- **Caregivers:** they still sign in with email ("Family member or doctor? Sign in with email").
- **Wrong codes:** after 10 wrong codes from one address within 10 minutes, pairing pauses.
- **Storage:** codes are stored only as a keyed hash.
- **API:** `POST /api/patients/{id}/pairing-code` (linked caregiver), `POST /api/auth/pair` `{code}`.

## Reminders

- **Schedules (migration 0010):** each reminder repeats **Just once** (`repeat=once`, on `on_date`), **Every day** (`daily`) or **On some days** (`weekly_days`, on `days_of_week`), at a local time. Repeating ones have a start date (default today) and an optional end date ("Until I stop it" by default). Dates are days on the app clock (`KHAYAL_UTC_OFFSET_MINUTES`, IST), also in the caregiver's form, whatever the browser's own time zone. The form shows only the fields for the chosen repeat; Appointment starts as "Just once", Medicine as "Every day". A one-time reminder can't be set for a time that has passed. Existing reminders became "Every day" (all 7 days) or "On some days", with no end date.
- The caregiver list shows a plain summary ("Once · Tue 18 Nov · 8:00 PM", "Every day · 9:00 AM", "Mon, Wed, Fri · 6:00 PM · until 30 Nov"). Once a one-time reminder's day or an end date has passed, it moves to **Past reminders**: kept with its done/missed history until the caregiver deletes it.
- A reminder appears for the patient only on the days it applies to. The patient's Today screen shows a Done button for reminders whose time has come (at most 3 at once), lists later ones without buttons, and lists finished ones with ✓ Done. Wording stays positive: an overdue reminder says "Let's do this now."
- **Missed:** a background task (started with the server) checks every patient every 15 minutes, and the same check also runs whenever reminders or alerts are opened. Any occurrence still not done 2 hours after its time is logged as missed. Occurrences from before a reminder was created are never counted. Marking a reminder done later the same day replaces "missed" with "done".
- **Alert:** when 3 or more reminders were missed in the last 48 hours, a `warning` alert is raised for the caregiver, at most once per 48 hours.
- The patient Home "Next reminder" card shows something due now first, otherwise the next one later today.
- **Who marked it done:** each log records `marked_by` (`patient` or `caregiver`). The caregiver page shows "Done (by caregiver)" and an adherence rate over the last 7 days that counts only reminders the patient marked done themself.

## Family photos

- JPG or PNG only, at most 5 MB, at most 5 photos per person. The server checks the actual image (not just the file name), re-encodes it as JPEG at most 800 px on the long side, and drops EXIF data such as GPS location.
- **Fast on the 0.1-CPU server:** the browser shrinks each photo first (`frontend/src/api/photoResize.ts`: canvas, at most 800 px, JPEG 0.85, no metadata), so a phone photo of a few MB is sent as about 100 KB. The server still checks every photo; a JPEG that is already at most 800 px with no EXIF, comment or XMP (a small sRGB colour profile is allowed) is kept as sent, anything else is re-encoded. Upload routes read the body asynchronously and run database and image work in the thread pool (`backend/app/uploads.py`), so one upload never blocks other requests.
- Several photos can be chosen at once (up to the 5-photo limit); they upload one after another with a thumbnail, "Uploading 2 of 3 · 45%" and a progress bar. Each upload gives up after 60 s and shows the status and the server's message, with **Try again** (it carries on from the photo that failed).
- Stored under `data/uploads/family/{patient_id}/` (gitignored). These are private family photos: they are **never** served as static files. The only way to get one is the authenticated photo route, and the frontend shows them from in-memory blobs.
- **Who is this?** is help, not a test: no scoring. About Today's last question becomes "Who is this?" (one photo, 3 names, a kind reply) once 3 or more people have photos; otherwise it asks the city, or the year if no city is set.

## Decline tracking

The formula is in CLAUDE.md section 6 and the docstring of `ml/decline/zscore.py` (it goes into the paper). In short: composite = accuracy (hinted correct rounds count half) × level/10 × reaction-time ratio against the patient's own baseline, per completed session.

- **Warm-up:** each game's first 5 completed sessions are ignored (levels are still climbing from 2).
- **Baseline:** completed sessions 6–15 (also used for the reaction-time baseline). Std = max(sample std, 0.05, 0.15 × baseline mean), so a near-perfect game like About Today can't turn one bad session into an extreme z.
- Until a game has 15 completed sessions it has no z and no alerts; the chart says "Learning this patient's normal (8/15 sessions)".
- **z** = (mean of the last 5 sessions − baseline mean) / baseline std, clipped to [−4, 4] so one game can't dominate. z < −1.5 → warning, z < −2.5 → critical.
- **Alert rule (default B):** a game alerts only when its z has been below −1.5 on 3 consecutive completed sessions. Set `KHAYAL_ALERT_RULE` to choose another rule: `any` (A, any game below −1.5), `persistence` (B, default), `two_games` (C), `index` (D), `persistence_or_index` (E).
- **Alerts:** each severity at most once per 7 days per patient; a critical may follow a warning within those 7 days (escalation). The alert lists every declining game in plain words.
- **Overall cognitive index** = mean of the latest (clipped) z across games with a baseline: Stable at −0.5 or above, Watch below −0.5, Declining below −1.5.

Evaluation for the paper (simulated patients; the current settings and the first version as an ablation):

```powershell
# from the repo root, backend venv active
python -m ml.decline.evaluate --patients-per-profile 50 --seeds 5
```

It writes `ml/results/decline_eval.md` and `ml/results/decline_eval.csv`: a confusion matrix of true profile vs final status with accuracy and per-class precision/recall/F1, the detection delay for MCI and moderate patients, and the false alarm rate for healthy patients. It also compares the alert rule variants A–E (`DeclineConfig.alert_rule`: any game, persistence over 3 sessions, two games at once, index only, persistence or index; the app uses B) and draws `ml/results/decline_tradeoff.png`. The chart needs matplotlib, which only the results use:

```powershell
pip install -r ml/requirements-results.txt
```

Synthetic data (healthy / MCI / moderate, rounds played through the real adaptive engine):

```powershell
# from the repo root, backend venv active
python -m ml.decline.simulator --patients 30 --days 90 --out data/sim.csv
```

Columns: `patient_id, profile, day, game_type, level_start, level_end, rounds, correct, hints, median_rt_ms, completed, composite` (composite is empty for stopped-early sessions).

## Learning-based difficulty (research, Round 2 batch 1)

The app uses the rule engine (`ml/adaptive/rule_based.py`). `ml/adaptive/bandit.py` adds contextual bandits behind the same `next_level(current_level, recent_rounds)` interface: LinUCB and linear Thompson sampling (NumPy), and `ml/adaptive/neural.py` a small neural bandit (an ensemble of 5 MLPs, PyTorch).

- **Actions:** level −1, stay or +1.
- **Context:** success rate, trend, reaction time vs baseline, hints, errors, stopped early, days since the previous session, level.
- **Reward:** how close the next session's success rate is to 70%, minus 0.5 if it was stopped early.
- **Safety:** at most ±1 per session and levels stay in 1–10. The bandit never raises the level after a stopped-early session or a success rate of 40% or less, and never lowers it after 5/5. The rule engine decides while the bandit is unsure.

Evaluation against the rule engine (the neural bandit needs PyTorch, so run it from `ml/.venv`; install it there with `pip install -r ml/requirements-bandit.txt`):

```powershell
# from the repo root
ml\.venv\Scripts\python -m ml.adaptive.evaluate --patients-per-profile 30 --seeds 5
```

It writes `ml/results/adaptive_eval.md`, `.csv`, `adaptive_regret.png`, `adaptive_metrics.png` and `adaptive_decline.png`. The report covers time in the 60–80% zone, stopped-early rate, oscillation, regret and decline detection per engine.

`KHAYAL_ADAPTIVE_ENGINE=bandit` switches the backend to the Thompson-sampling bandit. It is trained on a small seeded simulated cohort the first time it is needed (a few seconds), then replays the patient's own sessions. The default is `rule`, and production stays on `rule`.

## Deep learning for decline detection (research, not in the app)

GRU, LSTM and an MLP baseline, trained on simulated patients and compared with the app's rule (variant B) on the same test patients. Code in `ml/dl/`, results in `ml/results/dl_decline.md`.

PyTorch stays out of the backend: it has its own environment in `ml/.venv` (gitignored).

```powershell
# from the repo root, once
python -m venv ml/.venv
ml/.venv/Scripts/python -m pip install -r ml/requirements-dl.txt

# full run: 600 patients per profile, 90 days, 5 seeds (about 2 hours on CPU)
ml/.venv/Scripts/python -m ml.dl.run

# quick check (a few minutes; numbers are not the reported ones)
ml/.venv/Scripts/python -m ml.dl.run --per-profile 60 --seeds 2 --epochs 5 --out data/dl-quick --cache data/dl-quick

# rewrite the report from the saved models and predictions (no retraining)
ml/.venv/Scripts/python -m ml.dl.run

# tests for this code (the torch ones are skipped in the backend environment)
ml/.venv/Scripts/python -m pytest ml/dl
```

- **Data:** each seed simulates a new cohort with `ml.decline.simulator`, split 70/15/15 by patient, so no patient is in two splits. Scalers are fitted on the training patients only.
- **Study time:** the simulator now also simulates `study_ms` when given a second random generator. It's off by default, so every earlier result, the CSV and `decline_eval.md`, is unchanged.
- **Resumable:** trained models and each finished seed are saved in `data/dl/` (gitignored). Running the same command again loads them instead of retraining. Add `--re-evaluate` to recompute predictions from the saved models.
- **What it reports:**
  - every method at flag threshold 0.5;
  - the models at a matched false-alarm rate, with the threshold chosen on validation to match rule B;
  - threshold-sweep trade-off curves;
  - robustness on five shifted simulators: later onset, 1.5× noise, slower MCI decline, playing every other day, and the same noise and play rate for every profile;
  - what the models use in the first two weeks;
  - limitations.
- **Outputs** in `ml/results/`:
  - `dl_decline.md` and `dl_decline.csv` (per seed), plus `dl_sweep.csv` (threshold sweep);
  - `dl_tradeoff.png`, `dl_confusion.png`, `dl_delay.png` and `dl_training_curves.png`.
- **Colab:** `ml/notebooks/dl_decline.ipynb` clones the repository and runs the same command. A private repository needs a `GITHUB_TOKEN` Colab secret.
- **Games:** the experiments simulate the pre-games-v2 core set (Memory Match, Sequence Recall, Word Recall, Reaction Tap) without delayed recall (`core=LEGACY_CORE, delayed=False`). That is exactly the simulator the reported results were made with.

## Caregiver views and the doctor report (Round 2 batch 2)

- **Dashboard:** one "Today at a glance" card per elder, with games done today, today's medicines, alerts that need a look and the ONE next action, such as "Check the 9:00 AM tablet with Kamala". Cards for people who need you come first.
- **Elder page:**
  - "In plain words" insights such as "Memory games steady this month" or "2 doses unsure this week". Tap "Numbers" to see the figures behind each one.
  - A "This week" card comparing the last 7 days with the 7 before.
  - A filterable timeline of games, reminders, alerts, recordings and settings changes.
- **Doctor report:** "Doctor report" on the elder page opens a print-ready summary for 30 or 90 days. "Download PDF" opens the browser's print window; choose "Save as PDF". Notes typed there print with it and are not saved. Every report ends with the statement that Khayal is not a medical device and the report is not a diagnosis.
- **Migration:** settings changes are stored in `patient_events` (migration 0013). Back up `data/khayal.db`, then run `alembic upgrade head` from `backend/`.
- **Screenshots:** in `docs/caregiver/screens/`, with a sample report PDF made from demo data.

## Admin: pilot overview, health, feedback, research export (Round 2 batch 3)

Admins (`KHAYAL_ADMIN_EMAILS`) see five tabs on `/admin`:

- **Overview:** real families, active families over 7 and 30 days, games per day, the invite funnel, and "still playing after 7/30 days".
- **System health:** server uptime and last wake, last cron tick, database size against the 1 GB free limit, and days since the last full backup (warns after 7 days).
- **Feedback:** messages from "Send feedback" (caregiver header) and "Tell us something" (patient Settings sheet; voice notes need the voice opt-in). Mark each read or resolved.
- **People and invites:** invite requests, invite links, and user search by name, email, role or real/demo.
- **Data:**
  - Full backup.
  - Demo accounts.
  - **Research export:** an anonymised zip of game sessions and reminder ticks, only for elders whose family ticked "Research" in the elder's privacy section. Each elder gets a random ID that is new every time, and dates become day numbers.
- **Activity log:** every admin action, with who and when.

Migration 0014 adds the `system_state`, `feedback` and `admin_log` tables. Back up `data/khayal.db`, then run `alembic upgrade head`.

## Voice task (Milestone 8)

The weekly picture description (rules in CLAUDE.md section 7):

- **Turn it on:** on the caregiver patient page, open "Voice recordings" and tick "Voice task enabled". It is off by default; the consent date is saved. The demo seed turns it on for Kamala.
- **When it appears:** if the patient has made no recording in the 6 days before today, "Tell me about a picture" replaces the third game on today's list.
- **Patient:** the kitchen picture, "Tell me everything you see happening", Start → Stop with a sound-level bar. No countdown; it stops by itself after 3 minutes. The browser asks for the microphone the first time.
- **Storage:** the recording (WebM/Opus, or Ogg in browsers without WebM) is sent as the raw request body, at most 10 MB, and saved under `data/uploads/speech/{patient_id}/` (gitignored). It is only served through the authenticated route below, to the patient and linked caregivers.
- **Analysis:** `ml/speech/stub.py` runs on every recording and returns no transcript and no score (`model_version` "stub-0"). The caregiver page says "Analysis coming soon".
- **API:**
  - `POST /api/speech?duration_ms=` (patient) — body is the audio, `Content-Type: audio/webm` or `audio/ogg`.
  - `GET /api/patients/{id}/speech` — the recordings, newest first.
  - `GET /api/patients/{id}/speech/{sample_id}/audio` — the audio file.
  - `PATCH /api/patients/{id}` `{voice_task_enabled}` (linked caregiver).
- Screenshots: `docs/m8/`.

## Polish (Milestone 9)

- **Caregiver pages on a phone:** no sideways scrolling at 375 px. The header wraps, and the patient, session and reminder tables become stacked lists with each value labelled (`.stack-table` in `frontend/src/index.css`; table roles stay in the markup for screen readers).
- **Loading, empty and error states:** every screen has them.
  - **Patient screens:** kind wording, always with a way on ("Let's try again"). If reminders can't be loaded, Home says so instead of "Nothing planned".
  - **Caregiver screens:** errors come with "Try again", and a patient who isn't linked shows "Patient not found".
- **Accessibility pass (CLAUDE.md section 4):** checked on every patient screen at 375 × 812 with a script in the browser:
  - text at least 20 px, headings at least 32 px, controls at least 64 px tall;
  - at most 3 actions besides game pieces, no icon-only controls, the Home button on every screen;
  - nothing important below the fold, no sideways scroll;
  - text contrast at least 4.5:1 against its real background.
  Fixes:
  - the Home "Next reminder" label is no longer a small heading;
  - the "Who is this?" grid fits 3 people without scrolling (4:3 photos, snug spacing).
- **Tests:** they run without warnings; charts get a fixed size in jsdom, and every API call a test triggers is mocked.
- **Report screenshots:** `docs/report-screenshots/`, numbered in order (patient screens at 375 px, caregiver screens at 1280 px).

## Brand and landing page (pilot Phase A)

Khayal is becoming an invite-only pilot (CLAUDE.md section 11).

- **Palette "deep teal + saffron":** tokens in `frontend/src/theme.css` (teal and saffron scales 50–950, ivory, ink, success/warning/danger). Every text/background pair is measured in [docs/brand/palette.md](docs/brand/palette.md).
- **Logo:** an original mark ("thought + care"): three concepts and the recommendation in [docs/brand/logo-concepts.md](docs/brand/logo-concepts.md); files in `docs/brand/logo/`; favicons and the og-image in `frontend/public/`.
- **Landing page** at `/` for everyone signed out (`frontend/src/pages/landing/`, copy in `content.ts`): how it works, for elders/families/doctors, features, the science (honest, not a medical device), privacy, FAQ and a "Request an invite" form. Motion uses `motion` and switches off under prefers-reduced-motion. Screenshots: `docs/brand/landing/`.
- **Invite requests:** `POST /api/invites` (public, 5 per address per hour, honeypot against bots) stores name, email, role, city, optional message and the consent time in `invite_requests` (migration 0008). Phase B adds the admin page to review them.
- **Contact email:** set `KHAYAL_CONTACT_EMAIL` on the backend to show it in the footer.

## Public demo (Voroa)

The prototype can run as a public demo on Voroa's free tier: step-by-step instructions are in
[docs/DEPLOY-VOROA.md](docs/DEPLOY-VOROA.md). With `KHAYAL_DEMO_MODE=1`:

- **Banner** on every screen: "Demo only: no real health info or photos." (20px, at most 2 lines on a 375px phone). It steps aside on game boards in play mode, which must fit a phone without scrolling.
- **Welcome page:** signed-out visitors at `/` see Khayal's name, one line about it, and two choices: "Try the demo" (starts it at once) and "I have a code from my family" (`/pair`), plus "Sign in with email". Outside demo mode `/` still goes to `/pair`.
- **Sleeping server:** the free backend sleeps when idle. Until `GET /api/config` answers, every screen shows "Waking up the server… this can take up to a minute." and the app asks again every 5 seconds.
- **Try the demo** (`POST /api/demo/start`): a fresh demo caregiver with private copies of Kamala, Rahim and Shanti (90 days of simulated history, reminders, placeholder photos), signed in, with a pairing code for the patient side. The history and its alerts are replayed in memory with the app's own rule and cached per day, so this takes well under a second.
- **Rate limits** (in memory) on sign-up, sign-in, pairing and Try the demo.
- **Clean-up:** every account made in demo mode is deleted with all its data after 7 days (at startup, every 15 minutes while awake, after sign-ins, and from `POST /api/internal/tick` with the `X-Khayal-Tick-Secret` header).
- **Smaller uploads:** photos at most 1 MB after resizing; recordings at most 2 minutes and 2 MB.
- `GET /api/config` tells the frontend whether demo mode is on.

The frontend reads the backend address from `VITE_API_URL` at build time (unset in development, where Vite proxies `/api`).

To try demo mode locally without touching `data/khayal.db`, create a separate database and start the backend with `KHAYAL_DEMO_MODE=1 KHAYAL_STORAGE=db KHAYAL_DATABASE_URL=sqlite:///…/data/demo-preview.db` (the `backend-demo` entry in `.claude/launch.json` does this).

## Real pilot (Phase B)

Khayal is an invite-only pilot (CLAUDE.md section 11). Deploy order and settings: [docs/DEPLOY-VOROA.md](docs/DEPLOY-VOROA.md).

- **Invite-only sign-up:** a landing-page request → an admin approves it on `/admin` → a single-use invite link (14 days) the admin copies and sends. Admins (`KHAYAL_ADMIN_EMAILS`) create their own account at `/setup`.
- **Elders are added, not linked:** a caregiver adds the person they look after (name, city, optional photo; no email), confirms they are family or guardian and on what basis, and pairs the elder's device with a 6-digit code. A second family member joins through a single-use share link.
- **Consent (DPDP Act 2023):** at sign-up (policy and terms), when adding an elder, and separate opt-ins for family photos and voice recordings, each stored with the policy version and time. Withdrawing photos or voice deletes that data.
- **Privacy policy and Terms** at `/privacy` and `/terms`: plain-language drafts for India, marked "Draft — pending review". "Not a medical device, does not diagnose" is repeated in the terms, on the dashboard and under every alert.
- **Account and security:** change password (signs out other sessions), admin-made reset links (48 hours), Export my data (zip: JSON + photos and recordings), Delete my account (type DELETE; removes the caregiver and every elder no one else looks after), signed-in devices per elder with Revoke and "Sign out all devices". Passwords need 10 characters.
- **Demo mode** (`KHAYAL_DEMO_MODE=1`) stays for local development; with it off nothing expires on its own, and the admin page removes leftover demo accounts once.
- **Settings:** `KHAYAL_ADMIN_EMAILS`, `KHAYAL_CONTACT_EMAIL` (grievance contact), `KHAYAL_DEMO_MODE=0` in production.
- **Backups (weekly):** the free Voroa database has no backups and is reachable only from inside the workspace, so the backend makes its own: **Admin → Download full backup** (`GET /api/admin/backup`, admins only, one per 10 minutes for the whole server, logged) streams a zip with a JSON file per table, a `manifest.json` (migration revision, row counts, column types, every file's SHA-256) and every photo and recording. Save it under `data/backups/voroa/` and keep the newest 8. Disaster recovery: `python -m app.restore_backup <zip>` from `backend/` restores into an **empty** database at the **same migration revision** (it refuses anything else), then checks row counts and file checksums; round-trip tests run on SQLite and Postgres (`tests/test_backup.py`). Upgrading `khayal-db` to Starter (₹299/month) adds automatic daily backups and is recommended before real families join. `scripts/backup-voroa.ps1` is only for databases reachable from outside, with a matching `pg_dump` version. Guide: [docs/BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md).
- **Screenshots:** `docs/pilot/`.

## Known limitations (prototype)

- **No email service:** invite, share and password-reset links are copied by the admin or caregiver and sent by hand (WhatsApp or email).
- **Rate limits kept in memory:** the pairing wrong-code counter and the demo rate limits live in the server process, so they reset when the server restarts and aren't shared between several server processes (run one instance).
- **One clock for everyone:** "today" (today's games, reminders) uses a single app-wide UTC offset, not each patient's own time zone.
