import { shuffle, type Rng } from "../../types";
import { FESTIVALS_2026 } from "./2026";
import { FESTIVALS_2027 } from "./2027";

/**
 * About Today's festival question (docs/games/research.md 3.3, D6; our own item, not validated).
 * "Which festival comes next?" is asked only in the 30 days before a festival the caregiver
 * ticked for this family. There is no default list: with none ticked, the question is off.
 * Dates move every year (lunar calendar), so each year has its own table. Add next year's table
 * here before the year starts; without one, the question simply isn't asked.
 */

export const FESTIVAL_IDS = [
  "makar_sankranti",
  "pongal",
  "holi",
  "eid_ul_fitr",
  "vaisakhi",
  "bakrid",
  "onam",
  "raksha_bandhan",
  "janmashtami",
  "ganesh_chaturthi",
  "durga_puja",
  "dussehra",
  "diwali",
  "guru_nanak_jayanti",
  "christmas",
] as const;
export type FestivalId = (typeof FESTIVAL_IDS)[number];

const TABLES = [FESTIVALS_2026, FESTIVALS_2027];
/** How far ahead the question looks. */
export const FESTIVAL_WINDOW_DAYS = 30;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The next date of a festival on or after `today`, from the yearly tables (null if not listed). */
export function nextDate(id: FestivalId, today: Date): string | null {
  const key = dayKey(today);
  const dates = TABLES.map((t) => t[id]).filter((d) => d >= key).sort();
  return dates[0] ?? null;
}

const isFestival = (x: string): x is FestivalId => (FESTIVAL_IDS as readonly string[]).includes(x);

/** The family's next festival, if it is within 30 days (including today). */
export function dueFestival(chosen: readonly string[] | null | undefined, today: Date): FestivalId | null {
  const key = dayKey(today);
  const upcoming = (chosen ?? [])
    .filter(isFestival)
    .map((id) => ({ id, date: nextDate(id, today) }))
    .filter((f): f is { id: FestivalId; date: string } => f.date !== null && daysBetween(key, f.date) <= FESTIVAL_WINDOW_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0]?.id ?? null;
}

export interface FestivalQuestion {
  answer: FestivalId;
  options: FestivalId[];
}

/**
 * The right festival plus two that come later: the family's own first, then others, so "next"
 * is never ambiguous (a festival on the same day or sooner is never offered).
 */
export function festivalQuestion(chosen: readonly string[], today: Date, rng: Rng): FestivalQuestion | null {
  const answer = dueFestival(chosen, today);
  if (!answer) return null;
  const answerDate = nextDate(answer, today)!;
  const later = (id: FestivalId) => {
    const d = nextDate(id, today);
    return d === null || d > answerDate;
  };
  const own = shuffle(chosen.filter(isFestival).filter((id) => id !== answer && later(id)), rng);
  const others = shuffle(FESTIVAL_IDS.filter((id) => id !== answer && !own.includes(id) && later(id)), rng);
  const options = shuffle([answer, ...[...own, ...others].slice(0, 2)], rng);
  return { answer, options };
}
