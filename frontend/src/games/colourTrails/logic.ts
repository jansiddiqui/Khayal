import { shuffle, type Rng } from "../types";

/**
 * "Join in order" (after the Trail Making / Color Trails task idea; docs/games/research.md 2.2).
 * Part 1: tap 1, 2, 3… in order. Part 2: the numbers alternate between a teal circle and a
 * saffron square (1 teal circle, 2 saffron square, 3 teal circle…); some numbers also appear in
 * the other colour, and those are left alone. Colour is never the only cue: the shapes differ too.
 */

export type Mark = "circle" | "square";

export interface TrailItem {
  id: number;
  n: number;
  mark: Mark;
  /** Part of the trail (false = the same number in the other colour, to be left alone). */
  target: boolean;
  /** Centre, in percent of the board. */
  x: number;
  y: number;
}

export interface TrailConfig {
  part: 1 | 2;
  /** How many numbers are joined. */
  length: number;
  /** Part 2 only: numbers also shown in the other colour. */
  distractors: number;
}

const LENGTHS = [5, 7, 9, 12, 6, 8, 10, 12, 14, 16] as const;

/**
 * Levels 1–4: Part 1 with 5, 7, 9, 12 numbers. Levels 5–10: Part 2 with 6 → 16. The original
 * Part 2 shows every number in both colours; here half of them are, so every mark stays at least
 * 56px on a 375px-wide phone (a documented difference). Practice: Part 1 with 3 numbers.
 */
export function trailConfig(level: number, practice = false): TrailConfig {
  if (practice) return { part: 1, length: 3, distractors: 0 };
  const l = Math.min(10, Math.max(1, Math.round(level)));
  const length = LENGTHS[l - 1]!;
  return l <= 4 ? { part: 1, length, distractors: 0 } : { part: 2, length, distractors: Math.ceil(length / 2) };
}

/** Part 2 alternates: odd numbers are teal circles, even numbers saffron squares. */
export function markFor(n: number, part: 1 | 2): Mark {
  return part === 1 || n % 2 === 1 ? "circle" : "square";
}

/** Grid columns for a board of `count` marks on a phone held upright. */
export function columnsFor(count: number): number {
  return count <= 4 ? 2 : count <= 12 ? 3 : 4;
}

/**
 * Places the marks in a jittered grid (one per cell, cells shuffled) so they never overlap, and the
 * trail wanders across the board instead of reading left to right.
 */
export function buildTrail(config: TrailConfig, rng: Rng): TrailItem[] {
  const specs: { n: number; mark: Mark; target: boolean }[] = [];
  for (let n = 1; n <= config.length; n++) specs.push({ n, mark: markFor(n, config.part), target: true });
  const decoyNumbers = shuffle(
    Array.from({ length: config.length }, (_, i) => i + 1),
    rng,
  ).slice(0, config.distractors);
  for (const n of decoyNumbers) specs.push({ n, mark: markFor(n, config.part) === "circle" ? "square" : "circle", target: false });

  const cols = columnsFor(specs.length);
  const rows = Math.ceil(specs.length / cols);
  const cells = shuffle(
    Array.from({ length: cols * rows }, (_, i) => i),
    rng,
  );
  return specs.map((spec, i) => {
    const cell = cells[i]!;
    const col = cell % cols;
    const row = Math.floor(cell / cols);
    const jitter = () => (rng() - 0.5) * 0.16;
    return {
      id: i,
      ...spec,
      x: ((col + 0.5 + jitter()) / cols) * 100,
      y: ((row + 0.5 + jitter()) / rows) * 100,
    };
  });
}

/** Median gap between correct taps (TMT's speed per item); recorded, never shown (D2). */
export function medianGap(times: readonly number[]): number | null {
  if (times.length === 0) return null;
  const gaps = times.map((t, i) => t - (i === 0 ? 0 : times[i - 1]!)).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid]! : Math.round((gaps[mid - 1]! + gaps[mid]!) / 2);
}

/** A trail counts as right with at most one wrong tap (research.md 2.2). */
export const MAX_ERRORS_FOR_CORRECT = 1;
