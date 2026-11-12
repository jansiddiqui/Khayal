# Screenshots for the report

Patient screens are 375 × 812 (a phone) with Read aloud on, signed in as Kamala Devi (demo patient). Caregiver screens are 1280 wide, signed in as Priya Sharma (demo caregiver), and show the full page. The data is the 90-day simulated demo history (`python -m app.seed --demo-history`).

## Patient

| # | Screen |
|---|---|
| 01 | Set up this device (6-digit pairing code from the caregiver) |
| 02 | Home: next reminder, today's progress, 3 big buttons |
| 03 | Today's games: About Today, two games, the weekly voice task in slot 3 when due |
| 04 | Find the Pairs (Memory Match): looking at the cards |
| 05 | Follow the Colours (Sequence Recall) |
| 06 | Remember the Words (Word Recall): one word at a time |
| 07 | Remember the Words: picking the words seen |
| 08 | About Today (Daily Orientation): a question with "Say it again" |
| 09 | Tap When Green (Reaction Tap) |
| 10 | End of a session: kind words and "Next game" |
| 11 | Today's reminders |
| 12 | Who is this? (family photos; demo photos are plain silhouettes) |
| 13 | Who is this? one person, read aloud |
| 14 | Tell me about a picture (weekly voice task) |

## Caregiver

| # | Screen |
|---|---|
| 15 | Dashboard: patients with Stable / Watch / Declining |
| 16 | Patient page, declining patient (Shanti, moderate profile): summary, alerts, index chart, open game charts |
| 17 | Patient page, stable patient (Rahim, healthy profile): game cards collapsed |
| 18 | Patient page (Kamala): levels and session history, voice recordings, settings |
| 19 | Reminders |
| 20 | Family photos |
| 21 | Patient page on a phone (375 px): stacked session list, no sideways scroll |

The screenshots are rendered from the page itself, so the browser's own `<audio>` controls appear as an empty grey bar, and caregiver times are in the screenshot browser's time zone (UTC).
