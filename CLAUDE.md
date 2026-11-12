# Khayal (خیال) — Build Spec for Claude Code

Khayal means both "thought" and "care" in Urdu.

AI-Based Cognitive Gaming and Memory Assistance Platform for Elderly Dementia Patients
CSE471 Deep Learning — Satyam Kumar, Jan Mohammad

This file is the source of truth. Build in the milestone order below. After each milestone: run the app, run the tests, commit, and stop for review. Do not start the next milestone unless asked.

---

## 0. Safety rules (never break)
1. Never delete, move or overwrite anything outside this repository folder (home folder, AppData, Python/Node installs, .gitconfig, system folders).
2. No recursive deletes with variables or globs (rm -rf $X, rm -rf *, Remove-Item -Recurse, find -delete, del /s). Delete only explicit, literal paths inside the repo; print the absolute path first and confirm it is inside the repo.
3. Check the working directory before any command that writes or deletes.
4. Ask me before deleting more than one file, touching anything outside the repo, or installing/uninstalling software.
5. Back up data/khayal.db to data/backups/ before migrations, seed resets or data cleanup.
6. Push to GitHub after every milestone.
7. If something outside the repo looks broken (Python, Node, git config), stop and report it; never repair it yourself.

## 1. What we are building (prototype scope)

A web app with two roles:

- **Patient**: plays adaptive brain games, sees reminders, uses "Who is this?" to identify family photos, and does a weekly voice task.
- **Caregiver** (also used by the doctor): links to a patient, sets reminders, uploads family photos, and sees score trends, decline alerts and session history.

The AI modules have **stable interfaces now and simple placeholder logic**. The real trained models will be dropped in later without changing the API.

| Module | Prototype behaviour (now) | Later (real model) |
|---|---|---|
| Adaptive difficulty | **Real**, rule-based (section 6) | Contextual bandit / DQN |
| Decline tracking | **Real**, rolling-baseline z-score (section 6) | LSTM/GRU |
| Speech screening | Records and stores audio; returns placeholder score + `"model": "stub"` | Whisper + fine-tuned BERT |
| Face recognition | Caregiver tags photos; patient picks from a photo grid (no ML) | FaceNet/ArcFace embeddings |
| Emotion detection | Off by default; interface only | CNN on FER-2013 |

Out of scope for the prototype: mobile app, MRI, real push notifications (use in-app notifications), deployment.

## 2. Tech stack (decided, do not change without asking)

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, React Router v7 (`react-router` package, library mode), TanStack Query, Recharts for charts, Axios, lucide-react for icons.
- **Backend:** Python 3.11+ (3.12 is fine), FastAPI, SQLAlchemy 2.0 + Alembic migrations, Pydantic v2, Pillow (photo resizing), SQLite for now (one config line to switch to PostgreSQL), JWT auth (passlib + python-jose, with `bcrypt==4.0.1` pinned because passlib 1.7.4 breaks on newer bcrypt), Uvicorn.
- **ML:** plain Python modules in `ml/` that the backend imports through `backend/app/services/`. NumPy/pandas only for now. No torch dependency until real models are added.
- **Tests:** pytest + httpx (FastAPI TestClient) for backend + ml; Vitest + React Testing Library + jsdom + `@testing-library/jest-dom` for frontend.
- **Package managers:** npm for frontend, `uv` or `pip` + `requirements.txt` for backend.

## 3. Repo structure

```
khayal/
├── CLAUDE.md
├── README.md                 # how to run everything
├── frontend/                 # React app (both roles)
│   └── src/
│       ├── pages/patient/    # Home, Games, Reminders, WhoIsThis, VoiceTask
│       ├── pages/caregiver/  # Dashboard, PatientDetail, Reminders, FamilyPhotos
│       ├── games/            # one folder per game
│       ├── components/       # BigButton, Card, Layout, etc.
│       └── api/              # typed API client
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── schemas.py        # Pydantic schemas
│   │   ├── routes/           # auth, patients, sessions, reminders, family, speech, alerts
│   │   └── services/         # adaptive.py, decline.py, speech.py, face.py (call into ml/)
│   ├── tests/
│   └── requirements.txt
├── ml/
│   ├── adaptive/rule_based.py
│   ├── decline/zscore.py
│   ├── decline/simulator.py  # synthetic patient generator
│   ├── speech/stub.py
│   └── notebooks/            # Jan's experiments for the paper
└── data/                     # sqlite db, uploads (gitignored)
```

## 4. Accessibility rules for the patient UI (mandatory)

Our users are elderly people with memory problems. Every patient screen must follow these rules:

- Base font **≥ 20px**, headings ≥ 32px. Buttons **≥ 64px tall**, full-width on mobile.
- High contrast (WCAG AA minimum), no text on images, no grey-on-grey.
- **One main action per screen.** At most 3 buttons visible.
- No time pressure by default. Games never show a countdown unless the game is about reaction time.
- No negative words. Use "Let's try another" instead of "Wrong!". Always end a session on encouragement.
- Simple icons + words together, never icons alone.
- Every screen has a big "Home" button in the same place.
- Optional text-to-speech (browser `speechSynthesis`) for instructions, toggled from Home.

**Patient Home layout (decided):**

- Top bar: the big "Home" button, and next to it a "Read aloud: On/Off" toggle (icon + words). The top bar is the same on every patient screen and does not count toward the 3-button limit.
- Below it: a "Next reminder" info card (information only, not a button).
- Then exactly 3 big buttons: "Play a game", "Today's reminders", "Who is this?".
- The weekly voice task is not on Home. It appears inside the games list as "Tell me about a picture", and only when it is due.

**Patient UI decisions (decided after the UI audit, `docs/ui-audit.md`):**

- Game pieces (cards, tiles, answer options, word choices) never count toward the 3-button rule. The rule covers navigation and actions.
- No important button below the fold at 375 × 812: every game board, every answer and every commit button ("Done", "Create account") is visible without scrolling. Game screens use a compact play mode for this.
- No hidden timers (see section 7). Reaction Tap is the only game that measures speed.
- **Patient sign-in = device pairing.** The caregiver patient page shows a 6-digit pairing code, valid for 10 minutes. The patient's device enters it once and stays signed in for 90 days. Caregivers keep email + password login.
- **Fonts (approved dependencies):** `@fontsource/atkinson-hyperlegible` on the patient side, `@fontsource/inter` on the caregiver side.
- **Patient game names:** "Find the Pairs" (Memory Match), "Follow the Colours" (Sequence Recall), "Remember the Words" (Word Recall), "About Today" (Daily Orientation), "Tap When Green" (Reaction Tap). Caregiver screens keep the clinical names.
- Demo family photos are plain coloured silhouettes, with no names or initials, so they never give away an answer.
- **No emoji anywhere in the UI**, patient or caregiver. Interface icons (Home, Read aloud, reminders, games, status, alerts) come from `lucide-react` (approved dependency) in one consistent stroke style, always next to words. Memory Match cards use 10 flat SVG illustrations in one style (chai, roti, mango, rickshaw, marigold, cricket bat, diya, kite, elephant, coconut) as React components in `frontend/src/games/memory/art/`: clear shapes, few details, high contrast, recognisable at 60px. Plain text marks such as ✓ and ● stay only where they carry meaning; `copy.ts` has no decorative symbols.

The caregiver UI can be a normal dense dashboard.

## 5. Data model

- **User**: id, name, email, password_hash, role (`patient` | `caregiver`), created_at
- **CareLink**: caregiver_id, patient_id (one caregiver can have many patients)
- **GameSession**: id, patient_id, game_type, level_start, level_end, started_at, ended_at, rounds_played, rounds_correct, avg_reaction_ms, hints_used, emotion_summary (nullable JSON)
- **GameRound**: id, session_id, level, correct (bool), reaction_ms, hint_used (bool), study_ms (nullable, see section 7)
- **PlayerLevel**: patient_id, game_type, current_level (1–10), updated_at
- **Reminder**: id, patient_id, title, type (`medicine` | `meal` | `appointment` | `other`), time_of_day, days_of_week, active
- **ReminderLog**: reminder_id, date, status (`done` | `missed`)
- **FamilyMember**: id, patient_id, name, relation, photo_paths (JSON list), note
- **SpeechSample**: id, patient_id, audio_path, recorded_at, transcript (nullable), risk_score (nullable), model_version
- **Alert**: id, patient_id, type (`decline` | `missed_reminders` | `speech_risk`), message, severity (`info` | `warning` | `critical`), created_at, acknowledged

## 6. Core logic (implement exactly)

### Adaptive difficulty (`ml/adaptive/rule_based.py`)
- Levels 1–10 per game per patient. Start at level 2.
- After every **5 rounds**, compute the success rate `s` over those rounds.
- `s ≥ 0.85` → level +1. `s < 0.55` → level −1. Otherwise stay. Clamp to 1–10.
- Target zone is 60–80% success. Store every change.
- Interface: `next_level(current_level: int, recent_rounds: list[Round]) -> int`. Keep this signature; the RL version will implement the same one.

### Decline tracking (`ml/decline/zscore.py`)
- Per patient per game, use the **composite score** = accuracy × level / 10, adjusted for reaction time (document the formula in code).
- Baseline = mean and std of the patient's first 10 sessions (or all sessions if fewer than 10, with no alerts raised until there are 10).
- For each new session, take the rolling mean of the last 5 sessions. `z = (rolling_mean − baseline_mean) / baseline_std`.
- `z < −1.5` → `warning` alert. `z < −2.5` → `critical` alert. Do not raise the same alert type more than once per 7 days.
- Interface: `assess(sessions: list[SessionSummary]) -> DeclineResult(score, z, status, explanation)`.

**v2 changes (decided; these override the baseline and alert bullets above):**

- **Warm-up:** ignore each game's first 5 completed sessions. The baseline = the next 10 completed sessions (sessions 6–15). No z and no alerts for a game until it has 15 completed sessions; until then the chart shows "Learning this patient's normal (8/15 sessions)".
- **Std floor:** baseline std = max(sample std, 0.05, 0.15 × baseline mean).
- **Clipping:** clip z to [−4, 4] before alerts and before the overall index, so one game can't dominate. The unclipped z is kept for reference.
- **Escalation:** a `critical` alert may be raised within 7 days of a `warning` for the same patient. The same severity stays limited to once per 7 days.
- The first version (floor 0.02, no clipping, no warm-up, no escalation) is kept as `zscore.LEGACY` for the ablation in `python -m ml.decline.evaluate`.
- **Alert rule B is the default (decided after the evaluation):** a decline alert is raised only when the same game's z is below −1.5 on its last 3 completed sessions in a row; the severity comes from that game's latest z (critical below −2.5). Rules A–E stay selectable for the evaluation and per install via `KHAYAL_ALERT_RULE` (`any` = A, `persistence` = B, `two_games` = C, `index` = D, `persistence_or_index` = E). Results: `ml/results/decline_eval.md`.

**Composite score (decided, used in the paper).** Per *completed* session; stopped-early sessions are excluded.

- `acc` = (correct rounds without hint + 0.5 × correct rounds with hint) / rounds
- `lvl` = level_start / 10 (About Today: `lvl` = 1)
- `rt` = clamp(patient's baseline median reaction time for this game / this session's median reaction time, 0.5, 1.5). The baseline is the median over the baseline sessions (6–15, after the warm-up); until those exist, `rt` = 1. About Today: `rt` = 1.
- `composite = acc × lvl × rt`

**Overall cognitive index** = mean of the latest z across the games that have a baseline. The caregiver patient list shows it as a status dot (Stable / Watch / Declining).

**One status scale on caregiver screens (decided):** each game and the overall index use the same words and thresholds (Stable at −0.5 or above, Watch below −0.5, Declining below −1.5, Learning before a baseline), labelled "This game: …" and "Overall: …", with a one-line explanation when they differ. Alerts keep their own thresholds (warning below −1.5, critical below −2.5). Each alert line about a game links to that game's chart and highlights it for 2 seconds.

**Theme (decided):** all colours and fonts come from `frontend/src/theme.css`. Light mode only. One calm primary (deep indigo), one warm accent (marigold); warm paper + Atkinson Hyperlegible on the patient side, near-white + Inter on the caregiver side.

**Secondary signals** (shown on the dashboard, no alerts yet): stopped-early rate and hint rate over the last 14 days, and reminder adherence (patient-marked only).

Each decline alert carries a plain explanation, e.g. "Memory Match average dropped from 0.62 to 0.41 over the last 5 sessions (z = −2.7)."

### Synthetic data (`ml/decline/simulator.py`)
- Generate patients with profiles `healthy` (flat), `mci` (slow decline), `moderate` (faster decline + more variance) over 90 days.
- Provide a CLI `python -m ml.decline.simulator --patients 30 --days 90 --out data/sim.csv` and a seed script that loads 3 demo patients into the DB.
- This data is also used later for training the LSTM, so keep the column names stable.
- Rounds are generated and passed through the real adaptive engine (`next_level`), not made-up final scores.
- Stable CSV columns: `patient_id, profile, day, game_type, level_start, level_end, rounds, correct, hints, median_rt_ms, completed, composite`.
- `python -m app.seed --demo-history` loads 90 days for the 3 demo patients, one per profile.

### Speech (`ml/speech/stub.py`)
- `score(audio_path) -> SpeechResult(transcript=None, risk_score=None, model_version="stub-0")`.
- The backend stores the audio and shows "Analysis coming soon" in the UI. Do not fake a number.

### Missed reminders
- Raise a `warning` alert if 3 or more reminders were missed in the last 48 hours.

## 7. Games (frontend `src/games/`)

Each game is a self-contained component: it receives `level`, reports each round as `{correct, reaction_ms, hint_used}`, and shows a calm end screen.

1. **Memory Match**: flip cards to find pairs. Level controls the number of pairs (2 → 10) and the preview time.
2. **Sequence Recall**: coloured tiles light up; the patient repeats the order. Level controls the sequence length (2 → 7).
3. **Word Recall**: show 3–8 everyday words, a short distraction, then pick the ones seen from a list.
4. **Daily Orientation**: day, date, season, and "Which of these is your grandson?" using family photos. No difficulty levels; results go to the trend only.
5. **Reaction Tap**: tap when the circle turns green. The only game with timing.

**No hidden timers (decided):** apart from Reaction Tap, nothing on a game screen ends by itself.

- **Memory Match:** the preview stays until the patient taps "I've looked — hide the cards". Difficulty = number of pairs only (there is no preview time any more).
- **Word Recall:** each word stays until the patient taps "Next word". The star distraction ends once 5 stars are tapped. The pick list has at most 12 words: every shown word plus new ones up to 12.
- **End of a session:** warm, varied encouragement (never a level number). The main button is "Next game" (the next game on today's list not finished today), or "Back to Home" when all are done; "Play again" is secondary.
- **Read aloud in games:** when on, each question is spoken with its answer choices, and the kind reply after answering.
- **Sequence Recall:** after a wrong tap, the game gently replays the right order ("Here's how it went") before moving on.
- Each round records how long the patient looked before playing as `study_ms` on `GameRound` (nullable: Memory Match preview time, Word Recall total word-viewing time; empty for the other games). It is stored for the decline analysis but is not part of the composite score yet.

**Today's games (decided):** the patient's games list shows exactly 3 games per day, chosen by the server (`GET /me/games/today`, logic in `backend/app/services/today_games.py`).

- Slot 1 is always About Today (Daily Orientation), because daily orientation is our most important tracking signal.
- Slots 2 and 3 are the 2 levelled games played least recently before today. Any session counts as played, including a stopped-early one. Ties are broken randomly with a seed based on the date, so the list stays the same all day.
- When the weekly voice task is due (from Milestone 8), it replaces slot 3.
- Once a game is finished today (a completed session), its button shows "✓ Done today", but the patient can still play it again.
- On the caregiver patient page, "Pin games" lets a caregiver fix slots 2–3 for that patient (two different levelled games). Unpinning returns to automatic.
- "Today" uses the app's local clock (`KHAYAL_UTC_OFFSET_MINUTES`, IST by default).

## 8. API (prefix `/api`)

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /patients` (caregiver's patients), `POST /patients/link`
- `GET /games/{game_type}/level`, `POST /sessions` (session + rounds, returns the new level), `GET /patients/{id}/sessions`
- `GET /patients/{id}/trend?game_type=` (scores + z-scores for charts)
- `GET/POST/PUT/DELETE /patients/{id}/reminders`, `POST /reminders/{id}/log`, `GET /me/reminders/today`
- `GET/POST/DELETE /patients/{id}/family` (photo upload: see below)
- `POST /speech` (audio upload: see below), `GET /patients/{id}/speech`

**File uploads (decided):** photos and audio are sent as the raw request body, one file per request, with the file's own `Content-Type` (e.g. `image/jpeg`, `audio/webm`). No multipart forms, so no `python-multipart` dependency.
- `GET /patients/{id}/alerts`, `POST /alerts/{id}/ack`

Every route checks the role and the care link. A patient can only see their own data; a caregiver can only see linked patients.

## 9. Milestones

Build one at a time. Each one ends with: app runs, tests pass, README updated, git commit.

1. **Skeleton**: repo structure, FastAPI health route, Vite app with routing, Tailwind, the accessible `Layout`/`BigButton` components, one command to run each side, README.
2. **Auth + roles**: register/login, JWT, patient and caregiver home pages, care links, seed script with 1 caregiver + 3 demo patients.
3. **Games + adaptive engine**: Memory Match and Sequence Recall first, session/round storage, `rule_based.py` with unit tests, level persists between sessions.
4. **Remaining games**: Word Recall, Daily Orientation, Reaction Tap.
5. **Reminders**: caregiver CRUD, patient "Today" screen with big Done buttons, missed-reminder alerts.
6. **Family + Who Is This?**: caregiver photo upload with name and relation; patient photo grid that says the name and relation aloud.
7. **Decline tracking + dashboard**: simulator, z-score module with tests, alerts, caregiver dashboard with Recharts trend lines per game, alert list, session table.
8. **Voice task**: browser recording (MediaRecorder) of the "Cookie Theft"-style picture description, upload, stub result, list on the dashboard.
9. **Polish**: empty states, loading and error states, an accessibility pass against section 4, demo-mode seed with 90 days of simulated history, screenshots for the report.

## 10. Conventions

- Type everything (TypeScript strict, Python type hints). No `any`.
- Backend: routes are thin; logic goes in `services/` and `ml/`.
- Never commit `data/`, `.env`, uploads or model weights.
- Every model change ships with an Alembic migration (`backend/migrations/versions/`, autogenerate then review). Never wipe the dev database to change the schema.
- Keep all user-facing patient text in one file (`frontend/src/copy.ts`) so it can be translated to Hindi later.
- Ask before adding a new dependency that is not listed in section 2.
- When unsure about a product decision, stop and ask; don't guess.