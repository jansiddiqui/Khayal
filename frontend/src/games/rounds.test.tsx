import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { copy } from "../copy";
import { buildDeck, memoryMatchConfig } from "./memoryMatch/logic";
import { MemoryMatchRound, MISMATCH_SHOW_MS } from "./memoryMatch/MemoryMatch";
import { buildSequence, sequenceConfig } from "./sequenceRecall/logic";
import { PLAYBACK_DELAY_MS, REPLAY_END_PAUSE_MS, SequenceRecallRound } from "./sequenceRecall/SequenceRecall";

const rng = () => 0.42;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryMatchRound", () => {
  const { pairs } = memoryMatchConfig(1);
  const deck = buildDeck(pairs, rng);
  const cards = () => screen.getAllByRole("button");
  const indexesOf = (face: string) => deck.flatMap((c, i) => (c.face === face ? [i] : []));
  const hideCards = () => fireEvent.click(screen.getByRole("button", { name: copy.games.memoryMatch.hideCards }));

  it("keeps the cards up until the patient hides them, then lets them find pairs", () => {
    const onComplete = vi.fn();
    render(<MemoryMatchRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);

    expect(screen.getByText(copy.games.memoryMatch.lookCarefully)).toBeInTheDocument();
    expect(cards()[0]).toHaveAccessibleName(copy.cards[deck[0]!.face]);

    // No hidden timer: after a long look the cards are still face up.
    act(() => vi.advanceTimersByTime(60_000));
    expect(cards()[0]).toHaveAccessibleName(copy.cards[deck[0]!.face]);
    hideCards();
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
      study_ms: 60_000, // how long the patient looked
    });
  });

  it("is not correct when mistakes exceed the number of pairs", () => {
    const onComplete = vi.fn();
    render(<MemoryMatchRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    hideCards();

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

  it("after a wrong tap, gently replays the right order before ending the round", () => {
    const onComplete = vi.fn();
    render(<SequenceRecallRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    act(() => vi.advanceTimersByTime(playbackMs));

    const wrong = ["red", "blue", "green", "yellow"].find((id) => id !== sequence[0])!;
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(tile(wrong));
    fireEvent.click(tile(sequence[0]!)); // ignored: the tiles are disabled during the replay

    expect(screen.getByText(copy.games.sequenceRecall.replay)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(PLAYBACK_DELAY_MS));
    expect(tile(sequence[0]!)).toHaveAttribute("data-lit", "true");

    act(() => vi.advanceTimersByTime(playbackMs - PLAYBACK_DELAY_MS + REPLAY_END_PAUSE_MS));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({ correct: false, reaction_ms: 1500, hint_used: false });
  });

  it("lights a tile white with a coloured border, keeping its text readable", () => {
    render(<SequenceRecallRound level={1} roundIndex={0} onComplete={vi.fn()} rng={rng} />);
    act(() => vi.advanceTimersByTime(PLAYBACK_DELAY_MS));
    const lit = tile(sequence[0]!);
    expect(lit).toHaveClass("bg-white");
    expect(lit.className).not.toContain("opacity");
  });
});
