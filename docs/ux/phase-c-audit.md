# Phase C audit: daily-use experience

Branch `ux-phase-c`. This document covers the walkthrough before the redesign, what was fixed, how it was checked, and what is still open.

Screens were checked at two sizes:
- patient screens at 375 × 812, in a paired demo browser;
- caregiver screens at 1280 × 900.

Screenshots were taken with reduced motion, so every frame is settled:
- before: `docs/ux/before/`
- after: `docs/ux/after/`
- short flows (GIF): `docs/ux/flows/`

## 1. Scores

| Measure | M9 UI audit | Phase C before | Phase C after |
|---|---|---|---|
| Critique (Nielsen, /40) | 26 patient, 26 caregiver | 24 | **28 overall** (29 patient, 29 caregiver) |
| Technical audit (/20) | 13 | not run | **14** |

**How the "after" scores were made:** independent reviewers who had not seen the "before" reports.
- The critique used the dual-agent method: A did a design review in the browser; B ran the detector and collected browser evidence.
- The technical audit was a separate run.
- The fixes in section 3 were made **after** these scores were taken, so the 28 and 14 do not include them.

## 2. Walkthrough before the redesign (what was wrong)

| Problem | Where it showed up |
|---|---|
| **(a) Taps with no visible result** | Answers, colour tiles, BigButtons and the top-bar Home had no press state.<br>Home pressed while on Home did nothing.<br>Caregiver saves, deletes and acknowledgements were silent. |
| **(b) Unexplained waits** | Loading was bare "Just a moment…" text.<br>The full page flashed on hard navigation.<br>The caregiver form was pushed down when the adherence card loaded late. |
| **(c) Lost place** | The demo banner toggled between question and reply screens: a jump of about 90px every round.<br>A Done reminder card jumped to the bottom with its thank-you off-screen.<br>Back on "Who is this?" left the page.<br>"Next one" sat where the next board's answers appear, so a double tap answered the next round.<br>The long caregiver patient page had no in-page navigation. |
| **(d) Never told what happened** | No toast after adding a reminder.<br>A native `confirm()` with no undo.<br>"Declining" shown with "No alerts" and no reason.<br>A 9:00 AM medicine still said "Now" at 9 PM.<br>A family member added without a photo silently never appeared in "Who is this?". |

## 3. What was done

### Shared components (`frontend/src/ui/`), used across the app

| Component | What it does |
|---|---|
| `Button` | Variants primary, secondary, quiet, danger. Hover lift, press 0.97, focus ring. A loading spinner at the same size, no double submit, a disabled state, and a success tick (`successLabel`). |
| `Toast` | Undo for deleting a reminder or a person. Undo now confirms "Undone. It's back." Pending deletes are sent when the page is closed. |
| `Skeleton` / `PageSkeleton` | Skeleton loaders that reserve height, so nothing jumps. |
| `EmptyState` / `ErrorState` | One action each; the error state has "Try again". |
| `TextInput` / `SelectInput` | Inline validation on blur. |
| `ConfirmDialog` | Only for destructive actions, with the consequence written out. |
| `CountUp` | Numbers count up once. |
| `motion.ts` | One motion grammar: one easing curve, durations from 120 to 400 ms, `pressable` and `liftOnHover`. Everything turns off under reduced motion. |
| `feedback.tsx` | Optional vibration (on by default) and soft sound (off by default), in a settings sheet next to Read aloud. |

### Patient side

**Moving around**
- Page transitions of 280 ms.
- Home pressed while on Home scrolls to the top and gently nudges the heading.
- "Who is this?" keeps the open photo in the address, so Back returns to the grid.

**Home**
- A greeting by time of day.
- Progress rings inside "Play a game" and "Today's reminders".
- "Next reminder" never shows an overdue reminder as "Now".

**Games**
- Play mode stays on for the whole session, so the banner no longer jumps between rounds.
- A chosen answer is held for 650 ms: a calm glow when right, a gentle nudge otherwise. It stays 650 ms under reduced motion too: less movement, not less time.
- Taps are ignored for 300 ms after a new board appears, so a double tap can't answer the next round.
- Card flips. A mismatched pair stays visible for 2 s.
- Sequence Recall flashes each tapped tile and shows "2 of 3".
- A calm end celebration.

**Reminders** ("ask, don't urge", CLAUDE.md section 6)
- An overdue reminder asks "This was for 9:00 AM. Is it done?". The answers are "Yes, it's done" and "No / not sure".
- One reminder is asked about at a time, with "1 more reminder after this one." below it, so every answer button is above the fold at 375 × 812.
- The heading is "Earlier today" for overdue reminders and "Now" only for due ones.
- After a "not sure", the patient sees "That's everything for now. Your family will help with the rest." instead of "All done… Well done!".
- Done ticks in place with a drawn check.

**Other screens**
- Pairing: shows how many digits are typed, uses kinder error copy, and ends on an "All set" screen.
- Voice task: a microphone heads-up line before recording starts.
- Games list: the intro paragraph was removed, so all three buttons fit.

### Caregiver side

**Layout**
- Hover states on rows, links and session rows.
- An active underline in the navigation and a fade between pages.
- A skip link ("Skip to content").

**Dashboard**
- Clickable rows with a "Today" column.
- Sorted worst status first: Declining, then Watch, Stable, Learning.
- The "Add another person" form opens only when it is needed.
- Refreshes every 60 s and shows "Last updated".

**Patient page**
- Live state, for example "Active today, 9:40 AM".
- Skeletons that reserve height (layout shift dropped from 0.48 to 0.005).
- An explanation of the 3-in-a-row alert rule beside "No new alerts".
- Pin games is hidden behind "Choose games to pin".
- Only the overall index line draws in; the numbers count up.

**Reminders**
- Optimistic create, edit, pause and delete, with Undo on delete. The saved row is highlighted for 2 s.
- The toast says "Saved" for an edit, and "Paused" or "Resumed" only for the toggle.
- The "Today" column now says:
  - "Not answered yet" once a reminder is an hour past its time;
  - "Done, confirmed later at …";
  - "Not sure (family told)".
- A safe late window for medicine.

**Family**
- Photos can be added inside the "Add a person" form, by drag and drop, with thumbnails and progress.
- When family photos are off, a "Turn on family photos" button.
- A note when a person has no photo yet.
- Optimistic edits; Undo on removing a person or a photo.
- Each "Add photos" input names the person it belongs to.

**Pairing**
- Polls while a code is valid and shows "Paired just now".

**Times**
- Server timestamps without an offset are read as UTC (`serverDate`), so times are no longer shown 5.5 hours off.

**Theme**
- Reaction Tap colours are theme tokens (`--color-go`, `--color-stop`).
- Admin uses a skeleton instead of "Loading…".
- The patient page title shows "Patient" while loading.

### Backend (for the overdue model)

- **New fields:** `ReminderLog.late`, `Reminder.late_window_minutes`, status `unsure`, and alert type `reminder_unsure`. Migration `0011_overdue_reminders`.
- **Reminder phases:** upcoming, due, overdue, done, unsure.
- **Missed logging** waits for 2 hours or the safe late window, whichever is longer.
- **Superseded doses:** an earlier dose is hidden once a later dose of the same medicine is due.
- **Device activity:** `last_active_at` on the caregiver patient list.

### Review findings checked and found false

| Finding | What the code actually has |
|---|---|
| "Settings sheet is a plain div" | It is a `<dialog>` opened with `showModal()` and handles Escape (`onCancel`). |
| "Reminder radios are unlabelled" | Each radio is inside its `<label>`. |
| "Pairing input has no name" | It is inside a `<label>` with the code text. |
| Detector `border-accent-on-rounded` on `SettingsSheet.tsx` | A full 4px border whose bottom edge is dropped only while it is a bottom sheet. It is not an accent stripe. |

## 4. Detector

`impeccable detect` on the app sources (patient, caregiver, components, games, ui, admin) found one issue, the false positive listed above.

The browser overlay in the before run found:
- two nested cards on the dashboard;
- one low-contrast placeholder on the Family page.

Both were fixed as part of the dashboard and Family rewrites.

## 5. Performance (headless Chrome, 4× CPU slowdown)

Two measurements:
- frame rate from `requestAnimationFrame`, as average fps and the 95th-percentile frame time;
- layout shift (CLS) from the browser's layout-shift entries.

| Flow | fps | p95 frame | CLS |
|---|---|---|---|
| Patient: Home → Games (page transition) | 53 | 33 ms | 0 |
| Patient: Find the Pairs (card flips) | 51 | 17 ms | 0.21* |
| Patient: About Today (answer glow and reply) | 55 | 17 ms | 0.21* |
| Patient: settings sheet | 51 | 17 ms | 0 |
| Caregiver: dashboard → patient page (charts) | 25 | 134 ms | 0.005 (was 0.48) |

\* The game "shift" happens once, when play mode hides the demo banner after Start. That behaviour is decided in CLAUDE.md section 2. Within play there are no shifts.

The caregiver patient page is the one flow below 60 fps. Its first render of five Recharts charts costs about 130 ms per frame at 4× slowdown. At normal speed it renders in one pass.

## 6. Tests

- Frontend: 182 passing (Vitest). New tests cover:
  - one reminder at a time and "Earlier today";
  - "Your family will help with the rest";
  - "Not answered yet";
  - the Undo toast;
  - optimistic edits.
- Backend: 6 new overdue-reminder tests. The full suite runs on SQLite and on PostgreSQL.

## 7. Still open (not fixed in Phase C)

**Patient**
- "Round 1 of 5" disappears on the reply card.
- "Well done!" repeats after every Find the Pairs round.
- 5 rounds of 5 pairs may be long for MCI. This is a product question for Games v2.
- Memory card art renders at about 47px with 10 cards, below the 60px target.
- Family silhouettes use off-palette blue, magenta and green.
- The relation list lacks daughter-in-law, son-in-law, sister, brother and nephew.
- The 108px top bar: "Read aloud: Off" wraps to two lines on phones.

**Caregiver**
- The patient page is long.
- Repeat alerts are not grouped, and there is no "Acknowledge all".
- The disclaimer repeats under every alert. This is decided in section 11, so it stays.
- The add-reminder toast can cover the row it just added.
- A newly added family member lands off-screen without a scroll.

**Performance**
- The first render of the caregiver patient page is below 60 fps at 4× slowdown.

These are candidates for Games v2 step 2 and a later caregiver "distill" pass.
