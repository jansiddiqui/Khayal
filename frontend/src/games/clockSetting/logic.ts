import { shuffle, type Rng } from "../types";

/**
 * "Set the clock" (Clock Setting / Clock Reading after Tuokko's Clock Test; docs/games/research.md
 * 2.3). Setting and reading only, no free drawing (a documented limitation).
 */

export interface Time {
  h: number; // 1–12
  m: number; // 0–55, in 5-minute steps
}

export type Face = "numbers" | "quarters" | "ticks";

export interface ClockRound {
  kind: "set" | "read";
  /** The time to set, or the time the clock shows when reading. */
  time: Time;
  /** Reading rounds: the right answer (for level 10, the time 1½ hours later). */
  answer?: Time;
  face: Face;
  /** Level 9: the time is given in words only ("twenty to four"), no digits. */
  wordsOnly: boolean;
  /** Level 10: "What will the time be in 1½ hours?" */
  later: boolean;
}

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)]!;
const hour = (rng: Rng) => 1 + Math.floor(rng() * 12);

/**
 * Levels from research.md 2.3: 1 read o'clock · 2 set o'clock · 3 half past · 4 quarter past/to ·
 * 5 five-minute steps · 6 the classic "10 past 11" pull · 7 a face with only 12, 3, 6, 9 · 8 ticks
 * only · 9 the time in words only · 10 what the time will be in 1½ hours. Practice: read o'clock.
 */
export function buildClockRound(level: number, rng: Rng, practice = false): ClockRound {
  const l = practice ? 1 : Math.min(10, Math.max(1, Math.round(level)));
  const base = { face: "numbers" as Face, wordsOnly: false, later: false };
  switch (l) {
    case 1:
      return { ...base, kind: "read", time: { h: hour(rng), m: 0 } };
    case 2:
      return { ...base, kind: "set", time: { h: hour(rng), m: 0 } };
    case 3:
      return { ...base, kind: "set", time: { h: hour(rng), m: 30 } };
    case 4:
      return { ...base, kind: "set", time: { h: hour(rng), m: pick([15, 45], rng) } };
    case 5:
      return { ...base, kind: "set", time: { h: hour(rng), m: pick([5, 10, 20, 25, 35, 40, 50, 55], rng) } };
    case 6: {
      // "10 past 11": the number in the words pulls the hour hand towards it.
      const m = pick([10, 20, 40, 50], rng);
      const h = pick([...Array(12).keys()].map((i) => i + 1).filter((x) => x !== m / 5 && x !== m), rng);
      return { ...base, kind: "set", time: { h, m } };
    }
    case 7:
    case 8:
      return { ...base, kind: "set", face: l === 7 ? "quarters" : "ticks", time: { h: hour(rng), m: pick(FIVES, rng) } };
    case 9:
      return { ...base, kind: "set", face: "quarters", wordsOnly: true, time: { h: hour(rng), m: pick(FIVES, rng) } };
    default: {
      const time = { h: hour(rng), m: pick([0, 30], rng) };
      return { ...base, kind: "read", later: true, time, answer: addMinutes(time, 90) };
    }
  }
}

const FIVES = [5, 10, 15, 20, 25, 35, 40, 45, 50, 55] as const;

export function addMinutes(t: Time, minutes: number): Time {
  const total = (((t.h % 12) * 60 + t.m + minutes) % 720 + 720) % 720;
  const h = Math.floor(total / 60);
  return { h: h === 0 ? 12 : h, m: total % 60 };
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "quarter", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "twenty-one", "twenty-two", "twenty-three", "twenty-four", "twenty-five",
];

/** "10 past 11", "half past 3", "quarter to 4", "3 o'clock"; with `asWords`, "twenty to four". */
export function timeWords(t: Time, asWords = false): string {
  const n = (x: number) => (asWords ? NUMBER_WORDS[x]! : String(x));
  const next = t.h === 12 ? 1 : t.h + 1;
  if (t.m === 0) return `${n(t.h)} o'clock`;
  if (t.m === 30) return `half past ${n(t.h)}`;
  if (t.m === 15) return `quarter past ${n(t.h)}`;
  if (t.m === 45) return `quarter to ${n(next)}`;
  return t.m < 30 ? `${n(t.m)} past ${n(t.h)}` : `${n(60 - t.m)} to ${n(next)}`;
}

/** "11:10" */
export const digits = (t: Time) => `${t.h}:${String(t.m).padStart(2, "0")}`;

/** Three answers for a reading round: the right one and two near misses, shuffled. */
export function readingChoices(round: ClockRound, rng: Rng): Time[] {
  const right = round.answer ?? round.time;
  const options = round.later
    ? [addMinutes(right, -30), addMinutes(right, 30), addMinutes(right, 60), addMinutes(round.time, 60)]
    : [addMinutes(right, 60), addMinutes(right, -60), addMinutes(right, 180), { h: right.h, m: 30 }];
  const wrong = shuffle(
    options.filter((o, i, all) => !same(o, right) && all.findIndex((x) => same(x, o)) === i),
    rng,
  ).slice(0, 2);
  return shuffle([right, ...wrong], rng);
}

export const same = (a: Time, b: Time) => a.h === b.h && a.m === b.m;

/* --- setting the hands ------------------------------------------------------------------- */

/** Clockwise degrees from 12 o'clock for a tap at (x, y) relative to the centre (y grows down). */
export function angleOf(x: number, y: number): number {
  return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
}

/** The long hand moves in 5-minute steps (30°). */
export function snapMinute(angle: number): number {
  return (Math.round(angle / 30) % 12) * 5;
}

/** The short hand moves in half-hour steps (15°): its position in hours, 0.5 … 12 (12 = straight up). */
export function hourPosition(angle: number): number {
  const half = Math.round(angle / 15) % 24;
  return half === 0 ? 12 : half / 2;
}

export const hourAngle = (pos: number) => (pos % 12) * 30;
export const minuteAngle = (m: number) => m * 6;

export interface SetResult {
  hourRight: boolean;
  minuteRight: boolean;
}

/**
 * Right (research.md 2.3): the short hand in the right hour sector, and the long hand within one
 * 5-minute step. At o'clock the short hand sits on the hour; otherwise anywhere from the hour to the
 * next hour is accepted (half past, quarter to 4 near the 4).
 */
export function scoreSetting(target: Time, hourPos: number, minute: number): SetResult {
  const h = target.h % 12;
  const pos = hourPos % 12;
  const next = (h + 1) % 12;
  const hourRight =
    target.m === 0 ? pos === h : pos === h || pos === h + 0.5 || pos === next || (h === 11 && pos === 11.5);
  const diff = Math.abs(minute - target.m) % 60;
  const minuteRight = Math.min(diff, 60 - diff) <= 5;
  return { hourRight, minuteRight };
}

/** The error bits stored in GameRound.errors (D1): 1 = short hand, 2 = long hand. */
export const errorBits = (r: SetResult) => (r.hourRight ? 0 : 1) | (r.minuteRight ? 0 : 2);
