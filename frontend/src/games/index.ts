import type { GameType } from "../api/client";
import { memoryMatch } from "./memoryMatch/MemoryMatch";
import { sequenceRecall } from "./sequenceRecall/SequenceRecall";
import type { GameDefinition } from "./types";

/** Games shown to patients, in list order. */
export const GAMES: readonly GameDefinition[] = [memoryMatch, sequenceRecall];

export function findGame(type: string | undefined): GameDefinition | undefined {
  return GAMES.find((g) => g.type === (type as GameType));
}
