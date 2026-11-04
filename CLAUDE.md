# Khayal (خیال) — Build Spec for Claude Code

Khayal means both "thought" and "care" in Urdu.

AI-Based Cognitive Gaming and Memory Assistance Platform for Elderly Dementia Patients
CSE471 Deep Learning — Satyam Kumar, Jan Mohammad

This file is the source of truth. Build in the milestone order below. After each milestone: run the app, run the tests, commit, and stop for review. Do not start the next milestone unless asked.

---

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

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, React Router v7 (`react-router` package, library mode), TanStack Query, Recharts for charts, Axios.
- **Backend:** Python 3.11+ (3.12 is fine), FastAPI, SQLAlchemy 2.0, Pydantic v2, SQLite for now (one config line to switch to PostgreSQL), JWT auth (passlib + python-jose, with `bcrypt==4.0.1` pinned because passlib 1.7.4 breaks on newer bcrypt), Uvicorn.
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

The caregiver UI can be a normal dense dashboard.

## 5. Data model

- **User**: id, name, email, password_hash, role (`patient` | `caregiver`), created_at
- **CareLink**: caregiver_id, patient_id (one caregiver can have many patients)
- **GameSession**: id, patient_id, game_type, level_start, level_end, started_at, ended_at, rounds_played, rounds_correct, avg_reaction_ms, hints_used, emotion_summary (nullable JSON)
- **GameRound**: id, session_id, level, correct (bool), reaction_ms, hint_used (bool)
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

### Synthetic data (`ml/decline/simulator.py`)
- Generate patients with profiles `healthy` (flat), `mci` (slow decline), `moderate` (faster decline + more variance) over 90 days.
- Provide a CLI `python -m ml.decline.simulator --patients 30 --days 90 --out data/sim.csv` and a seed script that loads 3 demo patients into the DB.
- This data is also used later for training the LSTM, so keep the column names stable.

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

## 8. API (prefix `/api`)

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /patients` (caregiver's patients), `POST /patients/link`
- `GET /games/{game_type}/level`, `POST /sessions` (session + rounds, returns the new level), `GET /patients/{id}/sessions`
- `GET /patients/{id}/trend?game_type=` (scores + z-scores for charts)
- `GET/POST/PUT/DELETE /patients/{id}/reminders`, `POST /reminders/{id}/log`, `GET /me/reminders/today`
- `GET/POST/DELETE /patients/{id}/family` (multipart photo upload)
- `POST /speech` (multipart audio), `GET /patients/{id}/speech`
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
- Keep all user-facing patient text in one file (`frontend/src/copy.ts`) so it can be translated to Hindi later.
- Ask before adding a new dependency that is not listed in section 2.
- When unsure about a product decision, stop and ask; don't guess.
