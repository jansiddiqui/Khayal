import type { copy } from "../../copy";
import type { Rng } from "../types";

export type TileId = keyof typeof copy.tiles;

/** Each tile has a colour and a word, so colour is never the only cue. */
export const TILES: readonly { id: TileId; idle: string; lit: string }[] = [
  { id: "red", idle: "bg-red-700 text-white", lit: "bg-red-500 text-white" },
  { id: "blue", idle: "bg-blue-800 text-white", lit: "bg-blue-500 text-white" },
  { id: "green", idle: "bg-green-800 text-white", lit: "bg-green-500 text-white" },
  { id: "yellow", idle: "bg-yellow-400 text-ink", lit: "bg-yellow-200 text-ink" },
];

export interface SequenceConfig {
  length: number;
  /** Time each tile stays lit during playback. */
  litMs: number;
  /** Gap between lit tiles during playback. */
  gapMs: number;
}

/** Level 1 -> 2 tiles ... level 10 -> 7 tiles; playback gets a little quicker. */
export function sequenceConfig(level: number): SequenceConfig {
  const l = Math.min(10, Math.max(1, Math.round(level)));
  return {
    length: 2 + Math.floor(((l - 1) * 5) / 9),
    litMs: 1000 - (l - 1) * 40,
    gapMs: 400,
  };
}

/** Random sequence with no tile repeated twice in a row (repeats are hard to see). */
export function buildSequence(length: number, rng: Rng): TileId[] {
  const out: TileId[] = [];
  while (out.length < length) {
    const options = TILES.filter((t) => t.id !== out[out.length - 1]);
    out.push(options[Math.floor(rng() * options.length)]!.id);
  }
  return out;
}
