import { shuffle, type Rng } from "../types";

/**
 * "Tap the squares" (Corsi block-tapping idea; docs/games/research.md 3.2, decision D3): nine
 * identical squares in a 3×3 grid light up in turn; the patient taps the same squares in order.
 * No colours, so it is purely spatial. A separate game from Follow the Colours, so neither game's
 * levels change meaning.
 */

export const SQUARES = 9;

export interface SpanConfig {
  length: number;
  litMs: number;
  gapMs: number;
}

/** Level 1 → 2 squares … level 10 → 7 (like Follow the Colours); practice: 2 squares, slower. */
export function spanConfig(level: number, practice = false): SpanConfig {
  if (practice) return { length: 2, litMs: 1200, gapMs: 500 };
  const l = Math.min(10, Math.max(1, Math.round(level)));
  return { length: 2 + Math.floor(((l - 1) * 5) / 9), litMs: 1000 - (l - 1) * 40, gapMs: 400 };
}

/** Distinct squares (Corsi never repeats a block within one sequence). */
export function buildSpan(length: number, rng: Rng): number[] {
  return shuffle(
    Array.from({ length: SQUARES }, (_, i) => i),
    rng,
  ).slice(0, Math.min(length, SQUARES));
}
