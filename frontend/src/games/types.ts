import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { GameType, RoundResult } from "../api/client";

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
}

export interface GameDefinition {
  type: GameType;
  title: string;
  intro: string;
  icon: LucideIcon;
  Round: ComponentType<RoundProps>;
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
