import type { GameType } from "../api/client";
import { dailyOrientation } from "./dailyOrientation/DailyOrientation";
import { memoryMatch } from "./memoryMatch/MemoryMatch";
import { reactionTap } from "./reactionTap/ReactionTap";
import { sequenceRecall } from "./sequenceRecall/SequenceRecall";
import type { GameDefinition } from "./types";
import { wordRecall } from "./wordRecall/WordRecall";

/** Games shown to patients, in list order. */
export const GAMES: readonly GameDefinition[] = [memoryMatch, sequenceRecall, wordRecall, dailyOrientation, reactionTap];

export function findGame(type: string | undefined): GameDefinition | undefined {
  return GAMES.find((g) => g.type === (type as GameType));
}
