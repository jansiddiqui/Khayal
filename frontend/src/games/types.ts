import type { ComponentType } from "react";
import type { GameType, RoundResult } from "../api/client";

export type { RoundResult };

/** A random-number source in [0, 1); injectable so rounds are testable. */
export type Rng = () => number;

/** One round of a game. It reports exactly once, when the round is over. */
export interface RoundProps {
  level: number;
  onComplete: (result: RoundResult) => void;
  rng?: Rng;
}

export interface GameDefinition {
  type: GameType;
  title: string;
  intro: string;
  icon: string;
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
