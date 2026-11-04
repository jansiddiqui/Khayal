import { copy } from "../../copy";
import { shuffle, type Rng } from "../types";

export type Season = keyof typeof copy.seasons;
export type TimeOfDay = keyof typeof copy.timesOfDay;

/** Three-season Indian calendar: Mar–May summer, Jun–Sep monsoon, Oct–Feb winter. */
export function seasonOf(date: Date): Season {
  const m = date.getMonth(); // 0 = January
  if (m >= 2 && m <= 4) return "summer";
  if (m >= 5 && m <= 8) return "monsoon";
  return "winter";
}

/** 5:00–11:59 morning, 12:00–16:59 afternoon, otherwise evening. */
export function timeOfDayOf(date: Date): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

export interface Question {
  prompt: string;
  options: string[];
  answer: string;
  /** Kind reply that always states the right answer. */
  reply: string;
}

const OPTION_COUNT = 4;

function withDistractors(answer: string, pool: readonly string[], rng: Rng): string[] {
  const others = shuffle(
    pool.filter((o) => o.toLowerCase() !== answer.toLowerCase()),
    rng,
  ).slice(0, OPTION_COUNT - 1);
  return shuffle([answer, ...others], rng);
}

/**
 * The 5 questions of a session, in order: day, month, season, time of day, city.
 * Without a city on file the last question asks for the year instead.
 * (After Milestone 6 the city question becomes "Who is this?" when family photos exist.)
 */
export function buildQuestion(index: number, now: Date, city: string | null, rng: Rng): Question {
  const o = copy.games.orientation;
  switch (index) {
    case 0: {
      const day = copy.days[now.getDay()]!;
      return { prompt: o.askDay, answer: day, options: withDistractors(day, copy.days, rng), reply: o.replyDay(day) };
    }
    case 1: {
      const month = copy.months[now.getMonth()]!;
      return { prompt: o.askMonth, answer: month, options: withDistractors(month, copy.months, rng), reply: o.replyMonth(month) };
    }
    case 2: {
      const season = copy.seasons[seasonOf(now)];
      return { prompt: o.askSeason, answer: season, options: shuffle(Object.values(copy.seasons), rng), reply: o.replySeason(season) };
    }
    case 3: {
      const time = copy.timesOfDay[timeOfDayOf(now)];
      return { prompt: o.askTimeOfDay, answer: time, options: shuffle(Object.values(copy.timesOfDay), rng), reply: o.replyTimeOfDay(time) };
    }
    default: {
      if (city) {
        return { prompt: o.askCity, answer: city, options: withDistractors(city, copy.cities, rng), reply: o.replyCity(city) };
      }
      const year = String(now.getFullYear());
      const years = [-2, -1, 1, 2].map((d) => String(now.getFullYear() + d));
      return { prompt: o.askYear, answer: year, options: withDistractors(year, years, rng), reply: o.replyYear(year) };
    }
  }
}
