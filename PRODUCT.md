# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Patients (primary):** people aged 60–85 in India with early dementia or mild cognitive impairment (MCI). They have little confidence with technology and weaker eyesight and hearing. They may use a family member's phone or tablet rather than their own. Their jobs are to stay mentally active with a few short games a day, keep up with daily reminders (medicine, meals, appointments) and recognise family members.
- **Caregivers:** adult children or spouses. They are busy and check the dashboard a few times a week. They set up reminders, family photos and the patient's device, and need to be able to trust what the dashboard tells them.
- **Doctors:** they occasionally read the score trends and decline alerts. In the app they use the caregiver role.

## Product Purpose

Khayal (خیال, "thought" and "care" in Urdu) keeps elderly people with early dementia or MCI mentally active through adaptive brain games. It also helps them with daily reminders and with recognising family. For caregivers and doctors, it gives an early warning when cognition declines.

It is a B.Tech CSE471 Deep Learning project and the basis of a research paper. Success means two things:
- a prototype that patients can use comfortably on a phone, with caregivers trusting the trends and alerts;
- a decline-detection method whose results can be reported honestly in the paper.

## Positioning

The patient's own play is the measurement. Games adapt to stay in a comfortable success zone (rule-based now; an RL model later). Each patient is compared with their own baseline, not a population norm, and declines are explained in plain words. Familiar Indian everyday content (chai, diya, rickshaw, Indian seasons, family photos with relations) is used throughout.

## Operating Context

**Patients**
- They use a phone or tablet at home, set up once by a caregiver through device pairing (a 6-digit code, after which the device stays signed in for 90 days), so they never need a password.
- Each day they see the next reminder, play three games chosen by the server (About Today first) and can look at family photos.
- Read aloud is optional, using an Indian English voice.

**Caregivers and doctors**
- They sign in with email on a laptop and see a status per patient: Stable, Watch or Declining.
- The patient page has per-game trend charts, alerts with plain explanations, reminder adherence and a session history.

## Capabilities and Constraints

- **Built:** auth with roles and care links; five games (Find the Pairs, Follow the Colours, Remember the Words, About Today, Tap When Green); rule-based adaptive difficulty; reminders with missed-reminder alerts; family photos with "Who is this?"; decline tracking (rolling-baseline z-score, v2 settings); device pairing; the caregiver dashboard.
- **Not built yet:** the voice task (planned stub: Milestone 8) and the polish milestone (Milestone 9).
- **Later models (interfaces kept stable now):** LSTM/GRU decline model, contextual-bandit/DQN difficulty, Whisper + BERT speech screening, face embeddings, emotion detection (off by default).
- **Language:** English UI now, with all patient text in `frontend/src/copy.ts`. Hindi and Urdu come later.
- **Stack, data model and milestones:** in CLAUDE.md, which stays the source of truth for build decisions.
- **Out of scope for the prototype:** mobile app, MRI, real push notifications and deployment.

## Brand Commitments

- **Name:** Khayal (خیال), meaning both "thought" and "care".
- **Patient side:** warm, calm, respectful and homely, like a kind family member. Never childish, never clinical, never rushed. No negative words: "Let's try another", not "Wrong!". Every session ends on encouragement.
- **Caregiver side:** clear, trustworthy and quietly medical. Calm even when it shows decline.
- **Avoid:**
  - childish brain-training apps with cartoons and confetti;
  - streaks, points and leaderboards;
  - a cold hospital-software look;
  - dark mode by default;
  - tiny grey text;
  - emoji;
  - red "error" language on patient screens.
- **Fonts (approved):** Atkinson Hyperlegible on the patient side, Inter on the caregiver side.
- **Rules that must hold:** CLAUDE.md section 4. That means at least 20px text and 64px buttons, at most 3 buttons, WCAG AA contrast, no hidden timers, no negative words, a Home button in the same place on every screen, and icons always with words.

## Evidence on Hand

- **Decline results are simulated only.** They come from simulated patients in `ml.decline.simulator`, with results in `ml/results/decline_eval.md`, `ml/results/decline_eval.csv` and `ml/results/decline_tradeoff.png`. There is no data from real patients.
- **Demo accounts and history are synthetic:** 1 caregiver and 3 patients with 90 days of simulated play (`python -m app.seed --demo-history`). The family photos are placeholder silhouettes.
- **UI evidence:** the UI audit and before/after screenshots are in `docs/ui-audit.md` and `docs/ui-audit/`.
- **Absent, and must not be invented:** user testimonials, clinical validation, accuracy claims on real patients, and partner or hospital endorsements.

## Product Principles

1. **The patient's dignity comes first.** Every patient screen should feel like a kind family member helping, not a test or a toy.
2. **Nothing is hidden or rushed.** One main action per screen, everything needed visible without scrolling, no hidden timers.
3. **Explain, don't alarm.** Caregivers get plain-language explanations of each change, measured against the patient's own normal, with statistics second.
4. **Honest about what is real.** Placeholder and simulated parts are labelled as such; results are never faked.
5. **Built to swap in real models.** Stable interfaces now, so trained models can replace the rule-based ones without changing the app.

## Accessibility & Inclusion

- **Users' needs:** older adults with early cognitive decline, weaker eyesight and hearing, and low tech confidence.
- **Standard:** WCAG AA, plus the CLAUDE.md section 4 rules: at least 20px text, 64px buttons, high contrast, no colour-only meaning, and Read aloud for instructions, questions, choices and replies.
- **Language:** Hindi and Urdu translations are planned; Urdu is right-to-left.
