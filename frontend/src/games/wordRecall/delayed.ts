import type { WordId } from "./logic";

/**
 * Delayed word recall (docs/games/research.md 3.1, D4). After a finished Remember the Words session,
 * the last round's words and pick list are kept on this device. The check is offered at the start
 * of the next game the patient opens, if 3–30 minutes have passed; after 30 minutes it is dropped,
 * so nothing is ever asked out of context.
 */

export const DELAY_MIN_MS = 3 * 60_000;
export const DELAY_MAX_MS = 30 * 60_000;
const KEY = "khayal.delayedRecall";

export interface PendingRecall {
  shown: WordId[];
  options: WordId[];
  /** When the Remember the Words session ended (ms since epoch). */
  at: number;
}

let lastRound: Omit<PendingRecall, "at"> | null = null;

/** Each Remember the Words round reports its words; the last one of the session is the one kept. */
export function rememberRound(round: Omit<PendingRecall, "at">): void {
  lastRound = round;
}

/** The session was saved as finished: keep its last round for later. */
export function commitDelayed(now = Date.now()): void {
  if (!lastRound) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...lastRound, at: now }));
  } catch {
    // Storage blocked: no delayed check this time.
  }
  lastRound = null;
}

function read(): PendingRecall | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingRecall) : null;
  } catch {
    return null;
  }
}

export function clearDelayed(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The check to offer now, if 3–30 minutes have passed. Too late: it is dropped. Too soon: kept. */
export function dueDelayed(now = Date.now()): PendingRecall | null {
  const pending = read();
  if (!pending || !Array.isArray(pending.shown) || pending.shown.length === 0) return null;
  const age = now - pending.at;
  if (age > DELAY_MAX_MS || age < 0) {
    clearDelayed();
    return null;
  }
  return age >= DELAY_MIN_MS ? pending : null;
}
