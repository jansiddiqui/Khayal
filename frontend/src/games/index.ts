import type { GameType } from "../api/client";
import { dailyOrientation } from "./dailyOrientation/DailyOrientation";
import { memoryMatch } from "./memoryMatch/MemoryMatch";
import { reactionTap } from "./reactionTap/ReactionTap";
import { sequenceRecall } from "./sequenceRecall/SequenceRecall";
import type { GameDefinition } from "./types";
import { wordRecall } from "./wordRecall/WordRecall";

/** Every game. Which 3 a patient sees each day is decided by the server (GET /me/games/today). */
export const GAMES: readonly GameDefinition[] = [memoryMatch, sequenceRecall, wordRecall, dailyOrientation, reactionTap];

/** Any game can be opened directly, not just today's three. */
export function findGame(type: string | undefined): GameDefinition | undefined {
  return GAMES.find((g) => g.type === (type as GameType));
}
