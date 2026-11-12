# UI audit, batch 3: before and after

Patient screens are at 375 × 812 and caregiver screens at 1280 × 800. Every shot is rendered from the page with the same tool, before and after. In the 1280 px images, a few short labels wrap ("Memory / Match", "Family / photos"). That wrapping comes from the screenshot renderer; the live page lays them out on one line.

| Screen | Before | After |
|---|---|---|
| Start page (pairing) | ![](before-pair-device-375.png) | ![](after-pair-device-375.png) |
| Patient Home | ![](before-patient-home-375.png) | ![](after-patient-home-375.png) |
| Today's games | ![](before-patient-games-375.png) | ![](after-patient-games-375.png) |
| Today's reminders | ![](before-patient-reminders-375.png) | ![](after-patient-reminders-375.png) |
| Who is this? grid | ![](before-who-is-this-grid-375.png) | ![](after-who-is-this-grid-375.png) |
| Who is this? photo | ![](before-who-is-this-photo-375.png) | ![](after-who-is-this-photo-375.png) |
| Find the Pairs | ![](before-memory-match-375.png) | ![](after-memory-match-375.png) |
| Follow the Colours, a tile lit | ![](before-sequence-lit-375.png) | ![](after-sequence-lit-375.png) |
| Remember the Words, pick list | ![](before-word-recall-pick-375.png) | ![](after-word-recall-pick-375.png) |
| About Today, a question | ![](before-about-today-question-375.png) | ![](after-about-today-question-375.png) |
| End of a session | ![](before-end-screen-375.png) | ![](after-end-screen-375.png) |
| Caregiver dashboard | ![](before-caregiver-dashboard-1280.png) | ![](after-caregiver-dashboard-1280.png) |
| Caregiver patient page | ![](before-patient-detail-1280.png) | ![](after-patient-detail-1280.png) |
| Caregiver reminders | ![](before-caregiver-reminders-1280.png) | ![](after-caregiver-reminders-1280.png) |
| Caregiver family | ![](before-caregiver-family-1280.png) | ![](after-caregiver-family-1280.png) |

## What changed

**Theme (`frontend/src/theme.css`)**
- Every colour and font is a token. Light mode only.
- **Patient side:** warm paper canvas and Atkinson Hyperlegible.
- **Caregiver side:** a quieter near-white canvas, Inter and tabular numbers.
- **Shared:**
  - a calm deep-indigo primary;
  - a warm marigold accent for celebration, hints and the focus ring;
  - calm green for done and matched;
  - a danger red used on the caregiver side only.
- Text selection and the input cursor use the theme too.
- Contrast is documented in the file: ink 15:1, secondary text 9:1, muted text 5.6:1, white on indigo 9:1.
- Fonts are self-hosted with `@fontsource` (Latin subset only).

**Caregiver status, one scale**
- Each game and the overall index use the same words and thresholds: Stable, Watch, Declining, and Learning before a baseline exists.
- Each badge says what it describes: "This game: Watch", "Overall: Watch". When they differ, one line says why.
- Alerts keep their own warning/critical thresholds.

**Alerts link to charts**
- Each line about a game has a "See … chart" button. It scrolls to that game's chart and rings it in marigold for 2 seconds (an instant jump when reduced motion is on).
- Alert cards use a full border and a severity icon instead of the thick left stripe the detector flagged.

**Polish**
- One date format across the caregiver patient page: Indian order, no seconds. Chart tooltips match.
- Disabled buttons look clearly disabled instead of faded.
- The heading in the caregiver header doesn't wrap.
- Headings wrap evenly, and body text avoids a lone last word.
