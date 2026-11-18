# Mood as a covariate for decline tracking (analysis note, Round 2 batch 4)

Status: **note only**. The daily mood answer (Good / Okay / Not so good / skipped) is stored and shown to the family, but no alert rule uses it. Nothing in `ml/decline/` reads it yet.

## Why mood matters for the scores

A low day can lower game scores for reasons that are not decline:
- tiredness;
- low mood or worry;
- pain;
- a bad night.

Depression in later life is common. It is also known to look like, and to sit alongside, cognitive impairment ("pseudodementia" in older texts). Both point the same way:
- A run of "Not so good" days can pull the composite down and push a game below −1.5 for 3 sessions (alert rule B) without any lasting change in cognition. That is a false alarm we could explain away.
- Lasting low mood is itself worth a family's attention, and is sometimes an early sign that comes with cognitive decline. So mood should not simply be subtracted out.

## Options, from simplest to most involved

1. **Show, don't adjust (what the app does now).** Mood sits next to the score charts, on the timeline and in the doctor report. A person reading an alert can see that the dip came with "Not so good" days.
2. **Annotate alerts.** When a decline alert's last 3 sessions include ≥ 2 "Not so good" days, add a line: "2 of these days were marked Not so good." The rule itself doesn't change. This is cheap and honest.
3. **Mood-stratified baseline.** Keep the baseline from "Good"/"Okay" days only. Score each session against the baseline for its own mood level, or downweight sessions played on "Not so good" days in the rolling mean. Risk: fewer sessions per stratum, so noisier baselines, and skipped days (missing not at random) to handle.
4. **Covariate in a model.** In a mixed-effects model per patient: `composite ~ time + mood + (time | patient)`; or as an input feature to the sequence models in `ml/dl/` (one-hot mood plus a "skipped" flag per day). Decline is then the time slope after accounting for mood, and the mood effect is estimated per patient.

## What to check before using it

- **Coverage:** how often is the question answered, and is skipping random? People may skip more on bad days.
- **Within-person association:** within each patient, is the composite lower on "Not so good" days than on "Good" days? Expect a small effect; use paired comparisons.
- **Lag:** does today's mood relate to today's games only, or to the next days too?
- **Simulation first:** add an optional mood process to `ml/decline/simulator.py` (for example a 3-state Markov chain whose "Not so good" state lowers ability by a small amount for that day). Then rerun `ml/decline/evaluate.py` to measure false alarms with and without options 2–3. Any change to alerts would be decided after that evaluation, like rule B.

## Data

- **Table:** `mood_checkins` (patient_id, date, mood or null for Skip, answered_at). One row per day at most.
- **Research export:** `mood.csv` (participant, day, mood = good / okay / not_so_good / skipped), for consented families only.
