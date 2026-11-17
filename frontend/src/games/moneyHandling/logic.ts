import { shuffle, type Rng } from "../types";
import { PRICES, type ItemId } from "./prices";

/**
 * "Market day" (everyday money handling; Lawton IADL "handling finances", financial-capacity
 * tasks; docs/games/research.md 2.4). Money is shown as simplified ₹ tokens, never lifelike notes (D5).
 */

export const NOTES = [10, 20, 50, 100, 200] as const;
export const COINS = [1, 2, 5] as const;

export interface Piece {
  id: number;
  value: number;
  kind: "note" | "coin";
}

export interface Item {
  id: ItemId;
  price: number;
}

export type MarketRound =
  | {
      kind: "pay";
      /** One item, or two (level 6: pay for the cheaper one; level 8: pay for both). */
      items: Item[];
      mode: "one" | "cheaper" | "both";
      /** The exact amount to pay. */
      target: number;
      purse: Piece[];
    }
  | {
      kind: "choose";
      question: "change" | "afford";
      items: Item[];
      /** Level 7 and 9: the note handed over. Level 10: the money available. */
      money: number;
      choices: { key: string; amount?: number; items?: Item[]; correct: boolean }[];
    };

const isNote = (v: number) => (NOTES as readonly number[]).includes(v);

/** The fewest notes and coins that make `amount` (largest first). */
export function decompose(amount: number): number[] {
  const out: number[] = [];
  let rest = amount;
  const largestFirst: number[] = [...NOTES, ...COINS].sort((a, b) => b - a);
  for (const v of largestFirst) {
    while (rest >= v) {
      out.push(v);
      rest -= v;
    }
  }
  return out;
}

/** How the patient pays at each paying level: the pieces that make the price. */
function payPieces(level: number, price: number): number[] | null {
  if (level === 2) return isNote(price / 2) ? [price / 2, price / 2] : null;
  const pieces = decompose(price);
  const coins = pieces.filter((v) => !isNote(v)).length;
  switch (level) {
    case 1:
      return pieces.length === 1 && coins === 0 && price <= 50 ? pieces : null;
    case 3:
      return pieces.length === 2 && coins === 0 && pieces[0] !== pieces[1] ? pieces : null;
    case 4:
      return pieces.length >= 2 && pieces.length <= 3 && coins === 1 ? pieces : null;
    default:
      return pieces.length >= 3 && pieces.length <= 4 ? pieces : null;
  }
}

let nextId = 0;
const piece = (value: number): Piece => ({ id: nextId++, value, kind: isNote(value) ? "note" : "coin" });

/** The pieces to pay with, plus a few that aren't needed. */
function purseFor(pay: number[], extras: number, rng: Rng): Piece[] {
  const pool = [10, 20, 50, 100, 1, 2, 5].filter((v) => !pay.includes(v));
  const extra = shuffle(pool, rng).slice(0, extras);
  return shuffle([...pay, ...extra].map(piece), rng);
}

const ITEMS: Item[] = (Object.keys(PRICES) as ItemId[]).map((id) => ({ id, price: PRICES[id] }));
const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)]!;

function payRound(level: number, rng: Rng): MarketRound {
  const fits = ITEMS.filter((i) => payPieces(level, i.price) !== null);
  const item = pick(fits, rng);
  const pay = payPieces(level, item.price)!;
  // Level 1: the purse holds ₹10, ₹20 and ₹50 notes, one of which is the price.
  const purse = level === 1 ? shuffle([10, 20, 50].map(piece), rng) : purseFor(pay, level <= 2 ? 1 : 2, rng);
  return { kind: "pay", items: [item], mode: "one", target: item.price, purse };
}

function changeChoices(change: number, step: number, rng: Rng) {
  const wrong = [change + step, change - step, change + 2 * step].filter((c) => c > 0 && c !== change).slice(0, 2);
  return shuffle(
    [change, ...wrong].map((amount) => ({ key: `₹${amount}`, amount, correct: amount === change })),
    rng,
  );
}

/** Levels 1–10 from research.md 2.4. Practice: one note that equals the price, and one other note. */
export function buildMarketRound(level: number, rng: Rng, practice = false): MarketRound {
  if (practice) {
    const item = pick(ITEMS.filter((i) => [10, 20, 50].includes(i.price)), rng);
    const other = item.price === 50 ? 10 : 50;
    return { kind: "pay", items: [item], mode: "one", target: item.price, purse: shuffle([piece(item.price), piece(other)], rng) };
  }
  const l = Math.min(10, Math.max(1, Math.round(level)));
  if (l <= 5) return payRound(l, rng);

  if (l === 6) {
    const fits = ITEMS.filter((i) => i.price <= 100 && decompose(i.price).length <= 3);
    const a = pick(fits, rng);
    const b = pick(fits.filter((i) => i.price !== a.price), rng);
    const cheaper = Math.min(a.price, b.price);
    return { kind: "pay", items: [a, b], mode: "cheaper", target: cheaper, purse: purseFor(decompose(cheaper), 2, rng) };
  }
  if (l === 8) {
    const fits = ITEMS.filter((i) => i.price <= 100);
    const a = pick(fits, rng);
    const b = pick(fits.filter((i) => i.id !== a.id && a.price + i.price <= 150), rng);
    const total = a.price + b.price;
    return { kind: "pay", items: [a, b], mode: "both", target: total, purse: purseFor(decompose(total), 2, rng) };
  }
  if (l === 7 || l === 9) {
    // 7: change from a round note (prices in tens); 9: change in coins (prices that aren't).
    const fits = ITEMS.filter((i) => (l === 7 ? i.price % 10 === 0 : i.price % 5 !== 0) && i.price < 100);
    const item = pick(fits, rng);
    const money = item.price < 50 ? 50 : 100;
    return {
      kind: "choose",
      question: "change",
      items: [item],
      money,
      choices: changeChoices(money - item.price, l === 7 ? 10 : 5, rng),
    };
  }
  // Level 10: "You have ₹100. Which two items can you buy?"
  const money = 100;
  const pairs: Item[][] = [];
  for (const a of ITEMS) for (const b of ITEMS) if (a.id < b.id) pairs.push([a, b]);
  const fitsBudget = (p: Item[]) => p[0]!.price + p[1]!.price <= money;
  const right = pick(
    pairs.filter((p) => fitsBudget(p) && p[0]!.price + p[1]!.price >= 70),
    rng,
  );
  const over = shuffle(
    pairs.filter((p) => !fitsBudget(p) && p[0]!.price + p[1]!.price <= 160),
    rng,
  ).slice(0, 2);
  return {
    kind: "choose",
    question: "afford",
    items: [],
    money,
    choices: shuffle(
      [right, ...over].map((items) => ({ key: items.map((i) => i.id).join("+"), items, correct: items === right })),
      rng,
    ),
  };
}

export const total = (pieces: readonly Piece[]) => pieces.reduce((sum, p) => sum + p.value, 0);
