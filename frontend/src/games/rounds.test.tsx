import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { copy } from "../copy";
import { buildDeck, memoryMatchConfig } from "./memoryMatch/logic";
import { MemoryMatchRound, MISMATCH_SHOW_MS } from "./memoryMatch/MemoryMatch";
import { buildSequence, sequenceConfig } from "./sequenceRecall/logic";
import { PLAYBACK_DELAY_MS, SequenceRecallRound } from "./sequenceRecall/SequenceRecall";

const rng = () => 0.42;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryMatchRound", () => {
  const { pairs, previewMs } = memoryMatchConfig(1);
  const deck = buildDeck(pairs, rng);
  const cards = () => screen.getAllByRole("button");
  const indexesOf = (face: string) => deck.flatMap((c, i) => (c.face === face ? [i] : []));

  it("previews the cards, then lets the patient find pairs", () => {
    const onComplete = vi.fn();
    render(<MemoryMatchRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);

    expect(screen.getByText(copy.games.memoryMatch.lookCarefully)).toBeInTheDocument();
    expect(cards()[0]).toHaveAccessibleName(copy.cards[deck[0]!.face]);

    act(() => vi.advanceTimersByTime(previewMs));
    expect(screen.getByText(copy.games.memoryMatch.findPairs)).toBeInTheDocument();
    expect(cards()[0]).toHaveAccessibleName(copy.games.memoryMatch.faceDown(1));

    const [a1, a2] = indexesOf(deck[0]!.face) as [number, number];
    const [b1, b2] = indexesOf(deck.find((c) => c.face !== deck[0]!.face)!.face) as [number, number];

    // One mismatch: cards turn back over after a pause.
    fireEvent.click(cards()[a1]!);
    fireEvent.click(cards()[b1]!);
    act(() => vi.advanceTimersByTime(MISMATCH_SHOW_MS));
    expect(cards()[a1]).toHaveAccessibleName(copy.games.memoryMatch.faceDown(a1 + 1));

    act(() => vi.advanceTimersByTime(3000)); // 3s of thinking before finishing
    fireEvent.click(cards()[a1]!);
    fireEvent.click(cards()[a2]!);
    fireEvent.click(cards()[b1]!);
    fireEvent.click(cards()[b2]!);

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({
      correct: true, // 1 mistake <= 2 pairs
      reaction_ms: Math.round((MISMATCH_SHOW_MS + 3000) / pairs),
      hint_used: false,
    });
  });

  it("is not correct when mistakes exceed the number of pairs", () => {
    const onComplete = vi.fn();
    render(<MemoryMatchRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    act(() => vi.advanceTimersByTime(previewMs));

    const [a1, a2] = indexesOf(deck[0]!.face) as [number, number];
    const [b1, b2] = indexesOf(deck.find((c) => c.face !== deck[0]!.face)!.face) as [number, number];
    for (let i = 0; i < 3; i++) {
      fireEvent.click(cards()[a1]!);
      fireEvent.click(cards()[b1]!);
      act(() => vi.advanceTimersByTime(MISMATCH_SHOW_MS));
    }
    [a1, a2, b1, b2].forEach((i) => fireEvent.click(cards()[i]!));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });
});

describe("SequenceRecallRound", () => {
  const { length, litMs, gapMs } = sequenceConfig(1);
  const sequence = buildSequence(length, rng);
  const playbackMs = PLAYBACK_DELAY_MS + length * (litMs + gapMs);
  const tile = (id: string) => screen.getByRole("button", { name: copy.tiles[id as keyof typeof copy.tiles] });

  it("plays the sequence, then accepts the same order as correct", () => {
    const onComplete = vi.fn();
    render(<SequenceRecallRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);

    expect(screen.getByText(copy.games.sequenceRecall.watch)).toBeInTheDocument();
    expect(tile(sequence[0]!)).toBeDisabled();
    act(() => vi.advanceTimersByTime(PLAYBACK_DELAY_MS));
    expect(tile(sequence[0]!)).toHaveAttribute("data-lit", "true");

    act(() => vi.advanceTimersByTime(playbackMs - PLAYBACK_DELAY_MS));
    expect(screen.getByText(copy.games.sequenceRecall.yourTurn)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2500));
    sequence.forEach((id) => fireEvent.click(tile(id)));

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({ correct: true, reaction_ms: 2500, hint_used: false });
  });

  it("ends the round gently on the first out-of-order tap", () => {
    const onComplete = vi.fn();
    render(<SequenceRecallRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    act(() => vi.advanceTimersByTime(playbackMs));

    const wrong = ["red", "blue", "green", "yellow"].find((id) => id !== sequence[0])!;
    fireEvent.click(tile(wrong));
    fireEvent.click(tile(sequence[0]!)); // ignored after the round has ended

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });
});
