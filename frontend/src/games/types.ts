import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { GameType, RoundResult, User } from "../api/client";

export type { RoundResult };

/** A random-number source in [0, 1); injectable so rounds are testable. */
export type Rng = () => number;

/**
 * One round of a game. It reports exactly once, when the round is over. `feedback`
 * replaces the default "Well done!" / "Let's try another." message shown afterwards.
 */
export interface RoundProps {
  level: number;
  /** 0-based position of this round in the session. */
  roundIndex: number;
  onComplete: (result: RoundResult, feedback?: string) => void;
  rng?: Rng;
  /**
   * The first-time practice round (research.md 3.4): easier than level 1, the answer is shown
   * gently if needed, and the result is never stored.
   */
  practice?: boolean;
}

/** The first-time tutorial: a few short spoken sentences and a small demo of one move. */
export interface Tutorial {
  steps: readonly string[];
  Demo: ComponentType;
}

export interface GameDefinition {
  type: GameType;
  title: string;
  intro: string;
  icon: LucideIcon;
  Round: ComponentType<RoundProps>;
  tutorial: Tutorial;
  /** True when this session gets one extra round (About Today's festival question, D6). */
  extraRound?: (user: User | null, now: Date) => boolean;
}

/** Fisher–Yates shuffle that returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
