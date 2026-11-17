import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { copy } from "../../copy";
import { ColourTrailsRound } from "./ColourTrails";
import { buildTrail, markFor, medianGap, trailConfig } from "./logic";

const t = copy.games.colourTrails;
const rng = () => 0.42;

describe("Join in order logic", () => {
  it("follows the levels in research.md 2.2", () => {
    expect(trailConfig(1)).toEqual({ part: 1, length: 5, distractors: 0 });
    expect(trailConfig(4)).toEqual({ part: 1, length: 12, distractors: 0 });
    expect(trailConfig(5)).toEqual({ part: 2, length: 6, distractors: 3 });
    expect(trailConfig(10)).toEqual({ part: 2, length: 16, distractors: 8 });
    expect(trailConfig(1, true)).toEqual({ part: 1, length: 3, distractors: 0 });
  });

  it("alternates teal circles and saffron squares in part 2 only", () => {
    expect([1, 2, 3].map((n) => markFor(n, 1))).toEqual(["circle", "circle", "circle"]);
    expect([1, 2, 3].map((n) => markFor(n, 2))).toEqual(["circle", "square", "circle"]);
  });

  it("places every mark in its own cell, with decoys in the other colour", () => {
    for (let level = 1; level <= 10; level++) {
      const config = trailConfig(level);
      const items = buildTrail(config, Math.random);
      expect(items.filter((i) => i.target).map((i) => i.n)).toEqual(Array.from({ length: config.length }, (_, i) => i + 1));
      for (const decoy of items.filter((i) => !i.target)) expect(decoy.mark).not.toBe(markFor(decoy.n, config.part));
      // No two marks closer than a cell allows (centres stay apart).
      for (const a of items)
        for (const b of items) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5);
      for (const i of items) {
        expect(i.x).toBeGreaterThan(0);
        expect(i.x).toBeLessThan(100);
        expect(i.y).toBeGreaterThan(0);
        expect(i.y).toBeLessThan(100);
      }
    }
  });

  it("times each step between joins", () => {
    expect(medianGap([1000, 2500, 3100])).toBe(1000);
    expect(medianGap([])).toBeNull();
  });
});

describe("Join in order round", () => {
  const tapNumber = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

  it("joins numbers in order and counts a wrong tap without ending the round", () => {
    const onComplete = vi.fn();
    render(<ColourTrailsRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    expect(screen.getByText(t.promptPart1)).toBeInTheDocument();

    tapNumber("1");
    tapNumber("3"); // not next
    expect(screen.getByText(t.lookFor(2, null))).toBeInTheDocument();
    expect(screen.getByText(t.joinedOf(1, 5))).toBeInTheDocument();
    for (const n of ["2", "3", "4", "5"]) tapNumber(n);

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0]![0]).toMatchObject({ correct: true, hint_used: false, errors: 1 });
    expect(screen.getByRole("button", { name: t.joinedName("5") })).toBeInTheDocument();
  });

  it("is not right with two wrong taps, and never says wrong", () => {
    const onComplete = vi.fn();
    const { container } = render(<ColourTrailsRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    tapNumber("2");
    tapNumber("4");
    for (const n of ["1", "2", "3", "4", "5"]) tapNumber(n);
    expect(onComplete.mock.calls[0]![0]).toMatchObject({ correct: false, errors: 2 });
    expect(container.textContent).not.toMatch(/wrong|mistake/i);
  });

  it("in part 2, the same number in the other colour is left alone", () => {
    const onComplete = vi.fn();
    render(<ColourTrailsRound level={5} roundIndex={0} onComplete={onComplete} rng={rng} />);
    const decoy = buildTrail(trailConfig(5), rng).find((i) => !i.target)!;
    tapNumber(t.markName(decoy.n, decoy.mark));
    expect(screen.getByText(t.lookFor(1, "circle"))).toBeInTheDocument();
    for (let n = 1; n <= 6; n++) tapNumber(t.markName(n, markFor(n, 2)));
    expect(onComplete.mock.calls[0]![0]).toMatchObject({ correct: true, errors: 1 });
  });

  it("practice shows the next number after a slip", () => {
    render(<ColourTrailsRound level={1} practice roundIndex={0} onComplete={vi.fn()} rng={rng} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    tapNumber("2");
    expect(screen.getByRole("button", { name: "1" }).className).toMatch(/calm-glow/);
  });
});
