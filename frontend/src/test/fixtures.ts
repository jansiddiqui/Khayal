import type { Signals, Trend } from "../api/client";

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
