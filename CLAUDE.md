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

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, React Router v7 (`react-router` package, library mode), TanStack Query, Recharts for charts, Axios, lucide-react for icons, `motion` for animation (approved, section 11).
- **Backend:** Python 3.11+ (3.12 is fine), FastAPI, SQLAlchemy 2.0 + Alembic migrations, Pydantic v2, Pillow (photo resizing), SQLite for now (one config line to switch to PostgreSQL), JWT auth (passlib + python-jose, with `bcrypt==4.0.1` pinned because passlib 1.7.4 breaks on newer bcrypt), Uvicorn.
- **ML:** plain Python modules in `ml/` that the backend imports through `backend/app/services/`. NumPy/pandas only for now. No torch dependency until real models are added.
- **Tests:** pytest + httpx (FastAPI TestClient) for backend + ml; Vitest + React Testing Library + jsdom + `@testing-library/jest-dom` for frontend.
- **Package managers:** npm for frontend, `uv` or `pip` + `requirements.txt` for backend.
- **Hosting (public demo, decided):** Voroa free tier, PostgreSQL through `psycopg[binary]` (approved), files in a database table (`KHAYAL_STORAGE=db`), `KHAYAL_DEMO_MODE=1`. Steps: `docs/DEPLOY-VOROA.md`. The demo banner is on every screen except game boards in play mode, which must still fit 375 × 812 without scrolling (decided). Banner text: "Demo only: no real health info or photos.", 20px everywhere, at most 2 lines at 375px.

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
│   ├── adaptive/bandit.py    # research bandits (Round 2 batch 1); neural.py needs ml/.venv
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

- Top bar: the big "Home" button, next to it a "Read aloud: On/Off" toggle (icon + words), and a "More" button ("Settings" on wider screens) that opens a settings sheet with vibration (default on) and soft sound (default off) (decided in Phase C). The top bar is the same on every patient screen and does not count toward the 3-button limit.
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
- Demo family photos are plain coloured silhouettes in palette colours (teal, saffron, deep brown), with no names or initials, so they never give away an answer.
- **No emoji anywhere in the UI**, patient or caregiver. Interface icons (Home, Read aloud, reminders, games, status, alerts) come from `lucide-react` (approved dependency) in one consistent stroke style, always next to words. Memory Match cards use 10 flat SVG illustrations in one style (chai, roti, mango, rickshaw, marigold, cricket bat, diya, kite, elephant, coconut) as React components in `frontend/src/games/memory/art/`: clear shapes, few details, high contrast, recognisable at 60px. Plain text marks such as ✓ and ● stay only where they carry meaning; `copy.ts` has no decorative symbols.

The caregiver UI can be a normal dense dashboard.

## 5. Data model

- **User**: id, name, email, password_hash, role (`patient` | `caregiver`), created_at; patients also: city, pinned_games, voice_task_enabled (default false), voice_consent_at (nullable), core_games (nullable = default core set, section 7), festivals (nullable = festival question off)
- **CareLink**: caregiver_id, patient_id (one caregiver can have many patients)
- **GameSession**: id, patient_id, game_type, level_start, level_end, started_at, ended_at, rounds_played, rounds_correct, avg_reaction_ms, hints_used, emotion_summary (nullable JSON)
- **GameRound**: id, session_id, level, correct (bool), reaction_ms, hint_used (bool), study_ms (nullable, see section 7), errors (nullable int, games v2 D1: wrong placements/taps, clock error bits, delayed-recall false alarms; not in the composite)
- **PlayerLevel**: patient_id, game_type, current_level (1–10), updated_at
- **TutorialState**: patient_id, game_type, seen_at (nullable: a caregiver asked to show it again)
- **Reminder**: id, patient_id, title, type (`medicine` | `meal` | `appointment` | `other`), time_of_day, repeat (`once` | `daily` | `weekly_days`), on_date (once), start_date + optional end_date (daily / weekly_days), days_of_week (weekly_days), active. Dates are days on the app clock; a reminder whose day or end date has passed is listed under "Past reminders" (kept with its history).
- **ReminderLog**: reminder_id, date, status (`done` | `missed`)
- **FamilyMember**: id, patient_id, name, relation, photo_paths (JSON list), note
- **SpeechSample**: id, patient_id, audio_path, content_type, recorded_at, duration_ms, transcript (nullable), risk_score (nullable), model_version
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

**One status scale on caregiver screens (decided):** each game and the overall index use the same words and thresholds (Stable at −0.5 or above, Watch below −0.5, Declining below −1.5, Learning before a baseline), labelled "This game: …" and "Overall: …", with a one-line explanation when they differ. Alerts keep their own thresholds (warning below −1.5, critical below −2.5). Each alert line about a game links to that game's chart and highlights it for 2 seconds. **Patient page (caregiver-polish):** summary first; repeated alerts are grouped into one card with a count (decline alerts by game), with "Acknowledge all"; the overall-trend and games sections open only when something is on Watch or Declining, and only Declining game charts open by themselves; the other sections start closed with their status in the heading.

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

### Overdue reminders: ask, don't urge (decided in Phase C)
- A reminder says "It's time for this" only during its **on-time window**: 1 hour after its time, or, for medicine, the caregiver's **safe late window** if one is set (default: none, so the standard hour). Never "Now" after that window.
- After the window, the patient is asked "This was for 9:00 AM. Is it done?" with two answers:
  - **"Yes, it's done"**: recorded as done and **confirmed later** (`ReminderLog.late`, with `logged_at` as the time it was confirmed). Adherence counts it; the caregiver page shows it as "confirmed later".
  - **"No / not sure"**: never says to take it. The patient sees "Please ask your family before taking it." The caregiver immediately gets a notice ("Kamala wasn't sure about the 9:00 AM reminder …"; alert type `reminder_unsure`, `warning` for medicine, `info` otherwise), without waiting for the 3-missed rule. One notice per reminder per day. A later "Yes, it's done" still counts, as confirmed later.
- If the same medicine (same title, type medicine) has another dose later today, the earlier dose is no longer shown on the patient's screens once the later dose's time has come. The caregiver keeps its record.
- Home's "Next reminder" shows a reminder in its on-time window, else the next upcoming one; never an overdue one as "Now".
- Missed logging waits for 2 hours or the safe late window, whichever is longer. Patient wording never suggests a dose; this is not medical advice.

## 7. Games (frontend `src/games/`)

Each game is a self-contained component: it receives `level`, reports each round as `{correct, reaction_ms, hint_used}`, and shows a calm end screen.

1. **Memory Match**: flip cards to find pairs. Level controls the number of pairs (2 → 10) and the preview time.
2. **Sequence Recall**: coloured tiles light up; the patient repeats the order. Level controls the sequence length (2 → 7).
3. **Word Recall**: show 3–8 everyday words, a short distraction, then pick the ones seen from a list.
4. **Daily Orientation**: day, date, season, and "Which of these is your grandson?" using family photos. No difficulty levels; results go to the trend only.
5. **Reaction Tap**: tap when the circle turns green. The only game with timing.

Games v2 (`docs/games/research.md`; all levelled 1–10, 5 rounds, the same adaptive rule and composite; `errors` stored but not scored):

6. **Join in order** (`colour_trails`, caregiver name "Colour Trails"; Trail Making / Color Trails idea): tap numbered marks in order; a line joins each right tap; a tap that doesn't join says "Let's look for 4". Levels 1–4: Part 1 with 5/7/9/12 numbers; 5–10: Part 2 with 6→16 numbers alternating teal circle and saffron square (shape and colour), half of the numbers also shown in the other colour to be left alone. Right = finished with at most 1 wrong tap. `reaction_ms` = median gap between joins, recorded silently (D2). `errors` = taps that didn't join.
7. **Set the clock** (`clock_setting`, "Clock Setting"; Clock Setting / Reading idea, no free drawing): "Set the clock to 10 past 11" (words and digits); tap where the short hand goes, then the long hand; either can be moved again (tap, or the arrow keys) before Done. Levels: 1 read o'clock (3 choices) · 2 set o'clock · 3 half past · 4 quarter past/to · 5 five-minute steps · 6 "10 past 11" pull · 7 face with only 12/3/6/9 · 8 ticks only · 9 words only ("twenty to four") · 10 "what will the time be in an hour and a half?" (3 choices). Right = short hand in the right hour sector (on the hour at o'clock) and long hand within 5 minutes. `errors` bits: 1 = short hand, 2 = long hand.
8. **Market day** (`money_handling`, "Money Handling"; IADL finances / financial-capacity idea): pay at a shop by tapping notes and coins onto the counter (tap again to take back), then Pay; later levels ask about change or a budget with 3 choices. Levels: 1 one note (₹10/20/50 in the purse) · 2 two equal notes · 3 two different notes · 4 notes + a coin · 5 three or four pieces · 6 pay for the cheaper of two items · 7 change from a round note · 8 pay for two items · 9 change in coins · 10 "You have ₹100. Which two can you buy?". Right = the exact amount (no overpaying) or the right choice. Money is simplified ₹ tokens in each note's colour family with a large value, no portraits or security features (D5); prices in `frontend/src/games/moneyHandling/prices.ts`. The running total is not shown: counting is the task.
9. **Tap the squares** (`spatial_span`, "Spatial Span"; Corsi block-tapping idea, D3): nine identical teal squares in a 3×3 grid light up in turn (saffron with a dot); the patient taps the same squares in order. 2 → 7 squares over levels 1–10, no square twice in one order. A separate game from Follow the Colours, so neither game's levels change meaning. Same hint and gentle replay as Follow the Colours.
10. **Where did it go?** (`object_location`, "Paired Associates (object location)"; PAL task idea, never named in the patient UI, D8): everyday objects (10 licensed photos, `docs/games/image-sources.md`) are shown one at a time in their boxes, "Next" moves on (no timer); then each object appears above the grid and the patient taps its box. Misplaced ones are shown again ("Here's where they were") for one more try: right on the second try = right with `hint_used`. Levels (objects/boxes): 2/4 · 2/6 · 3/6 · 4/6 · 4/9 · 5/9 · 6/9 · 6/9 household-only (more alike) · 7/9 · 8/9; boxes 108px. `errors` = first-try misplacements; `study_ms` = looking time; `reaction_ms` = median time to place.
11. **Delayed word recall** (`word_recall_delayed`, "Delayed Word Recall"; CERAD delayed recall, D4): after a finished Remember the Words session, the last round's words and pick list are kept on the device. At the start of the next game the patient opens, if 3–30 minutes have passed: "Earlier we saw some words. Which of these did you see?" (same pick list, at most 12). Too soon: kept; over 30 minutes or no other game: dropped. One round per word shown (right = picked); false alarms are `errors` on the first round. No level change; scored at the level the words were shown at (the last finished Remember the Words session's starting level); its own baseline; tracked when Remember the Words is in the core set. Nothing is shown about how it went.
12. **About Today festival question** (our own adapted item, not validated; D6): "Which festival comes next?" with 3 picture-and-word choices (the right one plus two that come later, so "next" is never in doubt). Asked as a 6th About Today round only in the 30 days before a festival the caregiver ticked (Settings → Festivals this family celebrates; none ticked = off, no default list). Festivals include Muharram and Milad-un-Nabi (moon-dependent). Dates per year from the Government of India central-government holiday lists (Delhi) in `frontend/src/games/dailyOrientation/festivals/2026.ts` and `2027.ts`; Eid dates depend on the moon. Add each new year's table before the year starts; without one the question is simply not asked. About Today sessions are complete with 5 or 6 rounds.

**No hidden timers (decided):** apart from Reaction Tap, nothing on a game screen ends by itself.

- **Memory Match:** the preview stays until the patient taps "I've looked — hide the cards". Difficulty = number of pairs only (there is no preview time any more).
- **Word Recall:** each word stays until the patient taps "Next word". The star distraction ends once 5 stars are tapped. The pick list has at most 12 words: every shown word plus new ones up to 12.
- **End of a session:** warm, varied encouragement (never a level number). The main button is "Next game" (the next game on today's list not finished today), or "Back to Home" when all are done; "Play again" is secondary.
- **Read aloud in games:** when on, each question is spoken with its answer choices, and the kind reply after answering.
- **First-time tutorial (games v2, research.md 3.4):** the first time a patient opens a game, a short spoken demo (spoken even when Read aloud is off, words also on screen, a hand showing one move), then one practice round at level 1 or easier, never stored. Patients who already played a game skip it. The caregiver can ask for it again per game.
- **Between rounds:** "Round X of 5" stays on the reply card, and the praise after a right answer varies from round to round.
- **Sequence Recall:** after a wrong tap, the game gently replays the right order ("Here's how it went") before moving on.
- Each round records how long the patient looked before playing as `study_ms` on `GameRound` (nullable: Memory Match preview time, Word Recall total word-viewing time; empty for the other games). It is stored for the decline analysis but is not part of the composite score yet.

**Today's games (decided):** the patient's games list shows exactly 3 games per day, chosen by the server (`GET /me/games/today`, logic in `backend/app/services/today_games.py`).

- Slot 1 is always About Today (Daily Orientation), because daily orientation is our most important tracking signal.
- Slots 2 and 3 are the 2 core-set games (see "Core set" below) played least recently before today. Any session counts as played, including a stopped-early one. Ties are broken randomly with a seed based on the date, so the list stays the same all day.
- When the weekly voice task is due (from Milestone 8), it replaces slot 3.
- Once a game is finished today (a completed session), its button shows "✓ Done today", but the patient can still play it again.
- On the caregiver patient page, "Pin games" lets a caregiver fix slots 2–3 for that patient (two different levelled games). Unpinning returns to automatic.
- "Today" uses the app's local clock (`KHAYAL_UTC_OFFSET_MINUTES`, IST by default).

**Core set (decided for games v2, `docs/games/research.md` D7; built in `backend/app/services/core_games.py`):**

- Each patient has a **core set of 4 levelled games** for decline tracking, chosen to cover different domains (verbal memory, visuospatial memory, executive/speed, visuospatial/everyday function). The caregiver can change it on the patient page.
- Slots 2–3 of Today's games rotate only through the core set (least recently played, as above). About Today stays slot 1, and the voice task still replaces slot 3 when due. "Pin games" picks from the core set.
- Every other game is an optional **"More games"** game: playable any time and still recorded with its own warm-up and baseline, but not in the daily rotation and not part of decline alerts or the overall index unless it is in the core set. About Today always counts.
- **Who gets which set:** new patients get the default set (`DEFAULT_CORE`): Remember the Words (verbal memory), Where did it go? (visuospatial memory), Join in order (executive/speed), Market day (everyday function); the simulator plays the same set. Patients who had already played before games v2 keep their 4 games (migration 0012), so their baselines keep counting. The caregiver changes the set under Settings → Core games (4 different levelled games, each shown with its domain); pins that leave the set return to automatic.
- **Patient access (my proposal, within section 4):** once all of today's games are done, the end screen adds a secondary "More games" button. That screen shows at most 3 games outside the core set, least recently played first (`GET /me/games/more`), so the 3-button rule holds and every game gets its turn.
- **Caregiver charts:** the core games and About Today come first; games outside the set appear under "More games" only once played.
- The other games-v2 decisions (D1–D6, D8) are in `docs/games/research.md` section 6.

**Voice task (decided, Milestone 8):**

- **Picture:** an original flat illustration of a busy Indian home kitchen (`frontend/src/voice/KitchenScene.tsx`): a mother cooking at the stove, milk boiling over, a child on a stool reaching for the laddoo jar, a cat by a spilled glass, rain at the window. No text in the picture. Not a copy of the Cookie Theft picture.
- **Patient screen "Tell me about a picture":** the picture, "Tell me everything you see happening", one big Start button, then Stop with a simple live sound-level bar. No countdown; it stops by itself after 3 minutes. Then "Thank you, that was lovely." Read aloud speaks the instruction.
- **Due weekly:** offered when the patient has made no recording in the 6 days before today; it then replaces slot 3, and stays there marked "✓ Done today" once recorded.
- **Consent:** a caregiver toggle "Voice task enabled" per patient, off by default (on for Kamala in the seed). Turning it on records the consent date; turning it off clears it, hides the task and refuses uploads.
- **Upload:** WebM or Ogg (Opus) as the raw request body, at most 10 MB, stored under `data/uploads/speech/{patient_id}/` with `duration_ms`; `ml/speech/stub.py` runs on it (no transcript, no score).
- **Caregiver:** a "Voice recordings" section with date, length, authenticated playback and "Analysis coming soon". No made-up numbers.

## 8. API (prefix `/api`)

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /patients` (caregiver's patients), `POST /patients` (add an elder; replaces linking by email, Phase B)
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

## 11. Real pilot plan (decided)

Khayal moves from a public demo to a **real product: an invite-only pilot**. This overrides "deployment" being out of scope in section 1. Hosting stays on the free Voroa tier for now (section 2). Three phases, each on its own branch, each ending with: tests pass, screenshots, commit, push, merge into `main` (no squash), then stop for review.

- **Phase A: brand + landing page** (branch `brand-landing`).
  - Palette "deep teal + saffron": deep teal primary (about #0E5E63, scale 50–950), saffron/marigold accent (about #F2A33A, scale), warm ivory ground (about #FBF7EF), ink text, success/warning/danger tuned to teal. Every text/background pair meets WCAG AA (patient body text aims for AAA). Contrast table: `docs/brand/palette.md`. It replaces the indigo tokens everywhere.
  - An original logo ("thought + care": a thought bubble that also reads as care, in teal with a saffron dot like the dot of خ): full logo, mark, monochrome, favicons (SVG + 32/180/512 PNG), og-image 1200×630. Concepts: `docs/brand/logo-concepts.md`.
  - A landing page at `/` for every signed-out visitor: sticky header, hero, how it works, for elders/families/doctors, features, the science (honest: not a medical device, does not diagnose; a B.Tech CSE471 research project), privacy & safety, FAQ, final call to action, a "Request an invite" form (stored in a table, rate-limited), and a footer (Privacy and Terms placeholders, contact email from `KHAYAL_CONTACT_EMAIL`, "Made in India").
  - Visual world: an Indian courtyard home (lime-plaster ivory, painted teal doors, marigold, jaali light). The direction contract is in the Impeccable surface brief.
  - Motion with the `motion` library (approved): gentle and 150–400 ms ease-out, off under prefers-reduced-motion.
  - Demo mode keeps working behind `KHAYAL_DEMO_MODE`.
- **Phase B: real pilot** (branch `real-pilot`, decided):
  - Sign-up only through a single-use invite link (14 days) made on the admin page (`KHAYAL_ADMIN_EMAILS`; admins use `/setup`), or a family share link. Links are stored as hashes and shown once.
  - Elders have no email or password: a caregiver adds them and pairs their device; each paired device is a revocable session.
  - Consent records (DPDP Act 2023) with policy version and time: sign-up, adding an elder (family/guardian; elder agreed or legally authorised), separate photos and voice opt-ins. Withdrawing photos or voice deletes that data.
  - Privacy policy and Terms drafts ("Draft — pending review"); "not a medical device" in the terms, on the dashboard and under every alert.
  - Change password (signs out other sessions), admin reset links (48 h), export my data (zip), delete my account (type DELETE). Passwords at least 10 characters.
  - Demo mode off in production; nothing expires on its own; the admin removes demo accounts once. Backups (decided): the free Voroa database has no backups and is reachable only inside the workspace, so the admin downloads **Admin → Download full backup** weekly (a zip: one JSON file per table, `manifest.json` with the migration revision, every photo and recording; admin-only, one per 10 minutes, logged) into `data/backups/voroa/`, newest 8 kept. Disaster recovery: `python -m app.restore_backup <zip>`, only into an empty database at the same migration revision. Upgrading the database to Starter (₹299/month, automatic daily backups) is recommended before real families join. `scripts/backup-voroa.ps1` is only for databases reachable from outside with a matching `pg_dump` version.
- **Phase C: redesign of the patient and caregiver UI for daily use, with motion** (section 4 rules still hold).

## 12. Round 2 plan (decided)

Five batches, built one at a time, each on its own branch. Each batch ends with: tests (SQLite + Postgres + frontend + ML), screenshots, merge into `main`, push, then stop for review. Sections 0 and 4 apply throughout.

1. **Learning-based difficulty** (branch `adaptive-bandits`; research, `ml/` only, not live by default).
   - Contextual bandits behind the `next_level(current_level, recent_rounds)` interface: LinUCB, Thompson sampling, and a small neural bandit (PyTorch, `ml/` only, run from `ml/.venv`).
   - Actions: level −1, 0 or +1.
   - Context: last-session success rate, success trend, median RT vs baseline, hints, errors, stopped early, days since last play.
   - Reward: closeness of the next session's success rate to 0.70, minus a penalty for a stopped-early session.
   - Safety: at most ±1 per session, levels clamped to 1–10, and the rule engine decides whenever the bandit is unsure.
   - Evaluation: compare with the rule engine in the simulator (healthy, MCI and moderate; at least 5 seeds) on:
     - time in the 60–80% zone;
     - stopped-early rate;
     - level oscillation;
     - cumulative regret;
     - decline detection per engine (does adaptive difficulty hide decline?).
   - Output: `ml/results/adaptive_eval.md`, `.csv` and charts.
   - Setting `KHAYAL_ADAPTIVE_ENGINE=rule` (default) or `bandit`. Production is not switched.
   - **Built** (`ml/adaptive/bandit.py`, `neural.py`, `prior.py`, `evaluate.py`; results in `ml/results/adaptive_eval.md`):
     - Engines: LinUCB, linear Thompson sampling, and a bootstrapped ensemble of 5 MLPs.
     - The bandit never raises the level after a stopped-early session or a success rate of 40% or less, and never lowers it after 5/5.
     - The simulator gained an opt-in `frustration`: more stopping early when a level is too hard.
     - `KHAYAL_ADAPTIVE_ENGINE=bandit` uses Thompson sampling, warmed on a small seeded simulated cohort at first use, then replays the patient's own sessions. No weights are stored.
   - **Result:** no bandit beats the rule engine clearly.
     - Regret: Thompson sampling is lowest (0.047 vs 0.050 per decision), with slightly fewer stopped-early sessions.
     - Time in the 60–80% zone: the rule engine is highest (54% vs 48–50% for the bandits).
     - Decline detection: the bandits do not hide decline; they exaggerate it. They lower MCI patients' levels faster, and the composite multiplies by level. MCI detected rose from 0.81 to 0.91–0.96, and false alarms rose from 0.10 to 0.14–0.27.
     - Recommendation: keep the rule engine.
2. **Caregiver redesign and reports**:
   - a mobile-first "Today at a glance" card per elder;
   - plain-language insights, with the numbers one tap away;
   - a per-elder timeline that can be filtered;
   - a weekly summary card;
   - a print-optimised doctor report (browser "print to PDF", no new dependency).
3. **Admin**:
   - pilot overview (active families, sessions per day, invite funnel, retention);
   - system health (uptime, last cron tick, DB size vs 1 GB, days since the last full backup);
   - a feedback inbox;
   - an anonymised research export behind a new versioned, withdrawable research consent;
   - user search and an admin activity log.
4. **Mood and memory book**:
   - a daily optional mood question on Home (Good / Okay / Not so good / Skip), shown to caregivers and in the doctor report, with no alert changes;
   - a reminiscence "Memories" book (photos, story, optional family voice note), placed without breaking the 3-button Home.
5. **Hindi and Urdu**:
   - i18n for the patient screens and read-aloud;
   - the caregiver UI in English and Hindi;
   - Urdu right-to-left with Noto Nastaliq Urdu, Hindi with Noto Sans Devanagari;
   - localised game content;
   - a translation review file at `docs/i18n/review.md`, marked "draft — needs native-speaker review".
