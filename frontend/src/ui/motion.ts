import { useReducedMotion, type Transition } from "motion/react";

/**
 * Motion grammar for the app screens (DESIGN.md "Motion", Phase C). One calm curve. Feedback is
 * quick (120-180ms), state changes take 200-300ms, and nothing ever waits for an animation:
 * every control works the moment it is on screen. Under prefers-reduced-motion nothing moves
 * in space; opacity and colour still confirm what happened.
 */
export const EASE_CALM = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  press: 0.12,
  quick: 0.18,
  base: 0.24,
  page: 0.28,
  slow: 0.4,
} as const;

export function calm(duration: number = DURATION.base): Transition {
  return { duration, ease: EASE_CALM };
}

/** True when the visitor asked for less motion. */
export function useLessMotion(): boolean {
  return useReducedMotion() ?? false;
}

/**
 * Tap feedback shared by every pressable thing (buttons, game pieces, list rows): it sinks a
 * little under the finger and settles back. `touch-manipulation` removes the double-tap zoom
 * delay on phones.
 */
export const pressable =
  "touch-manipulation transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-calm " +
  "active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100";

/** Caregiver controls also lift a little under the mouse. */
export const liftOnHover =
  "hover:-translate-y-px hover:shadow-lift-hover motion-reduce:hover:translate-y-0";
