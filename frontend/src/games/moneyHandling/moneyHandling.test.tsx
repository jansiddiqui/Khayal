import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { copy } from "../../copy";
import { ANSWER_HOLD_MS } from "../Answer";
import { buildMarketRound, decompose, NOTES, total } from "./logic";
import { MoneyHandlingRound } from "./MoneyHandling";
import { PRICES } from "./prices";

const t = copy.games.market;
const rng = () => 0.37;

describe("Market day logic", () => {
  it("makes amounts from the fewest notes and coins", () => {
    expect(decompose(85)).toEqual([50, 20, 10, 5]);
    expect(decompose(37)).toEqual([20, 10, 5, 2]);
    expect(decompose(200)).toEqual([200]);
  });

  it("every item has a name and a price", () => {
    expect(Object.keys(PRICES).sort()).toEqual(Object.keys(copy.market).sort());
  });

  it("each paying level can be paid exactly from the purse, the way the level asks", () => {
    for (let level = 1; level <= 8; level++) {
      if (level === 7) continue;
      for (let i = 0; i < 40; i++) {
        const round = buildMarketRound(level, Math.random);
        expect(round.kind).toBe("pay");
        if (round.kind !== "pay") continue;
        // The purse always holds an exact way to pay.
        const values = round.purse.map((p) => p.value);
        const canPay = (target: number, from: number[]): boolean =>
          target === 0 || from.some((v, j) => v <= target && canPay(target - v, from.slice(j + 1)));
        expect(canPay(round.target, values)).toBe(true);
        if (level === 1) expect(values.sort((a, b) => a - b)).toEqual([10, 20, 50]);
        if (level === 2) expect(round.purse.filter((p) => p.value === round.target / 2).length).toBeGreaterThanOrEqual(2);
        if (level === 6) expect(round.target).toBe(Math.min(...round.items.map((x) => x.price)));
        if (level === 8) expect(round.target).toBe(round.items[0]!.price + round.items[1]!.price);
      }
    }
  });

  it("asks about change and budgets with exactly one right answer", () => {
    for (const level of [7, 9, 10]) {
      for (let i = 0; i < 30; i++) {
        const round = buildMarketRound(level, Math.random);
        expect(round.kind).toBe("choose");
        if (round.kind !== "choose") continue;
        expect(round.choices).toHaveLength(3);
        expect(round.choices.filter((c) => c.correct)).toHaveLength(1);
        if (round.question === "change") {
          const right = round.choices.find((c) => c.correct)!;
          expect(right.amount).toBe(round.money - round.items[0]!.price);
          if (level === 7) expect(round.items[0]!.price % 10).toBe(0);
          if (level === 9) expect(round.items[0]!.price % 5).not.toBe(0);
        } else {
          for (const c of round.choices) expect(c.items!.reduce((s, x) => s + x.price, 0) <= round.money).toBe(c.correct);
        }
      }
    }
  });

  it("practice is one note that equals the price, and one other", () => {
    const round = buildMarketRound(5, rng, true);
    expect(round.kind).toBe("pay");
    if (round.kind === "pay") {
      expect(round.purse).toHaveLength(2);
      expect(round.purse.map((p) => p.value)).toContain(round.target);
      expect(NOTES).toContain(round.target);
    }
  });
});

describe("Market day round", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("moves money to the counter and back, and pays the exact amount", () => {
    const onComplete = vi.fn();
    render(<MoneyHandlingRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    const round = buildMarketRound(1, rng);
    if (round.kind !== "pay") throw new Error("level 1 pays");
    expect(screen.getByRole("button", { name: t.pay })).toBeDisabled();

    const wrongNote = [10, 20, 50].find((v) => v !== round.target)!;
    fireEvent.click(screen.getByRole("button", { name: t.give(wrongNote) }));
    fireEvent.click(screen.getByRole("button", { name: t.takeBack(wrongNote) }));
    fireEvent.click(screen.getByRole("button", { name: t.give(round.target) }));
    fireEvent.click(screen.getByRole("button", { name: t.pay }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true }), t.exactly(round.target));
  });

  it("paying the wrong amount says what it came to, without 'wrong'", () => {
    const onComplete = vi.fn();
    render(<MoneyHandlingRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    const round = buildMarketRound(1, rng);
    if (round.kind !== "pay") throw new Error("level 1 pays");
    const wrongNote = [10, 20, 50].find((v) => v !== round.target)!;
    fireEvent.click(screen.getByRole("button", { name: t.give(wrongNote) }));
    fireEvent.click(screen.getByRole("button", { name: t.pay }));
    const [result, reply] = onComplete.mock.calls[0]!;
    expect(result.correct).toBe(false);
    expect(reply).toBe(t.notQuite(wrongNote, round.target));
    expect(reply).not.toMatch(/wrong/i);
  });

  it("practice points to the right note after a slip and waits", () => {
    const onComplete = vi.fn();
    render(<MoneyHandlingRound level={1} practice roundIndex={0} onComplete={onComplete} rng={rng} />);
    const round = buildMarketRound(1, rng, true);
    if (round.kind !== "pay") throw new Error("practice pays");
    const other = round.purse.find((p) => p.value !== round.target)!;
    fireEvent.click(screen.getByRole("button", { name: t.give(other.value) }));
    fireEvent.click(screen.getByRole("button", { name: t.pay }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText(t.practiceHint(round.target))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.give(round.target) }));
    fireEvent.click(screen.getByRole("button", { name: t.pay }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("works out change with three choices", () => {
    const onComplete = vi.fn();
    render(<MoneyHandlingRound level={7} roundIndex={0} onComplete={onComplete} rng={rng} />);
    const round = buildMarketRound(7, rng);
    if (round.kind !== "choose") throw new Error("level 7 asks");
    const right = round.choices.find((c) => c.correct)!;
    fireEvent.click(screen.getByRole("button", { name: `₹${right.amount}` }));
    act(() => vi.advanceTimersByTime(ANSWER_HOLD_MS));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true }), expect.stringContaining(`₹${right.amount} back`));
    expect(total([])).toBe(0);
  });
});
