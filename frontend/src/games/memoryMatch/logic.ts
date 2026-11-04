import { copy } from "../../copy";
import { shuffle, type Rng } from "../types";

export type CardFace = keyof typeof copy.cards;

/** Familiar everyday Indian images, drawn with emoji (no image files). */
export const CARD_FACES: readonly { id: CardFace; emoji: string }[] = [
  { id: "chai", emoji: "☕" },
  { id: "roti", emoji: "🫓" },
  { id: "mango", emoji: "🥭" },
  { id: "auto", emoji: "🛺" },
  { id: "marigold", emoji: "🌼" },
  { id: "cricket", emoji: "🏏" },
  { id: "diya", emoji: "🪔" },
  { id: "kite", emoji: "🪁" },
  { id: "elephant", emoji: "🐘" },
  { id: "coconut", emoji: "🥥" },
];

export interface MemoryMatchConfig {
  pairs: number;
  /** How long every card is shown face up before play starts. Not shown as a countdown. */
  previewMs: number;
}

/** Level 1 -> 2 pairs ... level 9-10 -> 10 pairs; preview shortens from 6s to 2.4s. */
export function memoryMatchConfig(level: number): MemoryMatchConfig {
  const l = Math.min(10, Math.max(1, Math.round(level)));
  return {
    pairs: Math.min(CARD_FACES.length, l + 1),
    previewMs: 6000 - (l - 1) * 400,
  };
}

export interface DeckCard {
  /** Position-independent identity of this physical card. */
  key: number;
  face: CardFace;
}

export function buildDeck(pairs: number, rng: Rng): DeckCard[] {
  const faces = shuffle(CARD_FACES, rng).slice(0, pairs);
  const cards = faces.flatMap((f) => [f.id, f.id]).map((face, key) => ({ key, face }));
  return shuffle(cards, rng);
}

/** M3 decision: a board counts as correct when mistakes <= number of pairs. */
export function isBoardCorrect(mistakes: number, pairs: number): boolean {
  return mistakes <= pairs;
}

export function emojiFor(face: CardFace): string {
  return CARD_FACES.find((f) => f.id === face)?.emoji ?? "❓";
}
