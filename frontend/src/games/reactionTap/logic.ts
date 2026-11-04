import type { Rng } from "../types";

/** The circle stays green (or red) this long; tapping green within it is correct. */
export const RESPONSE_WINDOW_MS = 3000;
/** How long "Wait for green" shows before the trial restarts. */
export const TOO_EARLY_PAUSE_MS = 1500;
const MIN_WAIT_MS = 2000;
const MAX_WAIT_MS = 5000;
/** Red "don't tap" circles start at this level. */
export const RED_FROM_LEVEL = 4;

/** Random wait of 2–5 s before the circle changes colour. */
export function waitMs(rng: Rng): number {
  return Math.round(MIN_WAIT_MS + rng() * (MAX_WAIT_MS - MIN_WAIT_MS));
}

/** No red below level 4; then 10% rising by 5% per level to 40% at level 10. */
export function redChance(level: number): number {
  const l = Math.min(10, Math.max(1, Math.round(level)));
  if (l < RED_FROM_LEVEL) return 0;
  return Math.min(0.4, 0.1 + (l - RED_FROM_LEVEL) * 0.05);
}
