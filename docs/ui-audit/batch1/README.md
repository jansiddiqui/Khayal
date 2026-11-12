# UI audit, batch 1: before and after (375 × 812)

These are the fixes with the most impact on patients, from [the UI audit](../../ui-audit.md).

**How the screenshots were made**
- The "before" shots are the audit captures of the same code, taken earlier on 12 Nov 2026.
- The "after" .jpg files are browser captures.
- The "after" .png files were rendered from the page itself at 2×. This was the only reliable way to catch a Sequence Recall tile while it was lit.
- Memory Match, Word Recall and Sequence Recall were shot at **level 10**, the worst case, as well as at the patient's normal level.

| Screen | Before | After |
|---|---|---|
| Memory Match, cards up | ![](before-memory-match-preview-375.jpg) | ![](after-memory-match-preview-level4-375.jpg) ![](after-memory-match-preview-level10-375.jpg) |
| Memory Match, finding pairs | ![](before-memory-match-round-375.jpg) | ![](after-memory-match-round-level10-375.jpg) |
| Sequence Recall, a tile lit | ![](before-sequence-watch-375.jpg) | ![](after-sequence-watch-lit-375.png) |
| Sequence Recall, after a wrong tap | ![](before-sequence-feedback-375.jpg) | ![](after-sequence-replay-lit-375.png) |
| Word Recall, a word | ![](before-word-recall-show-375.jpg) | ![](after-word-recall-show-375.jpg) |
| Word Recall, stars | ![](before-word-recall-stars-375.jpg) | ![](after-word-recall-stars-375.jpg) |
| Word Recall, pick list | ![](before-word-recall-pick-375.jpg) | ![](after-word-recall-pick-level10-hint-375.jpg) |
| About Today, a question | ![](before-about-today-question-375.jpg) | ![](after-about-today-question-375.png) |
| About Today, "Who is this?" | ![](before-about-today-who-is-this-375.jpg) | ![](after-about-today-who-is-this-375.png) |
| Who is this? grid | ![](before-who-is-this-grid-375.jpg) | ![](after-who-is-this-grid-375.png) |
| Who is this? photo | ![](before-who-is-this-photo-375.jpg) | ![](after-who-is-this-photo-375.png) |
| Register | ![](before-register-375.jpg) | ![](after-register-375.png) |

## What changed

**Play mode**
- While a round is on screen, the page is exactly one screen tall. The heading is kept for screen readers only, and the game uses the rest of the space.
- Measured at 375 × 812, at the patient's normal level and at level 10, every board, answer and commit button ends at y ≤ 797 on an 812px screen.
- Buttons in play mode are 64px tall with 25px text (section 4 allows 64px and above).

**Memory Match**
- No preview timer. The cards stay up until the patient taps "I've looked — hide the cards".
- The board is sized to the screen: 2, 3 or 4 columns. Card positions don't move between looking and playing.
- Boards of 8–10 pairs (4 columns) show pictures only. The 20px minimum font doesn't fit a word on those cards, and the word stays as each card's accessible name.
- Two card words were shortened so they fit on one line: "Rickshaw" and "Cricket".

**Sequence Recall**
- A lit tile turns white with a thick border in its colour and a "●" marker. The colour change is instant; only the scale animates.
- Text contrast is at least 7.1 : 1 on every tile, lit or not, and the dimmed idle tiles are gone.
- After a wrong tap, "Here's how it went." replays the right order, then the round ends.

**Word Recall**
- Each word stays on screen until "Next word".
- The star distraction has 5 round stars and ends once all 5 are tapped.
- Long lists (more than 10 words) use 3 columns at the 20px minimum.
- The hint letters appear in the hint button's place, so Done never moves.

**Other screens**
- **About Today:** the family photo takes only the space left over, so all answers stay on screen.
- **Who is this?:** the opened photo is the full width of the screen, 335px instead of 244px. The words sit under it, and Back is at the bottom.
- **Register:** "I am…" is the first question, and "Create account" stays pinned to the bottom of the screen.

**Data**
- `study_ms` is stored on every round: Memory Match looking time, including "Show me again", and Word Recall word-viewing time.
- Demo family photos are plain coloured silhouettes. To regenerate them, run `python -m app.seed --refresh-demo-photos`.
