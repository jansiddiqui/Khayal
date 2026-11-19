import type { Signals, Trend, WeekStats } from "../api/client";

/** A patient with no completed sessions yet: no index, no game trends. */
export const EMPTY_TREND: Trend = { cognitive_index: null, cognitive_status: "insufficient", index_history: [], games: [] };

/** No play and no reminders in the last 14 days. */
export const EMPTY_SIGNALS: Signals = {
  days: 14,
  sessions: 0,
  stopped_early_rate: null,
  hint_rate: null,
  adherence: { days: 14, done_by_patient: 0, done_by_caregiver: 0, missed: 0, rate: null },
};

/** A week with nothing in it (the weekly card). */
export const EMPTY_WEEK: WeekStats = {
  start: "2026-11-01", end: "2026-11-07", days_played: 0, sessions: 0, completed: 0, accuracy: null,
  doses: { taken: 0, taken_late: 0, missed: 0, unsure: 0 }, reminders_done: 0, reminders_total: 0, alerts: 0, recordings: 0,
  mood: { good: 0, okay: 0, not_so_good: 0, skipped: 0 },
};

