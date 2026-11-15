# Landing page review (Phase A)

Impeccable `critique` and `audit` on the public landing page (`frontend/src/pages/landing/`),
15 November 2026. Screenshots in this folder were taken with headless Chrome at true device
sizes (375 × 812 and 1440 × 900) with reduced motion, so every section shows its final state.

Method: dual-agent critique, kept independent. Assessment A was a design review plus finish review against
the direction contract (Impeccable's finish reviewer). Assessment B was the deterministic detector on the source
plus the in-browser overlay at 375, 1440 and the default width. The audit below combines B's
evidence with measured checks (build, contrast, overflow, Postgres tests).

## Critique: design health (scored before the fixes below)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | The form has sending, thank-you, rate-limit and waking-server states |
| 2 | Match with the real world | 4 | Plain words, Indian context, "their own normal" |
| 3 | User control and freedom | 3 | Skip link, anchor scrolling, collapsible FAQ |
| 4 | Consistency and standards | 3 | Duplicate Privacy links; header action missing on phones |
| 5 | Error prevention | 3 | Labelled fields, explicit consent |
| 6 | Recognition rather than recall | 3 | Navigation and content are visible |
| 7 | Flexibility and efficiency | n/a | Persuade page |
| 8 | Aesthetic and minimalist design | 2 | The middle repeats the same facts in three rooms; the phone page is about 16 screens |
| 9 | Error recovery | 3 | Kind, specific error copy |
| 10 | Help and documentation | 3 | The FAQ answers real objections |
| | **Total** | **27/36** | **Good (upper band)** |

**Design specificity:** mostly grounded in Khayal. The arched niches, the jaali built from the
heart mark, the Urdu wordmark, the real patient Home screen and the honest science copy could
not be lifted onto another product. The middle sections (steps, feature list, privacy grid) are
closer to a generic health page.

**Finish review against the direction contract:** "not ready as is; ship with fixes after the top
five". Kept: the honest science room, the teal field with the arched niche, the jaali made of four
Khayal hearts, the single saffron action colour, the signature motion, status never by colour alone.

## Audit: technical health

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Every text pair measured (body AAA, the rest AA); labels, skip link, keyboard menu, `details` FAQ, reduced motion turns movement off. Gaps: labels inside the decorative phone mock-up are 11–12 px (inside a `role="img"` with a full description); the skip link is 20 px tall |
| 2 | Performance | 2 | The landing page's own code is lazy and small (about 60 KB gzipped incl. `motion`, no raster images). But a signed-out visitor still downloads the whole app bundle (246 KB gzipped, mostly the caregiver charts), because app routes are not code-split yet |
| 3 | Theming | 3 | One token system in `theme.css` (scales 50–950, roles, status); charts and status dots moved onto tokens. Remaining literals: shadow colours (`rgb(...)`) on the landing page and the game art (game content by design). Light mode only, by decision |
| 4 | Responsive design | 3 | No horizontal overflow at 375 or 1440; touch targets at least 24 px (radios and checkbox sit in 52 px labels; menu button 48 px). Tested at 375 and 1440 emulated, not on a physical phone or at tablet width |
| 5 | Implementation integrity | 3 | Detector clean on the source (0 findings). Overlay flags: cream background, two saffron stripe details (both deliberate), a "nested card" inside the phone mock-up and "tiny text" in a sketch hidden on phones (false positives), an 84 px headline at 1440 (a judgement call) |
| | **Total** | **14/20** | **Good** |

No console errors. Backend tests pass on SQLite and on PostgreSQL 17 (122, including migration 0008).

## Fixes made after the review

| Finding | Severity | Fix |
|---|---|---|
| On phones the hero's niche started below the fold | P1 | Hero mark hidden on phones, the pilot line and pairing link moved below the niche, less top padding: the arch now starts above the fold at 375 × 812 |
| The family (the buyer) never saw their own view | P1 | Step 3 of "How it works" shows a labelled illustration of one dashboard line: "Overall: Stable", "Find the Pairs · This game: Watch", and a plain sentence |
| "Stored in Mumbai" was not backed by anything in the repo | P1 | Kept, because the product owner stated it; `docs/DEPLOY-VOROA.md` now says to choose the Mumbai region, because the page promises it |
| Teal doors read as near-black (teal-900) | P2 | The hero and invite rooms use the brand teal (teal-700); text on it measured: ivory and teal-50 7.0:1 (AAA), teal-100 6.4:1, saffron-300 4.9:1 |
| The jaali read as wallpaper | P2 | The light pool now falls on the niche, with a brighter niche glow |
| No way to reach the team when `KHAYAL_CONTACT_EMAIL` is unset; duplicate Privacy links | P3 | The footer falls back to "Write to us through the invite form"; the section link is gone, the policy link stays |
| Submit button and role choices wrapped awkwardly | P3 | One line each at 375 and 1440 |
| "Menu" word on the phone menu button | (owner) | Icon only, 48 px target, named "Open menu" / "Close menu" for screen readers |

## Still open

- **Template-like middle (P2):** steps, feature list and privacy grid say related things in a
  familiar layout. The brief lists these sections, so they were kept; folding them into fewer
  rooms is a design decision for the owner.
- **Headline:** "Keep the mind active" is the brain-training category's sentence; the
  differentiator ("measured against their own normal") is in the subline. Worth deciding.
- **Performance:** split the app routes so the landing page does not ship the caregiver charts.
- **Wordmark outlines:** "Khayal" and "خیال" are live text in the stand-alone SVG files (see
  `../logo-concepts.md`).
