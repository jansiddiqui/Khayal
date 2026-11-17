# Games v2: research basis and design (for review before building)

Status: **draft for review**. Nothing in this document is built yet. Branch `games-v2`.

Every reference below was checked with a web search on 2026-11-17: title, authors, year,
journal, volume/pages and DOI. Where one part could not be confirmed, it says so. References
I could not verify were left out (listed at the end).

Khayal is **not a diagnostic tool**. These games borrow the *task idea* of established tests
so that the scores mean something for trend tracking. They are not the tests themselves: the
originals are administered by a clinician, under standard conditions, with normative data.
Our versions are not validated, and the paper must say so.

---

## 1. Summary

| Game (patient name) | Based on | Domain | Fits the composite as |
|---|---|---|---|
| Where did it go? | CANTAB Paired Associates Learning (PAL) | Visuospatial episodic memory (object–location binding) | levelled, 5 rounds |
| Join in order | Trail Making Test / Color Trails Test | Processing speed, attention, set-shifting (executive) | levelled, 5 rounds |
| Set the clock | Clock Drawing Test, as Clock *Setting* / *Reading* | Visuospatial + executive + time concepts | levelled, 5 rounds |
| Market day | Financial capacity tests; Lawton IADL "handling finances" | Everyday calculation, money handling (IADL) | levelled, 5 rounds |
| *Remember the Words* + delayed recall | CERAD word list delayed recall | Episodic memory (delayed) | extra rounds, no level change |
| *Follow the Colours* + 3×3 grid | Corsi block-tapping | Visuospatial working memory | see decision D3 |
| *About Today* + festival | Culturally adapted orientation (Hindi MMSE) | Orientation to time | one extra question |
| Tutorial + easy first round (all games) | Errorless learning | (supports valid scores) | practice rounds not stored |

---

## 2. New games

### 2.1 "Where did it go?": object–location memory (PAL)

**Original test.** CANTAB Paired Associates Learning: boxes on the screen open one by one, some
hiding a pattern. The patterns are then shown in the centre one at a time, and the person
touches the box where each one was. Difficulty rises with the number of patterns (1, 2, 3, 6,
8). After errors the boxes are shown again and the person tries again. The main scores are
errors and trials needed.

**Domain.** Visuospatial episodic memory: binding *what* to *where*. This depends on the medial
temporal lobe, including the hippocampus and entorhinal cortex, which are affected early in
Alzheimer's disease.

**Why it matters in MCI / early dementia.** PAL errors separated very early Alzheimer's disease
from depression and from healthy ageing. In a memory-clinic sample, PAL together with a
semantic test picked out people who later developed probable Alzheimer's disease. Object–
location recall is worse in Alzheimer's disease than in MCI, and binding objects to places
is the part most affected.

**References (verified).**
1. Sahakian BJ, Morris RG, Evenden JL, Heald A, Levy R, Philpot M, Robbins TW (1988). A comparative study of visuospatial memory and learning in Alzheimer-type dementia and Parkinson's disease. *Brain* 111(3):695–718. doi:10.1093/brain/111.3.695
2. Swainson R, Hodges JR, Galton CJ, Semple J, et al. (2001). Early detection and differential diagnosis of Alzheimer's disease and depression with neuropsychological tasks. *Dementia and Geriatric Cognitive Disorders* 12(4):265–280. doi:10.1159/000051269
3. Blackwell AD, Sahakian BJ, Vesey R, Semple JM, Robbins TW, Hodges JR (2004). Detecting dementia: novel neuropsychological markers of preclinical Alzheimer's disease. *Dementia and Geriatric Cognitive Disorders* 17(1–2):42–48. doi:10.1159/000074081
4. Kessels RP, Rijken S, Joosten-Weyn Banningh LW, Van Schuylenborgh-van Es N, Olde Rikkert MG (2010). Categorical spatial memory in patients with mild cognitive impairment and Alzheimer dementia: positional versus object-location recall. *Journal of the International Neuropsychological Society* 16(1):200–204. doi:10.1017/S1355617709990944

**Design (our version).**
- **Round** = one board: N real-object photos (for example a key, glasses, a steel tumbler) are
  shown one at a time, each in its own box of a grid. The patient taps "Next" to move on: there
  is no automatic timer (CLAUDE.md section 7). Then each object appears in the centre, and the
  patient taps the box where it was.
- **Correct** = every object placed right on the first try. If some are wrong, the game gently
  shows them again ("Here's where they were") and gives a second try. Right on the second try
  counts as correct **with `hint_used = true`**, so it earns 0.5 in the composite, the same way
  hints already work.
- **reaction_ms** = median time from an object appearing in the centre to the tap.
- **study_ms** = total time spent looking at the boxes before recall (the field already exists).
- **Levels 1–10** (objects / boxes): 1: 2/4 · 2: 2/6 · 3: 3/6 · 4: 4/6 · 5: 4/9 · 6: 5/9 · 7: 6/9 ·
  8: 6/9 with similar objects · 9: 7/9 · 10: 8/9. The grid is 2×2, 2×3 or 3×3, and every box is
  at least 96 px at 375 px wide.
- **New metric:** `errors` = wrong placements on the first try (PAL's main score). It needs a
  new nullable column, `GameRound.errors` (decision D1).

### 2.2 "Join in order": Trail Making / Color Trails

**Original test.** Trail Making Test (TMT): Part A connects 1→25. Part B alternates numbers and
letters (1-A-2-B…), which needs letters, so it depends on literacy. The **Color Trails Test (CTT)**
is the language-free version. Part 1 connects 1→25. Part 2 alternates two colours
(pink 1 → yellow 2 → pink 3 …) and ignores the same number in the other colour. The main
scores are completion time and errors.

**Domain.** Part 1: visual search, psychomotor and processing speed. Part 2 adds divided
attention and set-shifting (executive function).

**Why it matters.** TMT-B time *and* errors each add separate clinical information in normal
ageing, MCI and dementia. The CTT was designed for people with little schooling or a different
script, which fits Indian elders. Indian normative data exist and show that age and education
matter, so we must only compare a patient with their own baseline, never with other people.

**References (verified).**
1. Reitan RM (1958). Validity of the Trail Making Test as an indicator of organic brain damage. *Perceptual and Motor Skills* 8(3):271–276. doi:10.2466/pms.1958.8.3.271
2. Ashendorf L, Jefferson AL, O'Connor MK, Chaisson C, Green RC, Stern RA (2008). Trail Making Test errors in normal aging, mild cognitive impairment, and dementia. *Archives of Clinical Neuropsychology* 23(2):129–137. doi:10.1016/j.acn.2007.11.005
3. Dugbartey AT, Townes BD, Mahurin RK (2000). Equivalence of the Color Trails Test and Trail Making Test in nonnative English-speakers. *Archives of Clinical Neuropsychology* 15(5):425–431. doi:10.1093/arclin/15.5.425
4. Indorewalla K, et al. (2019). Culturally sensitive normative data for the Color Trails Test in the Indian population (conference abstract, 669 adults aged 18–69). *Archives of Clinical Neuropsychology* 34(6):856. doi:10.1093/arclin/acz035.24. Only the first author could be confirmed.
5. Test manual, no DOI: D'Elia LF, Satz P, Uchiyama CL, White T (1996). *Color Trails Test: Professional Manual.* Odessa, FL: Psychological Assessment Resources.

**Design (our version).**
- **Round** = one trail. Big numbered circles (at least 56 px). The patient taps them in order,
  and a line joins each correct tap. A wrong tap does not join; the game says
  "Let's look for 4" and lets them carry on. Nothing ends by itself.
- **Colour-blind safety:** the two colours in Part 2 also differ in shape (teal circle vs
  saffron square), and the instruction names both ("teal circle 1, then saffron square 2").
- **Correct** = the trail is finished with at most 1 wrong tap.
- **reaction_ms** = median time between correct taps, which is TMT's speed measure per item.
  It is recorded only, never shown: there is no timer and no countdown (decision D2).
- **Levels:** 1: Part 1 with 5 circles · 2: 7 · 3: 9 · 4: 12 · 5: Part 2 with 6 · 6: 8 · 7: 10 ·
  8: 12 · 9: 14 · 10: 16. Every trail fits 375 × 812 without scrolling.
- **New metric:** `errors` = wrong taps (TMT errors; same column as D1).

### 2.3 "Set the clock": adapted Clock Drawing

**Original test.** Clock Drawing Test (CDT): draw a clock face with all the numbers and set the
hands to a time, classically "10 past 11". Tuokko's *Clock Test* adds **Clock Setting** (set the
hands on a printed face) and **Clock Reading** (read the time a clock shows).

**Domain.** Visuospatial construction, planning and executive function, semantic knowledge of
time, and number sense.

**Why it matters.** The CDT is quick and reliable, and in reviews its sensitivity and
specificity are about 85% overall. It is **weak for mild or questionable dementia**, though.
The functionally relevant setting and reading parts helped tell normal elderly people apart
from people with Alzheimer's disease.

**References (verified).**
1. Shulman KI (2000). Clock-drawing: is it the ideal cognitive screening test? *International Journal of Geriatric Psychiatry* 15(6):548–561. doi:10.1002/1099-1166(200006)15:6<548::AID-GPS242>3.0.CO;2-U
2. Tuokko H, Hadjistavropoulos T, Miller JA, Beattie BL (1992). The Clock Test: a sensitive measure to differentiate normal elderly from those with Alzheimer disease. *Journal of the American Geriatrics Society* 40(6):579–584. doi:10.1111/j.1532-5415.1992.tb02106.x
3. Pinto E, Peters R (2009). Literature review of the Clock Drawing Test as a tool for cognitive screening. *Dementia and Geriatric Cognitive Disorders* 27(3):201–213. doi:10.1159/000203344

**Design (our version).** We build *setting* and *reading*, not free drawing. Freehand drawing on
a phone is hard for older hands and cannot be scored reliably without a model. This drops the
planning part of the CDT, a known limitation for the paper.
- **Round** = one time. "Set the clock to 10 past 11" is spoken and shown as digits and words.
  The patient taps where the short hand goes and then where the long hand goes, and can move
  either one again before tapping "Done". Some levels are *reading* rounds instead: "What time
  does this clock show?" with 3 big choices.
- **Correct** = hour hand in the right hour sector (a half-hour position is accepted for
  "half past"), and minute hand within one step of the level's granularity.
- **reaction_ms** = time from the question to "Done" (recorded, not shown).
- **Levels:** 1: read o'clock · 2: set o'clock · 3: half past · 4: quarter past / to ·
  5: 5-minute steps · 6: the classic "10 past 11" pull towards the 10 · 7: face with only 12/3/6/9 ·
  8: ticks only, no numbers · 9: time in words only ("twenty to four") · 10: "What will the time be
  in 1½ hours?"
- **New metric:** an error type per round (hour wrong / minute wrong / both), kept in the
  `errors` bitfield (decision D1).

### 2.4 "Market day": everyday money handling (₹)

**Original basis.** Instrumental activities of daily living (IADL). "Ability to handle finances"
is one of the eight Lawton–Brody items. Direct financial-capacity tests, such as Marson's
Financial Capacity Instrument, include counting coins and notes, making change and buying items.

**Domain.** Applied calculation, working memory, and everyday functional ability.

**Why it matters.** People with amnestic MCI already show mild impairment on direct tests of
financial ability. Those who later converted to Alzheimer's disease lost financial skills
faster over one year than people who did not convert. Money handling is also a real daily task
in Indian households, so the game is meaningful to elders and their families.

**References (verified).**
1. Lawton MP, Brody EM (1969). Assessment of older people: self-maintaining and instrumental activities of daily living. *The Gerontologist* 9(3):179–186. PMID 5349366. *DOI not confirmed by search (likely 10.1093/geront/9.3_Part_1.179); cite with the PMID.*
2. Griffith HR, Belue K, Sicola A, Krzywanski S, Zamrini E, Harrell L, Marson DC (2003). Impaired financial abilities in mild cognitive impairment: a direct assessment approach. *Neurology* 60(3):449–457. doi:10.1212/WNL.60.3.449
3. Triebel KL, Martin R, Griffith HR, Marceaux J, Okonkwo OC, Harrell L, Clark D, Brockington J, Bartolucci A, Marson DC (2009). Declining financial capacity in mild cognitive impairment: a 1-year longitudinal study. *Neurology* 73(12):928–934. doi:10.1212/WNL.0b013e3181b87971

**Design (our version).**
- **Round** = one shop task, for example: "Tomatoes cost ₹30. Tap the money to pay." Notes and
  coins sit in a "purse". Tapping one moves it to the counter, and tapping again moves it back.
  "Pay" commits. Later levels ask about change or a total, with 3 big answer choices.
- **Correct** = the exact amount paid (or the right choice). Overpaying when exact change was
  possible is *not* correct at levels 1–6, and is fine from level 7 ("pay with a ₹100 note") when
  the question is about the change.
- **reaction_ms** = time from the question to "Pay" or the answer.
- **Levels:** 1: one note equals the price (₹10/20/50 in the purse) · 2: two equal notes · 3: two
  different notes · 4: notes + a coin · 5: three or four pieces · 6: which of two items costs
  less, then pay · 7: change from a round note (3 choices) · 8: total of two items, then pay ·
  9: change with coins · 10: "You have ₹100. Which two items can you buy?"
- **Money pictures:** **simplified drawings of notes and coins** (correct colour family, large
  "₹50", no portraits or security features), not photos. I could not confirm RBI's rules on
  reproducing banknote images (search found no clear guideline), so the safe choice is a
  clearly stylised token, never a lifelike banknote (decision D5).
- Prices are realistic for 2026 and kept in a small editable table (`market/prices.ts`).

---

## 3. Improvements to existing games

### 3.1 Remember the Words: delayed recall (~5 min later)

**Basis.** In CERAD, **delayed** word-list recall separated mild Alzheimer's disease from
controls best of all the memory measures. Immediate recall separated them poorly.
- Welsh K, Butters N, Hughes J, Mohs R, Heyman A (1991). Detection of abnormal memory decline in mild cases of Alzheimer's disease using CERAD neuropsychological measures. *Archives of Neurology* 48(3):278–281. doi:10.1001/archneur.1991.00530150046016

**Design.** After a completed Remember the Words session, the words of its *last* round are
kept. The delayed check is offered at the start of the *next* game the patient opens, if 3–30
minutes have passed: "Earlier we saw some words. Which of these did you see?" It uses the same
pick list as the round, at most 12 words. If more than 30 minutes have passed, or no other game
is played, there is no delayed check that day; nothing is asked out of context.
- **Rounds:** each word shown earlier is one round: correct = picked. Words picked that were
  *not* shown are counted in `errors` (false alarms).
- It is stored as its own game type `word_recall_delayed`. It has no level change, its `lvl`
  comes from the immediate session's level, and its decline baseline is separate from immediate
  recall (decision D4).

### 3.2 Follow the Colours: spatial 3×3 grid (Corsi)

**Basis.** Corsi block-tapping measures visuospatial working memory span. Normative data for
the total score (span × correct trials) are more sensitive than span alone.
- Kessels RPC, van Zandvoort MJE, Postma A, Kappelle LJ, de Haan EHF (2000). The Corsi Block-Tapping Task: standardization and normative data. *Applied Neuropsychology* 7(4):252–258. doi:10.1207/S15324826AN0704_8

**Design.** Nine identical teal squares in a 3×3 grid light up in turn, and the patient taps the
same squares in order. No colour cues, so it is purely spatial. Sequence length runs from 2 to 7
over levels 1–10. After a wrong tap the game gently replays the order, as Follow the Colours does
now.

**Important:** if the grid simply replaced the colours at higher levels, a level would mean
something different before and after the change. Existing baselines and the paper's composite
would then no longer compare. Decision D3.

### 3.3 About Today: festival question

**Basis.** Orientation items need cultural adaptation. The Hindi Mental State Examination,
developed for a largely illiterate rural population near Delhi, changed the orientation items,
for example time of day instead of the year. It was then used with a functional questionnaire
for population screening.
- Ganguli M, Ratcliff G, Chandra V, et al. (1995). A Hindi version of the MMSE: the development of a cognitive screening instrument for a largely illiterate rural elderly population in India. *International Journal of Geriatric Psychiatry* 10(5):367–377. doi:10.1002/gps.930100505
- Pandav R, Fillenbaum G, Ratcliff G, Dodge H, Ganguli M (2002). Sensitivity and specificity of cognitive and functional screening instruments for dementia: the Indo-U.S. Dementia Epidemiology Study. *Journal of the American Geriatrics Society* 50(3):554–561. doi:10.1046/j.1532-5415.2002.50126.x

*Note:* a **festival** question is **our own adaptation**, not a validated item.

**Design.** "Which festival comes next?" with 3 choices, using pictures plus words. It is asked
only within the 30 days before a festival. Festival dates follow the lunar calendar and change
every year, so they come from a yearly table (`festivals-2026.ts`, `festivals-2027.ts`).
Festivals differ by region and religion, so **the caregiver ticks the festivals the family
celebrates**. There is no default list, and the question is off until at least one festival is
chosen (decision D6). The answer is one extra About Today round.

### 3.4 First-time spoken tutorial and an easy first round (all games)

**Basis.** Errorless learning, where people learn without making mistakes along the way, helps
people with memory impairment on specific tasks. A first experience of failing also discourages.
- Clare L, Jones RSP (2008). Errorless learning in the rehabilitation of memory impairment: a critical review. *Neuropsychology Review* 18(1):1–23. doi:10.1007/s11065-008-9051-4

**Design.** The first time a patient opens each game:
1. A short spoken demo, with the hand shown doing one move. Read aloud is on for the tutorial
   even when it is off globally; the words also appear on screen.
2. A **practice round** at an easier setting than level 1, with the answer gently shown if
   needed.

Practice rounds are **not stored** as rounds, so they never affect level or decline. A small
`tutorial_seen` record per patient per game is stored. The decline warm-up still ignores the
first 5 real sessions. The caregiver page gets "Show the tutorial again" per game.

---

## 4. Fitting the existing system (CLAUDE.md sections 6–7)

- **Round reporting:** every new game reports `{correct, reaction_ms, hint_used}`, plus
  `study_ms` where it applies and the new `errors` (D1). One session is 5 rounds, as now.
- **Adaptive engine:** unchanged. `next_level` runs after every 5 rounds; the target zone is
  60–80%; the start level is 2.
- **Composite:** unchanged: `acc × lvl × rt`. `lvl` = level_start / 10, and `rt` comes from the
  patient's baseline median reaction time for that game. `errors` is stored for analysis and the
  paper but is **not** part of the composite yet, just like `study_ms`.
- **Decline:** each new game gets its own warm-up (5 sessions) and baseline (sessions 6–15).
  The status scale and alert rule B stay the same.
- **Simulator:** each new game gets a `difficulty(game, level)` curve so the synthetic profiles
  stay comparable, and the stable CSV columns stay the same. The evaluation is rerun and
  `ml/results/decline_eval.md` refreshed.
- **Today's games:** still 3 per day, with About Today always first. There will be **8 levelled
  games**, so with 2 slots a day each game comes round only about every 4 days. Reaching 15
  completed sessions (the baseline) would then take about **60 days per game**, against about
  30 days now. Decision D7.
- **Caregiver screens** keep clinical names: "Paired Associates (object location)",
  "Colour Trails", "Clock Setting", "Money Handling", "Delayed Word Recall", "Spatial Span".

---

## 5. Image plan

### What the evidence says about photos vs illustrations

The claim that **"realistic photos are easier to recognise than illustrations for people with
dementia"** is **not well supported as stated.**

- In a study of 41 people with Alzheimer's disease and 40 controls naming 105 items as colour
  photos, greyscale images or line drawings, **controls named better as colour and surface detail
  were added, but the Alzheimer's group did not**. Low-level visual deficits predicted the
  patients' naming.
  Adlington RL, Laws KR, Gale TM (2009). Visual processing in Alzheimer's disease: surface detail and colour fail to aid object identification. *Neuropsychologia* 47(12):2574–2583. doi:10.1016/j.neuropsychologia.2009.05.004
- A critical review with 3-year longitudinal data found **colour helps only a little**, mostly for
  items whose colour is a key cue, such as fruit and vegetables, in both patients and controls.
  Moreno-Martínez FJ, Rodríguez-Rojo IC (2015). On colour, category effects, and Alzheimer's disease: a critical review of studies and further longitudinal evidence. *Behavioural Neurology* 2015:960725. doi:10.1155/2015/960725
- A colour-picture version of the Boston Naming Test **discriminated** amnestic MCI and mild
  Alzheimer's disease from controls better than the black-and-white line drawings. That is a
  diagnostic-accuracy result, not evidence that photos are *easier* for patients. The authors
  also criticised the old drawings for poor quality and cultural bias.
  Li D, Yu Y-Y, Hu N, Zhang M, Liu L, Fan L-M, Ruan S-S, Wang F (2022). A color-picture version of Boston Naming Test outperformed the black-and-white version in discriminating amnestic mild cognitive impairment and mild Alzheimer's disease. *Frontiers in Neurology* 13:884460. doi:10.3389/fneur.2022.884460

**What this means for us:** realism is not a reliable help for patients; clarity is. Choose
pictures for **visual simplicity, size, contrast, a plain background and cultural familiarity**,
not for photo-realism as such. Real photos are still a good fit for *object* games: a steel
tumbler or a pair of reading glasses is familiar and unambiguous, and a well-cropped photo on a
plain background is clear. Colour helps for colour-defined items such as fruit. Within one game,
keep a single style.

### Rules for photos (object games: Where did it go?, later Who is this?-style tasks)

- **Content:** Indian everyday items: steel tumbler, pressure cooker, reading glasses, house key,
  chappal, umbrella, radio, comb, lock, matchbox, bangles, tiffin box, banana, onion, tomato,
  coconut. **No faces, no people, no brand logos or readable text.**
- **Style:** one object, centred, on a plain light background, with a square crop where the
  object fills about 70%. Then 400 × 400 px, WebP plus a JPEG fallback, under 40 KB each, and
  all photos colour-balanced the same way.
- **Licences, in order of preference:**
  1. **CC0 / public domain** (Wikimedia Commons files marked CC0 or PD; Openverse filtered to CC0).
  2. **Pexels:** free use without attribution. Restrictions include no selling of unaltered
     copies, no redistribution on stock sites, and no portraying identifiable people negatively.
     None of these touch our use, but we avoid photos with people anyway.
  3. **Unsplash:** free use without attribution, except compiling photos to build a similar or
     competing service. Fine for a few in-app images.
  4. **Wikimedia Commons CC BY / CC BY-SA:** only if nothing else fits. CC BY-SA would carry
     share-alike duties for the edited image, so avoid it where possible.
- Every image is listed in **`docs/games/image-sources.md`** with file name, source page link,
  author, licence and its link, the download date, and what we changed (crop/resize). A test
  will fail if an image file has no entry.
- **Illustrations** stay in Memory Match (its 10 flat SVGs) and for money tokens (D5).

---

## 6. Decisions needed before building

- **D1, new `errors` column:** add nullable `GameRound.errors` (int) with a migration, used by
  Where did it go?, Join in order, Set the clock, and as false alarms in delayed recall.
  *Recommended: yes.*
- **D2, timing in Join in order:** TMT/CTT are timed tests, but section 7 says "Reaction Tap is
  the only game that measures speed". All games already *record* `reaction_ms`, which feeds the
  `rt` term. I propose the same here: time recorded, never shown, never ending a round.
  *Recommended: yes, and say in the paper that speed is recorded silently.*
- **D3, Corsi grid:** a **separate game**, "Tap the squares" (Spatial Span), rather than levels
  inside Follow the Colours. Changing what Follow the Colours levels mean would break existing
  baselines and the comparability of the paper's data. *Recommended: separate game.* This would
  make 9 levelled games (see D7).
- **D4, delayed recall** as its own type `word_recall_delayed`, with no level and its own
  baseline. *Recommended: yes.*
- **D5, money pictures:** simplified ₹ tokens, not lifelike notes. *Recommended: yes.*
- **D6, festivals:** off by default, with the caregiver choosing the family's festivals and a
  yearly date table. *Recommended: yes.*
- **D7, rotation with 8–9 levelled games:** at 2 slots a day, baselines take about 2 months per
  game. Options:
  - **(a)** a *core set* of 4 games per patient (caregiver-chosen, default: Find the Pairs,
    Remember the Words, Where did it go?, Join in order) rotating in slots 2–3. Other games are
    playable from "More games" but rotate less often.
  - **(b)** a 4th daily slot.
  - **(c)** accept slower baselines.

  *Recommended: (a).* The Today's games rule in section 7 would change.
- **D8, CANTAB PAL is a proprietary test:** we copy the *task idea* only, with our own layout,
  objects and wording, and never use the name "PAL" in the patient UI. The same applies to the
  CTT (PAR) and the CDT.

## 7. Not included (could not verify)

- A 2020 Indian Color Trails normative paper in *Applied Neuropsychology: Adult* (DOI
  10.1080/23279095.2020.1819279, PMID 32970488) was found, but its author list could not be
  confirmed. It was left out.
- RBI rules on reproducing banknote images could not be confirmed (see D5).
- The Lawton & Brody DOI is not confirmed; the PMID is given instead.
