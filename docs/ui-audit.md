# Khayal UI audit

Date: 12 Nov 2026 · Branch: `wip-decline-v2` · No code was changed for this audit.

**Method.** We ran `/impeccable audit` and `/impeccable critique` on every screen listed below, plus a rule-by-rule check against CLAUDE.md section 4.

- **Critique.** It ran as two separate reviews, as Impeccable's critique method requires:
  - A: a design review from the screenshots and the source code.
  - B: the Impeccable detector, `impeccable detect --json frontend/src`.
- **Audit.** The technical audit used two sources: measurements in the live app (font sizes, button heights, text contrast, and what sits below the fold) and a review of the frontend code.
- **Viewports.** Patient screens were tested at **375 × 812** (phone) and caregiver screens at **1280 × 800** (laptop).
- **Accounts.** Patient: Kamala (`kamala@khayal.test`, MCI profile, 3 family members, 4 reminders). Caregiver: Priya (`caregiver@khayal.test`).
- **Not run.** No PRODUCT.md or DESIGN.md exists yet, so the code itself was the design context. The detector's in-browser overlay was not run, because the one browser tab was being used for the screenshots.

---

## 1. Scores

| | Score | Band |
|---|---|---|
| Technical audit (`/impeccable audit`) | **13 / 20** | Acceptable |
| Critique, patient side (Nielsen heuristics) | **26 / 40** | Acceptable |
| Critique, caregiver side (Nielsen heuristics) | **26 / 40** | Acceptable |

### Technical audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Text sizes, button sizes and focus rings meet section 4. The exceptions:<br>• Sequence Recall's lit tiles fail contrast (white on `green-500` ≈ 2.3:1).<br>• Read aloud never speaks game questions or answer choices. |
| 2 | Performance | 3 | No layout thrashing or heavy effects. The production JS bundle is a single chunk over 500 kB, because Recharts loads on patient screens too (Vite build warning). |
| 3 | Theming | 2 | There are five colour tokens in `index.css`, but most colours are raw Tailwind palette classes, plus 11 hard-coded hex values in the TSX files. There is no dark mode; dark mode is not required. |
| 4 | Responsive | 2 | There is no horizontal scroll, but key buttons fall below the fold at 375 × 812: the Word Recall "Done" button, the 4th About Today answer, Memory Match card 10, and Register's submit button. The patient Home screen fits only just (about 810 of 812 px). |
| 5 | Implementation integrity | 3 | The detector found one issue: a thick coloured left border on caregiver alerts (`PatientDetail.tsx:125`). It is low impact, because the severity is also written as a word. No other issues were found, and nothing on any patient screen. |

**Implementation integrity verdict: pass.** The patient side is a real, enforced system:
- the root font is 20px (`index.css:13`) and `BigButton` is at least 80px tall with a required label;
- the same top bar appears on every screen, with a 4px amber focus ring;
- all patient text is in `copy.ts`.

What it lacks is visual character, not consistency (see section 4).

---

## 2. CLAUDE.md section 4 check (patient screens)

| Rule | Result | Evidence |
|---|---|---|
| Base font ≥ 20px | ✅ Pass | The smallest measured text is 25px (Memory Match card labels are 20px). |
| Headings ≥ 32px | ✅ Pass | h1 is 45px. |
| Buttons ≥ 64px tall | ✅ Pass | Buttons are 80–120px tall; the top bar is 86px; game pieces are at least 96px. |
| Full-width buttons on mobile | ✅ Pass | `BigButton` is `w-full`. Game pieces are grids by design. |
| High contrast (WCAG AA), no grey-on-grey | ❌ Fail | During Sequence Recall playback, white text sits on `green-500` / `red-500` / `blue-500` (≈ 2.3–3.7 : 1), and the other tiles are dimmed to 70% opacity (screen 08). All other measured text is ≥ 4.5 : 1. |
| No text on images | ⚠️ Fail in demo data | The placeholder family photos have the person's name printed on them (screens 18, 21, 22). On the About Today "Who is this?" question (screen 18), this gives away the answer. |
| One main action, at most 3 buttons visible | ❌ Fail | Memory Match: 13 buttons (screen 06). Word Recall pick list: 12 (13). Word Recall stars: 8 (12). About Today: 4 answers (17).<br>**Product decision needed:** do game pieces count toward the limit? The pick list and the 4-option questions break the rule either way. |
| No time pressure (except Reaction Tap) | ⚠️ Partial | No countdown is shown anywhere. But three steps end on a timer: the Memory Match preview, Word Recall's 2-second words, and its 15-second distraction (screens 05, 11, 12). |
| No negative words; end on encouragement | ✅ Pass | "Let's try another.", "Wait for green." The ending "Let's keep it comfortable." is weak but not negative. |
| Icons and words together | ✅ Pass | `BigButton` requires a label. Face-down cards show "?" with an `aria-label`. |
| Big Home button, always in the same place | ✅ Pass | The same top bar is on every screen. It also appears on Home itself, where it does nothing, and "Who is this?" adds a second Back button (screen 22). |
| Read aloud, toggled from Home | ⚠️ Partial | The toggle is in the top bar on every screen. In games, though, only the page title and the feedback are spoken. The question and the answer choices are never read (`games/*` never call `speak`). |
| Home layout: reminder card + exactly 3 buttons | ✅ Pass (tight) | All of it fits at 812px tall. On a 667px phone (iPhone SE), "Who is this?" would fall below the fold. |
| Voice task not on Home | ✅ Pass | |

---

## 3. Top 10 problems, ranked by impact on an elderly user

**1. [P1] The Memory Match board doesn't fit on screen during the timed preview.** Screens 05–06 · `/impeccable adapt`

- **What's wrong:**
  - At level 5 (10 cards) the page is 1,090px tall, so card 10 and "Show me again" are below the fold.
  - The preview hides the cards automatically (6s at level 1, down to 2.4s; `memoryMatch/logic.ts:66-72`), while the patient may still be scrolling.
- **Why it matters:**
  - The patient can't memorise a card they can't see, and feels they failed before they started.
  - It also adds noise to the score that decline tracking uses.
- **Fix:**
  - Size the board to the screen: 4 columns from 8 cards, and card size based on the available height.
  - Use a "play mode" header without the h1.
  - Let the patient end the preview with "I'm ready" instead of a timer.

**2. [P1] Answer and Done buttons fall below the fold.** Screens 13, 17, 18, 02 · `/impeccable layout`

- **What's wrong:**
  - Word Recall "Done" is at y = 980 on an 812px screen.
  - About Today's 4th answer is off-screen.
  - On the "Who is this?" question, the photo pushes 2 of the 3 names below the fold.
  - On Register, the role choice and "Create account" are hidden.
- **Why it matters:** many older users don't know to scroll. They think the screen is stuck, or that there is no way forward.
- **Fix:**
  - During play, hide the h1 and shrink "Round x of 5" to one line.
  - Use 2-column grids for short answers.
  - Put a sticky bottom bar on the screen's one committing action.
  - Offer 3 options instead of 4.

**3. [P1] In Sequence Recall, the patient can barely see which tile lights up, and one wrong tap ends the round.** Screens 08–10 · `/impeccable colorize`

- **What's wrong:**
  - The lit state uses a *lighter* shade (`red-500`, `blue-500`, `green-500`, a pale `yellow-200`; `sequenceRecall/logic.ts:8-11`), while the other tiles drop to 70% opacity. White on `green-500` is about 2.3 : 1, and the lit yellow looks weaker than the idle yellow.
  - One wrong tap replaces the board immediately (`SequenceRecall.tsx:58-61`), and the correct order is never shown.
- **Why it matters:** seeing the lit tile is the whole task. A patient with low vision fails because of the colour, not their memory.
- **Fix:**
  - Keep idle tiles at full contrast.
  - Mark the lit tile with a white glow ring, a 1.1× scale and a "●" marker, and say its colour when read-aloud is on.
  - After a miss, replay the correct order calmly.

**4. [P1] Read aloud skips the game questions and answers.** Screens 11, 13, 17, 18 · `/impeccable harden`

- **What's wrong:**
  - `speak()` is only called by `Layout` (page title / intro), `GameSession` (feedback and end message) and the patient Reminders page.
  - "What day of the week is it today?", the answer choices, the Word Recall words and "Which words did you see?" are never spoken.
  - Speech always uses the browser's default voice and language (`ReadAloudContext.tsx:47`).
- **Why it matters:** the patients who turn read-aloud on are the ones who can't comfortably read the screen, and they get the title but not the task.
- **Fix:**
  - Speak each question and its choices when they appear, and offer a "Say it again" control.
  - Set `utterance.lang` (`en-IN` now, `hi-IN` once the Hindi copy exists).

**5. [P1] The patient signs in with email and password.** Screens 01–02 · `/impeccable onboard` · *needs a product decision*

- **What's wrong:** nothing stops a person with dementia from being logged out and asked for credentials they won't remember.
- **Why it matters:** if the token expires, the patient is locked out until a caregiver comes.
- **Fix:** let the caregiver create the patient's account and set up the device (a long-lived session on the patient's own device, with re-login handled by the caregiver). An optional picture or PIN login could come later.

**6. [P1] The family photo is small on "Who is this?".** Screens 22, 18 · `/impeccable layout`

- **What's wrong:** the photo is capped at `h-[30vh]` (`WhoIsThis.tsx:32`), so 244 × 244 px on a phone. That is about a third of the screen, not full screen.
- **Why it matters:** recognising the face is the whole point, and this user group often has low vision.
- **Fix:**
  - Make the photo full width, with the name and relation in large type underneath.
  - Replace the duplicate Back button with "Next person" or a swipe.
  - Add more space between the statement and the note.

**7. [P2] Word Recall overloads working memory and has hidden timers.** Screens 11–13 · `/impeccable distill`

- **What's wrong:**
  - Each word auto-advances after 2s.
  - The 15-second star distraction has no end cue, and its tall narrow pill buttons with empty grid cells look broken.
  - The patient must then multi-select from 10 toggles, plus a hint, plus "Done".
- **Why it matters:** the task measures how well the patient copes with the screen as much as their memory. It is also the most tiring game in a session.
- **Fix:**
  - Advance on "Next word", or slow the timing.
  - Make the distraction one star at a time, full width.
  - Ask one word at a time: "Did you see *Kettle*? Yes / No".

**8. [P2] Feedback is flat and repetitive, and the end screen pushes "Play again".** Screens 07, 10, 16, 19 · `/impeccable delight`

- **What's wrong:**
  - The same card appears after every round ("Well done!" / "Let's try another." + "Next one"), which adds 4 extra taps per session.
  - The closing line "Nice playing! Let's keep it comfortable." (`copy.ts:43`) is vague and hints that the patient didn't progress.
  - "Play again" is the main button on the end screen.
- **Why it matters:** the end of a session is what the patient remembers. For a user who tires easily, it should feel like a rest, not a prompt to keep going.
- **Fix:**
  - Vary the encouragement, and name what was achieved ("You found all 5 pairs").
  - Move to the next round on its own after about 2 seconds, still showing a Next button.
  - End with "Lovely work today", and make "Back to games" or Home the main button.

**9. [P2] Game names and icons don't say what the patient will do.** Screen 04 · `/impeccable clarify`

- **What's wrong:**
  - "Sequence Recall", "Word Recall" and "Reaction Tap" are clinical names.
  - The 🟦 icon means nothing.
  - Platform emoji vary between devices, and some are faint (🔈 in the top bar).
  - "Read aloud: Off" states the current state rather than the action.
- **Why it matters:** the patient chooses from this list every day, and a name they can't picture means they must remember what each game is.
- **Fix:**
  - Use task names: "Find the pairs", "Copy the colours", "Remember the words", "Tap the green circle", "About today", each with a one-line subtitle.
  - Use one consistent inline-SVG icon set.
  - Label the toggle "Read aloud: On/Off" with a clearer on/off visual.

**10. [P1, caregiver] The status words contradict each other, and alerts aren't linked to their evidence.** Screen 24 · `/impeccable clarify`

- **What's wrong:**
  - Per-game "Stable" at z = −1.4 sits next to an overall "Watch" at −1.2.
  - The game scale says "Warning" where the overall scale says "Watch" (`components/caregiver/Status.tsx`).
  - The charts show jagged raw scores, while alerts are based on the undrawn 5-session rolling mean.
  - "z" and "composite" mean nothing to an adult child.
- **Why it matters:** the caregiver acts for the patient. If the numbers seem to disagree, they stop trusting the alerts.
- **Fix:**
  - Use one 3-word scale everywhere.
  - Draw the rolling mean in bold over faint raw points.
  - Make each alert scroll to and highlight its game chart.
  - Lead with a plain sentence ("Word Recall scores are lower than her usual"), with the z on a second line.

### Other findings (lower impact)

**Caregiver side**
- Patient detail is about 4,000px of blocks with equal weight: alerts → index → 5 charts → levels → 236 sessions → settings. Add a summary strip at the top, and tabs or anchors (Overview / Games / Sessions / Settings). `/impeccable layout`
- The dashboard can't triage several patients: no last-played date, no new-alert count, no adherence, no sort. `/impeccable layout`
- Alert timestamps show US date order with seconds (`11/12/2026, 3:53:59 AM`). Use `12 Nov, 3:53 am` for Indian users. `/impeccable polish`
- When pinning is automatic, the "Pin games" selects show *Memory Match / Memory Match*, which reads like a real choice. `/impeccable clarify`
- The disabled "Add" button is a pale blue that looks broken rather than disabled. `/impeccable polish`
- The detector's `side-tab` finding: the thick left border on alerts. Low impact; `/impeccable polish`.
- A single-game alert is shown as a one-item bullet list. `/impeccable polish`
- The caregiver screens were not checked at phone width. The dense tables and the 236-row inline scroller probably need `/impeccable adapt`.

**Patient side**
- The Home button appears on Home itself, where tapping it does nothing.
- The Reaction Tap "Don't tap" state is a large saturated red circle, which can startle an anxious user. A calm grey/blue "✋ Wait" would do the same job.
- The **demo seed** photos have names printed on them. Real photos won't, but the demo and the report screenshots give away answers. *Seed data, not UI.*

---

## 4. Proposed visual direction

### Patient side: warm, domestic, unhurried

The content already feels specific to Khayal: chai, diya and auto-rickshaw cards, Indian seasons, "Rahul, your grandson, visits on Sundays". The visuals are still a generic accessibility kit: a cream page, `blue-700` buttons, `rounded-2xl`, and platform emoji. The aim is a place that feels like home.

- **Colour**
  - Warm paper background `#FBF6EC` and near-black ink `#1C1A17`.
  - One deep, warm action colour, indigo `#23308C` (or teal `#0F5E5A`), with white text well above AA.
  - A marigold accent `#E8A33D` for success and celebration.
  - No saturated red anywhere.
  - Sequence tiles: four deep, AA-safe hues, each with its own shape marker.
- **Type**
  - A humanist sans that has a matching Devanagari version for the planned Hindi copy: Noto Sans + Noto Sans Devanagari, or Mukta. Self-hosted fonts are a new dependency, so they need your approval.
  - Body 24px with line-height 1.4; questions 32px semibold; h1 40px.
  - Hide the h1 during play, so the board gets the screen.
- **Spacing**
  - 20–24px gaps and a 16px side gutter.
  - A "play mode" with a compact top bar, so every game fits **375 × 667** without scrolling.
- **Icons**
  - One outlined inline-SVG set (2px stroke, ink colour) for navigation and actions.
  - Keep emoji only for the playful card faces.
- **Tone and motion**
  - Greet by time of day ("Good morning, Kamala").
  - Name what was achieved, and never hint at levels.
  - End sessions on rest.
  - Gentle 200–300ms fades between steps; no flips or shakes; respect `prefers-reduced-motion`.

### Caregiver side: calm, clinical clarity

- **Colour**
  - White and slate (`#0F172A` text, `#64748B` secondary) with one blue for actions.
  - The existing status colours (good `#0ca30c`, warning `#fab219`, critical `#d03b3b`) are used only for status, always with a shape and a word.
- **Type**: system UI or Inter at 15–16px, with tabular numerals for scores, times and dates.
- **Structure**
  - A summary strip first: status word, one sentence on what changed, a suggested next step, last played.
  - Then small-multiple trend charts: a bold rolling mean, faint raw points and the baseline band.
  - Sessions and settings go in tabs; the session table is paginated.
- **Tone**: plain words first, statistics second. Each alert offers a next step as well as "Acknowledge".

---

## 5. Recommended order

1. **[P1] `/impeccable adapt`**: a play mode that fits each game board on a 375 × 667 screen (problems 1, 2).
2. **[P1] `/impeccable layout`**: answers above the fold, a sticky Done button, the full-width family photo (problems 2, 6).
3. **[P1] `/impeccable colorize`**: Sequence Recall lit and idle states (problem 3).
4. **[P1] `/impeccable harden`**: read-aloud for every question and answer, plus the speech language (problem 4).
5. **[P1] `/impeccable onboard`**: patient sign-in, after the product decision (problem 5).
6. **[P1] `/impeccable clarify`**: caregiver status words and alert-to-chart links (problem 10), then game names (problem 9).
7. **[P2] `/impeccable distill`**: Word Recall (problem 7).
8. **[P2] `/impeccable delight`**: feedback and end of session (problem 8).
9. **`/impeccable typeset`**: apply the new type scale and fonts once the font dependency is approved.
10. **`/impeccable polish`**: final pass, including the lower-impact items above.

Running `/impeccable init` first would record PRODUCT.md (audience, tone, constraints), so every later command works from the same brief.

---

## 6. Screens

Patient screens are 375px wide. The .jpg files are browser captures at 1.25× and show the first screenful.

| | | |
|---|---|---|
| ![](ui-audit/01-login-375.jpg) 01 Login | ![](ui-audit/02-register-375.jpg) 02 Register | ![](ui-audit/03-patient-home-375.jpg) 03 Patient Home |
| ![](ui-audit/04-patient-games-375.jpg) 04 Today's games | ![](ui-audit/05-memory-match-preview-375.jpg) 05 Memory Match preview | ![](ui-audit/06-memory-match-round-375.jpg) 06 Memory Match round |
| ![](ui-audit/07-memory-match-feedback-375.jpg) 07 Memory Match feedback | ![](ui-audit/08-sequence-watch-375.jpg) 08 Sequence Recall playback | ![](ui-audit/09-sequence-your-turn-375.jpg) 09 Sequence Recall your turn |
| ![](ui-audit/10-sequence-feedback-375.jpg) 10 Sequence Recall feedback | ![](ui-audit/11-word-recall-show-375.jpg) 11 Word Recall word | ![](ui-audit/12-word-recall-stars-375.jpg) 12 Word Recall distraction |
| ![](ui-audit/13-word-recall-pick-375.jpg) 13 Word Recall pick list | ![](ui-audit/14-reaction-wait-375.jpg) 14 Reaction Tap wait | ![](ui-audit/15-reaction-dont-tap-375.jpg) 15 Reaction Tap "Don't tap" |
| ![](ui-audit/16-reaction-feedback-375.jpg) 16 Reaction Tap feedback | ![](ui-audit/17-about-today-question-375.jpg) 17 About Today question | ![](ui-audit/18-about-today-who-is-this-375.jpg) 18 About Today "Who is this?" |
| ![](ui-audit/19-about-today-end-375.jpg) 19 End of session | ![](ui-audit/20-patient-reminders-375.jpg) 20 Today's reminders | ![](ui-audit/21-who-is-this-grid-375.jpg) 21 Who is this? grid |
| ![](ui-audit/22-who-is-this-photo-375.jpg) 22 Who is this? photo | | |

Caregiver screens are 1280px wide:

- **23 Dashboard** (viewport capture): ![](ui-audit/23-caregiver-dashboard-1280.jpg)
- **24 Patient detail** (full page): ![](ui-audit/24-patient-detail-1280.png)
- **25 Reminders** (full page): ![](ui-audit/25-caregiver-reminders-1280.png)
- **26 Family** (full page): ![](ui-audit/26-caregiver-family-1280.png)

The full-page caregiver images (24–26) were rendered from the page's DOM with Impeccable's bundled `modern-screenshot`, because the browser pane couldn't capture 1280px reliably. The renderer wraps some short labels onto two lines ("Memory / Match", "Priya / Sharma", "Add / photo"). Those wraps are **artifacts of the capture**, not of the live page, and they are not counted as findings.

---

## Run notes

- **Demo data refreshed.** The demo history ended on 4 Nov, so it was reloaded with `python -m app.seed --demo-history --reset` to run up to yesterday. A backup was saved first: `data/khayal.backup-before-ui-audit.db`.
- **Audit side effect.** Playing one round of each game left four "Stopped early" sessions and one completed About Today session in Kamala's history for 12 Nov (visible in screenshot 24).
- **Critique questions skipped:** you asked for a single report and then a stop, so the critique's follow-up questions weren't asked, and no `.impeccable/critique` snapshot was written.
- **Not tested:** real touch gestures (taps were synthesised), screen readers, and caregiver screens at phone width.
