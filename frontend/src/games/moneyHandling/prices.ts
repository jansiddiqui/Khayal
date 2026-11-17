/**
 * Market day prices (₹), roughly what a neighbourhood shop in an Indian city charges in 2026.
 * Edit freely: each level picks items whose price fits that level's way of paying
 * (docs/games/research.md 2.4). Names are patient text, so they live in copy.ts.
 */
import type { copy } from "../../copy";

export type ItemId = keyof typeof copy.market;

export const PRICES: Readonly<Record<ItemId, number>> = {
  biscuits: 10,
  coriander: 20,
  potatoes: 30,
  milk: 30,
  tomatoes: 40,
  onions: 40,
  coconut: 40,
  sugar: 45,
  bread: 50,
  atta: 55,
  bananas: 60,
  rice: 70,
  soap: 35,
  notebook: 25,
  pen: 12,
  toothpaste: 95,
  tea: 110,
  dal: 120,
  apples: 150,
  turmeric: 100,
  oil: 200,
  curd: 37,
  matches: 2,
  candles: 23,
};
