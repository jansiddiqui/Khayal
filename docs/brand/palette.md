# Khayal palette: deep teal + saffron

The palette of the real pilot (CLAUDE.md section 11). The tokens live in
`frontend/src/theme.css`; this page records the values and the measured contrast of every
text/background pair the app uses. Light mode only.

- **Deep teal** is the primary: painted courtyard doors and window frames. `teal-700` (#0E5E63) is the brand teal.
- **Saffron** is the accent and the one action colour: the marigold garland. `saffron-400` (#F2A33A) is the brand saffron.
- **Ivory** (#FBF7EF) is the ground: lime-plaster walls.
- **Ink** is a near-black tinted from the teal, so text belongs to the palette.
- **Success, warning and danger** are tuned to sit with the teal. Status is never shown by colour alone: there is always an icon and a word.

The scales were made in OKLCH (even lightness steps, chroma tapering at both ends) and checked with the WCAG 2.2 contrast formula.

## Scales

| Step | Teal | Saffron |
|---|---|---|
| 50 | `#F1F9F9` | `#FFF9F3` |
| 100 | `#DFF1F2` | `#FFEFDE` |
| 200 | `#C5E1E3` | `#FFDEBC` |
| 300 | `#A3C9CC` | `#FFC787` |
| 400 | `#7DABAF` | `#F2A33A` (brand) |
| 500 | `#5A9195` | `#DF9637` |
| 600 | `#39797D` | `#BD7F2C` |
| 700 | `#0E5E63` (brand) | `#9A6723` |
| 800 | `#03494D` | `#78501D` |
| 900 | `#013538` | `#593D1B` |
| 950 | `#002123` | `#362512` |

## Neutrals and status

| Token | Value | Use |
|---|---|---|
| `ivory` / `paper` | `#FBF7EF` | Page ground, patient canvas, landing page |
| `desk` | `#FBFAF6` | Caregiver canvas |
| `surface` | `#FFFDF8` | Cards, inputs, light buttons |
| `sunken` | `#F0E9DB` | Wells, placeholders, waiting states |
| `ink` | `#102325` | Body text |
| `ink-soft` | `#334649` | Secondary text |
| `ink-muted` | `#516163` | Captions and hints |
| `line` | `#DFD8CC` | Dividers (decorative) |
| `line-strong` | `#738485` | Control borders |
| `success` / `success-soft` | `#206B38` / `#E0F7E4` | Done, matched, Stable |
| `warning` / `warning-soft` | `#78501D` / `#FFEFDE` | Watch, gentle attention |
| `danger` / `danger-soft` | `#A8372A` / `#FEEEEB` | Caregiver errors and Declining (never on patient screens) |
| `focus` | `#BD7F2C` (saffron-600) | Focus ring |

## Contrast of every pair in use

Targets: body text on patient and landing screens aims for **AAA (7:1)**; all other text is at
least **AA (4.5:1)**; borders, focus rings and other non-text marks at least **3:1**.

| Text / mark | on | Ratio | Level | Target | Where |
|---|---|---|---|---|---|
| `ink` #102325 | `ivory` #FBF7EF | 15.24:1 | AAA | 7:1 (AAA) | Body text on the page (patient and landing) |
| `ink` #102325 | `surface` #FFFDF8 | 16.02:1 | AAA | 7:1 (AAA) | Body text on cards and inputs |
| `ink-soft` #334649 | `ivory` #FBF7EF | 9.30:1 | AAA | 7:1 (AAA) | Secondary text |
| `ink-muted` #516163 | `ivory` #FBF7EF | 6.07:1 | AA | 4.5:1 (AA) | Captions, hints (caregiver) |
| `ink-muted` #516163 | `surface` #FFFDF8 | 6.38:1 | AA | 4.5:1 (AA) | Captions on cards |
| `teal-700` #0E5E63 | `ivory` #FBF7EF | 7.02:1 | AAA | 7:1 (AAA) | Links and teal headings on the page |
| `teal-800` #03494D | `ivory` #FBF7EF | 9.52:1 | AAA | 7:1 (AAA) | Link hover |
| `ivory` #FBF7EF | `teal-700` #0E5E63 | 7.02:1 | AAA | 7:1 (AAA) | Text on the primary button / teal panels |
| `ivory` #FBF7EF | `teal-900` #013538 | 12.54:1 | AAA | 7:1 (AAA) | Text on the deep teal hero |
| `teal-100` #DFF1F2 | `teal-900` #013538 | 11.48:1 | AAA | 7:1 (AAA) | Secondary text on the deep teal hero |
| `teal-950` #002123 | `saffron-400` #F2A33A | 8.11:1 | AAA | 7:1 (AAA) | Text on saffron (marigold) buttons |
| `saffron-400` #F2A33A | `teal-900` #013538 | 6.43:1 | AA | 4.5:1 (AA) | Saffron accent text on deep teal |
| `saffron-800` #78501D | `ivory` #FBF7EF | 6.63:1 | AA | 4.5:1 (AA) | Saffron-family text on the page (warning) |
| `saffron-800` #78501D | `saffron-100` #FFEFDE | 6.29:1 | AA | 4.5:1 (AA) | Warning text on warning background |
| `success` #206B38 | `ivory` #FBF7EF | 6.10:1 | AA | 4.5:1 (AA) | Success text |
| `success` #206B38 | `success-soft` #E0F7E4 | 5.77:1 | AA | 4.5:1 (AA) | Success text on its background |
| `danger` #A8372A | `ivory` #FBF7EF | 6.06:1 | AA | 4.5:1 (AA) | Danger text (caregiver only) |
| `danger` #A8372A | `danger-soft` #FEEEEB | 5.75:1 | AA | 4.5:1 (AA) | Danger text on its background |
| `teal-700` #0E5E63 | `teal-50` #F1F9F9 | 7.02:1 | AAA | 7:1 (AAA) | Teal text on a pale teal panel |
| `ink` #102325 | `teal-50` #F1F9F9 | 15.25:1 | AAA | 7:1 (AAA) | Body text on a pale teal panel |
| `line-strong` #738485 | `ivory` #FBF7EF | 3.66:1 | AA large / non-text | 3:1 (non-text) | Control borders (non-text, 3:1) |
| `saffron-600` #BD7F2C | `ivory` #FBF7EF | 3.15:1 | AA large / non-text | 3:1 (non-text) | Focus ring / saffron borders (non-text, 3:1) |
| `saffron-400` #F2A33A | `teal-900` #013538 | 6.43:1 | AA | 3:1 (non-text) | Focus ring on deep teal (non-text, 3:1) |
| `ink` #102325 | `desk` #FBFAF6 | 15.60:1 | AAA | 4.5:1 (AA) | Body text on the caregiver canvas |
| `ink-muted` #516163 | `desk` #FBFAF6 | 6.21:1 | AA | 4.5:1 (AA) | Captions on the caregiver canvas |
| `ivory` #FBF7EF | `danger` #A8372A | 6.06:1 | AA | 4.5:1 (AA) | Text on a danger button (caregiver) |

Every pair meets its target. Pairs not listed here (for example saffron text on ivory) are
not used for text: `saffron-400` on ivory is 1.9:1, so saffron is a fill, a mark or a button
with dark text on it, never small text on the page.
