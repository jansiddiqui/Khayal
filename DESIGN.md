---
name: Khayal
description: A calm courtyard home for daily brain games, reminders and early notice of change, in deep teal and marigold on lime-plaster ivory.
colors:
  door-teal: "#0E5E63"
  door-teal-deep: "#03494D"
  door-teal-dusk: "#013538"
  door-teal-night: "#002123"
  jaali-teal: "#39797D"
  teal-mist: "#C5E1E3"
  teal-haze: "#DFF1F2"
  teal-wash: "#F1F9F9"
  marigold: "#F2A33A"
  marigold-bloom: "#FFC787"
  marigold-garland: "#DF9637"
  marigold-ember: "#BD7F2C"
  marigold-earth: "#78501D"
  marigold-wash: "#FFEFDE"
  lime-plaster: "#FBF7EF"
  desk-white: "#FBFAF6"
  cream-surface: "#FFFDF8"
  sunken-plaster: "#F0E9DB"
  teal-ink: "#102325"
  teal-ink-soft: "#334649"
  teal-ink-muted: "#516163"
  plaster-line: "#DFD8CC"
  control-line: "#738485"
  leaf-green: "#206B38"
  leaf-wash: "#E0F7E4"
  brick-red: "#A8372A"
  brick-wash: "#FEEEEB"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(2.1rem, 1.2rem + 4.2vw, 4.3rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Atkinson Hyperlegible, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(1.8rem, 1.2rem + 2.2vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Atkinson Hyperlegible, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "Atkinson Hyperlegible, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-caregiver:
    fontFamily: "Inter, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Atkinson Hyperlegible, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
    lineHeight: 1.5
  wordmark-urdu:
    fontFamily: "Noto Nastaliq Urdu, Jameel Noori Nastaleeq, Urdu Typesetting, Noto Naskh Arabic, Segoe UI, serif"
    lineHeight: 1
rounded:
  field: "0.75rem"
  card: "1rem"
  form-panel: "1.6rem"
  phone: "2.4rem"
  door-arch: "10rem"
  pill: "9999px"
spacing:
  gutter: "1.25rem"
  gutter-wide: "2.5rem"
  stack: "1.25rem"
  group: "1.5rem"
  block: "2.5rem"
  room: "4rem"
  room-wide: "6rem"
  container: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.marigold}"
    textColor: "{colors.door-teal-night}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 1.25rem"
    height: "2.6rem"
  button-primary-hover:
    backgroundColor: "{colors.marigold-bloom}"
  button-primary-hero:
    backgroundColor: "{colors.marigold}"
    textColor: "{colors.door-teal-night}"
    rounded: "{rounded.pill}"
    padding: "0 1.5rem"
    height: "2.8rem"
  button-ghost-on-teal:
    textColor: "{colors.lime-plaster}"
    rounded: "{rounded.pill}"
    padding: "0 1.5rem"
    height: "2.8rem"
  button-ghost-on-teal-hover:
    backgroundColor: "{colors.door-teal-deep}"
  button-app-primary:
    backgroundColor: "{colors.door-teal}"
    textColor: "#FFFFFF"
    rounded: "{rounded.card}"
    padding: "1rem 1.5rem"
    height: "4rem"
  button-app-primary-hover:
    backgroundColor: "{colors.door-teal-deep}"
  button-app-secondary:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.door-teal-deep}"
    rounded: "{rounded.card}"
    padding: "1rem 1.5rem"
    height: "4rem"
  input-field:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.teal-ink}"
    rounded: "{rounded.field}"
    padding: "0.625rem 1rem"
  card:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.teal-ink}"
    rounded: "{rounded.card}"
    padding: "1.5rem"
  audience-door-families:
    backgroundColor: "{colors.door-teal}"
    textColor: "{colors.lime-plaster}"
    rounded: "{rounded.door-arch}"
    padding: "3.5rem 1.75rem 2rem"
  nav-header:
    backgroundColor: "{colors.lime-plaster}"
    textColor: "{colors.teal-ink-soft}"
    typography: "{typography.label}"
    height: "3.6rem"
---

# Design System: Khayal

## Overview

**Creative North Star: "The Courtyard Home"**

Khayal is a home, not a clinic or an app-store tile. Its materials are those of an Indian courtyard house: lime-plaster walls in warm ivory, doors and window frames in painted deep teal, a marigold garland as the one warm note, and light falling through a carved jaali screen. The system is light-only, calm and legible first. Text is large (a 20px root on every screen), contrast is measured for every pair, and status is never carried by colour alone.

The palette and fonts are **app-wide**: patient screens (Atkinson Hyperlegible on lime plaster), caregiver screens (Inter on a quieter near-white desk) and the public landing page share one token set in `frontend/src/theme.css`. The **courtyard composition** (teal rooms, jaali light, arched niches and doors, the garland, display-scale type and the motion grammar) currently belongs to the **landing page only** (`/`, `/privacy`, `/terms`). Phase C will carry motion and the courtyard feel into the app screens; until then, patient screens follow CLAUDE.md section 4 (at least 20px text, 64px buttons, at most three actions, Home in one place, no hidden timers) and caregiver screens stay a calm, dense dashboard.

The rejections are deliberate and visual: no white page with a gradient hero and rows of equal icon cards, no cold hospital look, no cartoons, confetti, streaks or emoji, no dark mode.

**Key Characteristics:**
- Deep teal owns whole regions; it is never a thin accent.
- Marigold is a fill or a mark, never small text on plaster.
- Ink is tinted from the teal, so text belongs to the palette.
- Every text pair is measured (`docs/brand/palette.md`): body AAA on patient and landing screens, everything else at least AA, non-text marks at least 3:1.
- The logo's heart is the source of the jaali; brand and ornament are one shape.
- Motion is gentle (150-400ms ease-out), arrives once, and switches off under reduced motion.

## Colors

Painted-wood teal and marigold on warm lime plaster, with ink, lines and status all tuned to sit with the teal. The scales were built in OKLCH with even lightness steps and checked with the WCAG 2.2 contrast formula.

### Primary
- **Door Teal** (teal-700): the brand teal. In the app it is the `brand` role: the one main action button and links (7.0:1 on lime plaster). On the landing page it paints the hero door and the invite room.
- **Door Teal Deep** (teal-800): hover for links and teal buttons; the privacy room.
- **Door Teal Dusk** (teal-900): icon discs inside the privacy room.
- **Door Teal Night** (teal-950): the footer, the phone frame, and the text on every marigold button (8.1:1).
- **Jaali Teal** (teal-600): the lattice drawn one step lighter on a teal room; hover border on fields.
- **Teal Mist, Teal Haze, Teal Wash** (teal-200, 100, 50): the ghost button's border on teal, secondary text on teal rooms, and pale panels (feature icon tiles, the doctors' door, the selected role choice, `brand-soft`).

### Secondary
- **Marigold** (saffron-400): the brand saffron and the landing page's single action colour; the logo's dot; garland stripes and bullet dots. On light grounds it is 1.9:1, so it is only ever a fill or mark.
- **Marigold Bloom** (saffron-300): primary hover; the Urdu wordmark and links on teal.
- **Marigold Garland** (saffron-500): the second stripe of the garland; emphasised points in illustrations.
- **Marigold Ember** (saffron-600): the focus ring (3.15:1 on plaster) and gentle notice borders.
- **Marigold Earth** (saffron-800): all saffron-family text on light grounds and the `warning` role (6.6:1).
- **Marigold Wash** (saffron-100): warning and notice panels; the elders' door; text selection.

### Neutral
- **Lime Plaster** (`ivory` / `paper`): the ground of patient screens and the landing page; text on teal rooms.
- **Desk White** (`desk`): the caregiver canvas, quieter than plaster.
- **Cream Surface** (`surface`): cards, inputs, light buttons.
- **Sunken Plaster** (`sunken`): wells, placeholders, waiting states, and the alternate landing rooms.
- **Teal Ink, Teal Ink Soft, Teal Ink Muted**: body (15.2:1), secondary (9.3:1) and caption (6.1:1) text.
- **Plaster Line**: decorative dividers. **Control Line** (3.7:1): the borders of inputs and choices.
- **Leaf Green / Leaf Wash** (`success`, alias `calm`): done, matched, next reminder, Stable.
- **Brick Red / Brick Wash** (`danger`): caregiver errors, Declining, and invalid landing form fields. Never on patient screens.

### Named Rules
**The Painted Door Rule.** Teal is a total commitment: when it appears as a ground it fills the whole room edge to edge.

**The Garland Rule.** Marigold is a fill, a dot or a stripe. Any marigold-family text on a light ground is Marigold Earth or darker.

**The Measured Pair Rule.** No text/background pair ships unless it has a row in `docs/brand/palette.md` that meets its target.

**The Word Beside the Colour Rule.** Every status (Stable, Watch, Declining, done, warning) carries an icon and a word; colour only reinforces it.

## Typography

**Display Font:** Atkinson Hyperlegible (400, 700), with system-ui, Segoe UI, Roboto
**Body Font:** Atkinson Hyperlegible on patient and landing screens; Inter (400-700, tabular numbers) on caregiver screens
**Urdu:** the reader's own Nastaliq or Naskh face, for the wordmark خیال (`lang="ur"`)

**Character:** a legibility face for low vision, set at full display scale and tightened at the top, so the brand voice comes from size and weight rather than from a decorative font. Inter does the quiet clinical work on caregiver screens.

The root font-size is 20px on every screen, so every rem value and every Tailwind breakpoint is 1.25x the usual.

### Hierarchy
- **Display** (700, fluid 42-86px, line-height 1.02, tracking -0.025em): the landing hero headline only, measure about 14ch.
- **Headline** (700, fluid 36-60px, line-height 1.05, tracking -0.02em): landing section titles.
- **Title** (700, 1.2-1.6rem): room headings, audience doors, the invite form heading.
- **Body** (400, 1rem = 20px, line-height 1.5): all running text; lead paragraphs at 1.1rem. Measures held between 34 and 62ch. Headings use balanced wrapping and paragraphs use pretty wrapping.
- **Label** (700, 0.85rem): header navigation and small links; captions at 0.75-0.8rem in Teal Ink Muted, used only on the landing page and caregiver screens.
- **Patient app:** body at least 20px, headings at least 32px, button text 1.4-1.5rem in `BigButton`.

### Named Rules
**The Full Scale Rule.** The brand speaks through size: display type is set large and tight in Atkinson Hyperlegible, never in a second display face.

**The Twenty Pixel Floor Rule.** The 20px root is never lowered; patient text never drops below it.

## Layout

The landing page uses one 12-column grid inside a 72rem (1440px) container, with 1.25rem gutters on phones and 2.5rem from `lg`. Rooms stack along one vertical axis, each a full-bleed band with 4rem vertical padding (6rem from `lg`): plaster header, teal hero door, How it works (plaster), Audiences (sunken), Features (plaster), Science (sunken), Privacy (deep teal), FAQ (plaster), Invite (teal), night-teal footer. Wide rooms split 5/7 or 4/8 (title left, content right; the Features title stays sticky).

Breakpoints are Tailwind's rem values against the 20px root: `sm` 800px, `md` 960px, `lg` 1280px. Below `lg`, the header's section links fold into a menu; below `sm`, the header's invite button hides and the hero button carries it. In the hero the copy comes first on phones and the arched niche follows, with its arch starting above the fold at 375 x 812. Anchored rooms clear the sticky header by 4.2rem.

The patient app is single-column, with full-width 64px+ buttons on phones and every board and commit button visible without scrolling at 375 x 812.

## Elevation & Depth

Depth is mostly tonal: plaster, sunken plaster and teal rooms alternate to separate spaces, and the jaali adds light rather than lift. Shadows are soft, low and tinted from Teal Ink or Marigold Earth, never black-on-grey and never hard-offset. The sticky header gains a hairline and a faint shadow only after 8px of scroll. The arched niche is the one inset: a radial teal glow with an inner shadow, so the phone stands in light.

### Shadow Vocabulary
- **Marigold lift** (`0 6px 16px -8px rgb(120 80 29 / 0.7)`, hover `0 10px 22px -10px rgb(120 80 29 / 0.75)`): marigold buttons.
- **Header settle** (`0 8px 20px -16px rgb(16 35 37 / 0.35)`): the sticky header after scrolling.
- **Illustration rest** (`0 16px 32px -24px rgb(16 35 37 / 0.6)`): small drawn product views on plaster.
- **Door hover** (`0 22px 40px -24px rgb(16 35 37 / 0.55)`): audience doors lifted 4px.
- **Form on teal** (`0 30px 60px -30px rgb(0 0 0 / 0.6)`): the invite form panel.
- **Phone** (`0 30px 60px -20px rgb(0 20 22 / 0.55), 0 12px 24px -12px rgb(0 20 22 / 0.4)`): the phone in the niche.
- **Niche inset** (`inset 0 16px 30px -12px rgb(0 0 0 / 0.45)`): the arched niche.

### Named Rules
**The Light Not Lift Rule.** Rooms are separated by ground colour and light; shadows are reserved for objects that sit in a room (buttons, the form, the phone, drawn illustrations).

## Shapes

Soft and architectural. Actions are full pills; fields and choices have gently rounded corners (0.75rem); cards and notes are softer (1rem); the invite form panel is 1.6rem. The courtyard's signature silhouette is the arch: the hero niche is a full half-circle over a straight base, and the three audience doors are 10rem arches over 1rem bottom corners. Icon discs and numbered step markers are circles. Borders are 2px for controls and notes (4px on the app's secondary button), and hairlines for dividers.

The logo mark is a soft heart whose point dissolves into a thought bubble's two trail bubbles, with a marigold dot above the dip like the nuqta of خ. The same heart, four times, point to point, is the jaali tile.

## Components

### Buttons
- **Shape:** full pill on the landing page (9999px); softly rounded rectangle in the app (1rem).
- **Primary (landing):** Door Teal Night bold text on Marigold, 2.6rem tall (2.8rem in the hero and invite form), 1.25-1.75rem side padding, Marigold lift shadow; a trailing arrow or send icon where it moves you on.
- **Primary (app):** white text on Door Teal, at least 64px tall (80px normal, 72px on patient Home), full-width on phones, icon beside the words, optional second line (e.g. "Done today").
- **Hover / Focus / Press:** 150ms ease-out; marigold brightens to Marigold Bloom, teal deepens to Door Teal Deep; press scales to 0.97 (static under reduced motion); focus is a 4px Marigold Ember outline at 3px offset (3px/2px on caregiver screens).
- **Ghost on teal:** Lime Plaster text, 2px Teal Mist border, pill; hover turns the border to plaster and the fill to Door Teal Deep.
- **Secondary (app):** Door Teal Deep text on Cream Surface with a 4px Door Teal border; hover fills Teal Wash.

### Cards / Containers
- **Corner Style:** 1rem (app cards, illustrations, notes).
- **Background:** Cream Surface on plaster; Marigold Wash, Door Teal or Teal Wash for the audience doors.
- **Shadow Strategy:** app cards carry a minimal shadow; landing illustrations use Illustration rest.
- **Border:** 2px Plaster Line on app cards; hairline on landing illustrations; the honesty note ("not a medical device") has a 2px Door Teal border and an info icon.
- **Internal Padding:** 1-1.5rem; audience doors 3.5rem top for the arch.

### Inputs / Fields
- **Style:** Cream Surface, 2px Control Line border, 0.75rem corners, Teal Ink text, Teal Ink Muted placeholder, bold label above.
- **Focus:** border turns Door Teal, plus a 3px Marigold Ember outline; hover border Jaali Teal.
- **Choices:** radio choices are bordered 2.6rem rows that turn Teal Wash with a Door Teal border when checked.
- **Error:** invalid fields turn Brick Red only after a first submit attempt; the form's alert is bold Marigold Earth-family text on Marigold Wash with a Marigold Ember border, never red.

### Navigation
- **Header:** a sticky plaster lintel, 3.6rem tall: logo left, bold 0.85rem Teal Ink Soft links that turn Door Teal and underline on hover, "Sign in", and the marigold invite pill. Below `lg` a 48px menu button (icon only, named for screen readers) opens a full-width list with divider lines and a full-width invite pill.
- **Footer:** Night Teal, reversed logo, Teal Haze links that turn plaster on hover.
- **Patient app:** the same top bar on every screen, with Home and Read aloud as large bordered buttons, icon above the word.

### Jaali Light (signature, landing only)
A lattice of 56px tiles, each four logo hearts meeting point to point with small corner studs, drawn one step lighter than its teal ground and revealed only inside a soft radial pool of light. Decorative (`aria-hidden`); text never sits on its brightest part. In the hero the pool falls on the niche and drifts with scroll (up to 48px across, 36px down); elsewhere it is still.

### Arched Niche (signature, landing only)
A half-round arch with a radial glow from Teal 400 to Door Teal Deep and an inner top shadow, holding a drawn phone with the real patient Home layout. Under it, a two-tone marigold garland stripe (8px) runs along the foot of the hero door.

### Logo
Mark + "Khayal" (Atkinson Bold at 0.62 of the mark's height) + "خیال" (Urdu stack at 0.5; Door Teal, or Marigold Bloom when reversed). Tones: colour, reversed (plaster body), mono. In the hero the mark draws itself in once: outline, then fill, then the trail bubbles, and the dot last.

### Motion (landing page; Phase C extends it to the app)
One curve, `cubic-bezier(0.16, 1, 0.3, 1)`. Rooms arrive once as you reach them: a 350ms fade with an 18px rise or side settle, staggered 50-90ms, entering from different directions. Hero pieces arrive over 400ms, staggered from 150ms; the phone rises over 600ms. Section links smooth-scroll and move focus with the view. Under reduced motion nothing moves and scrolling is instant.

## Do's and Don'ts

### Do:
- **Do** take every colour and font from `theme.css` tokens; light mode only.
- **Do** add a measured row to `docs/brand/palette.md` before shipping a new text/background pair.
- **Do** put Door Teal Night text on marigold buttons, and Lime Plaster or Teal Wash text on Door Teal.
- **Do** pair every icon with words on patient screens, and every status colour with an icon and a word.
- **Do** keep patient screens at a 20px text floor, 64px buttons and at most three actions (CLAUDE.md section 4).
- **Do** label drawn product views as illustrations, and keep any number in them clearly made-up.
- **Do** keep motion at 150-400ms ease-out, arriving once, and off under `prefers-reduced-motion`.

### Don't:
- **Don't** set Marigold as text on plaster (1.9:1); use Marigold Earth.
- **Don't** use Brick Red on patient screens.
- **Don't** use teal as a thin accent stripe on a white page; when teal is a ground it owns the room.
- **Don't** use emoji, cartoons, confetti, streaks or points.
- **Don't** put text on the brightest part of the jaali light.
- **Don't** use hard offset shadows or pure-black shadows on plaster.
