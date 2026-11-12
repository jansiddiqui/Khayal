import { copy } from "../../copy";
import { shuffle, type Rng } from "../types";

export type WordId = keyof typeof copy.words;

export const WORDS = Object.keys(copy.words) as WordId[];

/**
 * The star-tapping distraction (not scored) ends once all the stars are tapped. Words
 * stay on screen until the patient taps "Next word": no hidden timers (CLAUDE.md section 7).
 */
export const STAR_COUNT = 5;
/** Short "Lovely!" pause after the last star, before the word list appears. */
export const STARS_DONE_PAUSE_MS = 800;
/** Share of the shown words that must be recalled (after subtracting wrong picks). */
export const PASS_SCORE = 0.8;

/** Level 1 -> 3 words ... level 10 -> 8 words. */
export function wordCount(level: number): number {
  const l = Math.min(10, Math.max(1, Math.round(level)));
  return 3 + Math.floor(((l - 1) * 5) / 9);
}

export interface WordRound {
  shown: WordId[];
  /** The shown words plus the same number of new ones, shuffled. */
  options: WordId[];
}

export function buildWordRound(count: number, rng: Rng): WordRound {
  const picked = shuffle(WORDS, rng).slice(0, count * 2);
  const shown = picked.slice(0, count);
  return { shown, options: shuffle(picked, rng) };
}

/** (words found − wrong picks) / words shown, never below 0. */
export function recallScore(shown: readonly WordId[], picked: ReadonlySet<WordId>): number {
  const found = shown.filter((w) => picked.has(w)).length;
  const wrong = [...picked].filter((w) => !shown.includes(w)).length;
  return Math.max(0, (found - wrong) / shown.length);
}

export function isRecallCorrect(shown: readonly WordId[], picked: ReadonlySet<WordId>): boolean {
  return recallScore(shown, picked) >= PASS_SCORE;
}

/** First letters of the shown words not picked yet, in the order they were shown. */
export function missingFirstLetters(shown: readonly WordId[], picked: ReadonlySet<WordId>): string[] {
  return shown.filter((w) => !picked.has(w)).map((w) => copy.words[w].charAt(0));
}
