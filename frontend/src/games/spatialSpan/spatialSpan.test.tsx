import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { copy } from "../../copy";
import { buildSpan, spanConfig, SQUARES } from "./logic";
import { SPAN_DELAY_MS, SPAN_REPLAY_PAUSE_MS, SpatialSpanRound } from "./SpatialSpan";

const t = copy.games.spatialSpan;
const rng = () => 0.42;

describe("Tap the squares logic", () => {
  it("grows from 2 to 7 squares over the levels, and never repeats a square", () => {
    expect(spanConfig(1).length).toBe(2);
    expect(spanConfig(10).length).toBe(7);
    expect(spanConfig(1, true)).toMatchObject({ length: 2, litMs: 1200 });
    for (let level = 1; level <= 10; level++) {
      const order = buildSpan(spanConfig(level).length, Math.random);
      expect(new Set(order).size).toBe(order.length);
      expect(order.every((s) => s >= 0 && s < SQUARES)).toBe(true);
    }
  });
});

describe("Tap the squares round", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const { length, litMs, gapMs } = spanConfig(3);
  const order = buildSpan(length, rng);
  const playback = SPAN_DELAY_MS + length * (litMs + gapMs);
  const tapSquare = (i: number) => fireEvent.click(screen.getByRole("button", { name: t.square(i + 1) }));

  it("lights the squares in turn, then takes taps in the same order", () => {
    const onComplete = vi.fn();
    render(<SpatialSpanRound level={3} roundIndex={0} onComplete={onComplete} rng={rng} />);
    expect(screen.getAllByRole("button")).toHaveLength(SQUARES);
    act(() => vi.advanceTimersByTime(SPAN_DELAY_MS + 1));
    expect(screen.getByRole("button", { name: t.square(order[0]! + 1) })).toHaveAttribute("data-lit", "true");
    act(() => vi.advanceTimersByTime(playback));
    expect(screen.getByText(t.yourTurn)).toBeInTheDocument();
    order.forEach(tapSquare);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true, hint_used: false }));
  });

  it("replays the right order gently after a wrong tap, then ends the round", () => {
    const onComplete = vi.fn();
    render(<SpatialSpanRound level={3} roundIndex={0} onComplete={onComplete} rng={rng} />);
    act(() => vi.advanceTimersByTime(playback + 1));
    const wrong = [...Array(SQUARES).keys()].find((s) => s !== order[0])!;
    tapSquare(wrong);
    expect(screen.getByText(copy.games.sequenceRecall.replay)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(playback + SPAN_REPLAY_PAUSE_MS + 1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });

  it("'Show me again' replays once and counts as a hint", () => {
    const onComplete = vi.fn();
    render(<SpatialSpanRound level={3} roundIndex={0} onComplete={onComplete} rng={rng} />);
    act(() => vi.advanceTimersByTime(playback + 1));
    fireEvent.click(screen.getByRole("button", { name: copy.games.showMeAgain }));
    act(() => vi.advanceTimersByTime(playback + 1));
    order.forEach(tapSquare);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true, hint_used: true }));
  });
});
