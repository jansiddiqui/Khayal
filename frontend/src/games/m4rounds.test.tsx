import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { copy } from "../copy";
import { renderWithProviders } from "../test/renderWithProviders";
import { DailyOrientationRound } from "./dailyOrientation/DailyOrientation";
import { buildDeck, memoryMatchConfig } from "./memoryMatch/logic";
import { MemoryMatchRound } from "./memoryMatch/MemoryMatch";
import { ReactionTapRound } from "./reactionTap/ReactionTap";
import { buildSequence, sequenceConfig } from "./sequenceRecall/logic";
import { PLAYBACK_DELAY_MS, SequenceRecallRound } from "./sequenceRecall/SequenceRecall";
import { buildWordRound, STAR_COUNT, STARS_DONE_PAUSE_MS, wordCount } from "./wordRecall/logic";
import { WordRecallRound } from "./wordRecall/WordRecall";

const rng = () => 0.42;
const showMeAgain = () => screen.getByRole("button", { name: copy.games.showMeAgain });
const noShowMeAgain = () => expect(screen.queryByRole("button", { name: copy.games.showMeAgain })).toBeNull();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 10, 30)); // Wednesday morning
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Show me again", () => {
  it("Memory Match shows every card again until the patient hides them, once", () => {
    const onComplete = vi.fn();
    const { pairs } = memoryMatchConfig(1);
    const deck = buildDeck(pairs, rng);
    const hide = () => fireEvent.click(screen.getByRole("button", { name: copy.games.memoryMatch.hideCards }));
    render(<MemoryMatchRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    noShowMeAgain(); // not while the cards are up
    act(() => vi.advanceTimersByTime(4000));
    hide();

    fireEvent.click(showMeAgain());
    const cards = () => screen.getAllByRole("button").slice(0, deck.length);
    cards().forEach((card, i) => expect(card).toHaveAccessibleName(copy.cards[deck[i]!.face]));
    noShowMeAgain();
    act(() => vi.advanceTimersByTime(3000));
    hide();
    expect(cards()[0]).toHaveAccessibleName(copy.games.memoryMatch.faceDown(1));

    // Finish with no mistakes: still correct, but flagged as hinted.
    const faces = [...new Set(deck.map((c) => c.face))];
    faces.forEach((face) => deck.forEach((c, i) => c.face === face && fireEvent.click(cards()[i]!)));
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, hint_used: true, study_ms: 7000 }), // 4s + 3s of looking
    );
  });

  it("Sequence Recall replays the sequence once and starts input over", () => {
    const onComplete = vi.fn();
    const { length, litMs, gapMs } = sequenceConfig(1);
    const sequence = buildSequence(length, rng);
    const playbackMs = PLAYBACK_DELAY_MS + length * (litMs + gapMs);
    const tile = (id: string) => screen.getByRole("button", { name: copy.tiles[id as keyof typeof copy.tiles] });
    render(<SequenceRecallRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    noShowMeAgain();
    act(() => vi.advanceTimersByTime(playbackMs));

    fireEvent.click(tile(sequence[0]!)); // one right tap, then ask to see it again
    fireEvent.click(showMeAgain());
    noShowMeAgain();
    expect(tile(sequence[0]!)).toBeDisabled();
    act(() => vi.advanceTimersByTime(playbackMs));

    sequence.forEach((id) => fireEvent.click(tile(id)));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true, hint_used: true }));
  });
});

describe("WordRecallRound", () => {
  const count = wordCount(1);
  const { shown, options } = buildWordRound(count, rng);
  const word = (id: string) => screen.getByRole("button", { name: copy.words[id as keyof typeof copy.words] });

  function playToChoices() {
    render(<WordRecallRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    for (const w of shown) {
      expect(screen.getByText(copy.words[w])).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(10_000)); // no hidden timer: the word stays until "Next word"
      expect(screen.getByText(copy.words[w])).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: copy.games.wordRecall.nextWord }));
    }
    expect(screen.getByText(copy.games.wordRecall.stars)).toBeInTheDocument();
    for (let n = 1; n <= STAR_COUNT; n++) {
      act(() => vi.advanceTimersByTime(60_000)); // the distraction does not end by itself
      fireEvent.click(screen.getByRole("button", { name: copy.games.wordRecall.star(n) }));
      expect(screen.getByRole("button", { name: copy.games.wordRecall.starTapped(n) })).toBeInTheDocument();
    }
    expect(screen.getByText(copy.games.wordRecall.starsDone)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(STARS_DONE_PAUSE_MS));
    expect(screen.getByText(copy.games.wordRecall.choose)).toBeInTheDocument();
  }
  const onComplete = vi.fn();
  beforeEach(() => onComplete.mockReset());

  it("shows words one at a time, distracts, then scores the picks", () => {
    playToChoices();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(options.length);

    shown.forEach((w) => fireEvent.click(word(w)));
    expect(word(shown[0]!)).toHaveAttribute("aria-pressed", "true");
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.click(screen.getByRole("button", { name: copy.games.wordRecall.done }));

    // study_ms = 10s per word, the time spent looking before tapping "Next word".
    expect(onComplete).toHaveBeenCalledWith({
      correct: true,
      reaction_ms: 4000,
      hint_used: false,
      study_ms: 10_000 * shown.length,
    });
  });

  it("hint shows first letters of missing words; wrong picks lower the score", () => {
    playToChoices();
    fireEvent.click(word(shown[0]!));
    fireEvent.click(showMeAgain());
    const letters = shown.slice(1).map((w) => copy.words[w].charAt(0)).join(", ");
    expect(screen.getByRole("status")).toHaveTextContent(copy.games.wordRecall.hintLetters(letters));
    noShowMeAgain();

    const extra = options.find((w) => !shown.includes(w))!;
    shown.slice(1).forEach((w) => fireEvent.click(word(w)));
    fireEvent.click(word(extra)); // (3 − 1) / 3 < 0.8
    fireEvent.click(screen.getByRole("button", { name: copy.games.wordRecall.done }));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: false, hint_used: true }));
  });
});

describe("DailyOrientationRound", () => {
  it("replies kindly with the right answer either way", () => {
    const onComplete = vi.fn();
    renderWithProviders(<DailyOrientationRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    expect(screen.getByText(copy.games.orientation.askDay)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    expect(onComplete).toHaveBeenCalledWith(
      { correct: true, reaction_ms: 1500, hint_used: false },
      "Yes! It's Wednesday today.",
    );
  });

  it("states the right answer after a different pick", () => {
    const onComplete = vi.fn();
    renderWithProviders(<DailyOrientationRound level={1} roundIndex={1} onComplete={onComplete} rng={rng} />);
    const other = screen.getAllByRole("button").find((b) => b.textContent?.includes("November") === false)!;
    fireEvent.click(other);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: false }), "It's November now.");
  });
});

describe("ReactionTapRound", () => {
  const circle = () => screen.getByRole("button");
  const MAX_WAIT = 5000;

  it("times a tap on green", () => {
    const onComplete = vi.fn();
    render(<ReactionTapRound level={1} roundIndex={0} onComplete={onComplete} rng={() => 0} />); // wait 2s
    expect(circle()).toHaveTextContent(copy.games.reactionTap.waiting);
    act(() => vi.advanceTimersByTime(2000));
    expect(circle()).toHaveTextContent(copy.games.reactionTap.green);
    act(() => vi.advanceTimersByTime(450));
    fireEvent.click(circle());
    expect(onComplete).toHaveBeenCalledWith({ correct: true, reaction_ms: 450, hint_used: false });
  });

  it("a missed green after 3 s is not correct and has no reaction time", () => {
    const onComplete = vi.fn();
    render(<ReactionTapRound level={1} roundIndex={0} onComplete={onComplete} rng={() => 0} />);
    act(() => vi.advanceTimersByTime(2000 + 3000));
    expect(onComplete).toHaveBeenCalledWith({ correct: false, reaction_ms: null, hint_used: false });
  });

  it("tapping too early says 'Wait for green' and repeats the trial", () => {
    const onComplete = vi.fn();
    render(<ReactionTapRound level={1} roundIndex={0} onComplete={onComplete} rng={() => 0} />);
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(circle());
    expect(circle()).toHaveTextContent(copy.games.reactionTap.tooEarly);
    act(() => vi.advanceTimersByTime(MAX_WAIT)); // the cancelled trial never turns green
    expect(onComplete).not.toHaveBeenCalled();
    expect(circle()).not.toHaveTextContent(copy.games.reactionTap.tooEarly);
  });

  it("from level 4 a red circle left alone is correct, tapped is not", () => {
    // rng 0 -> red (0 < 40%) and the shortest wait.
    const leftAlone = vi.fn();
    const { unmount } = render(<ReactionTapRound level={10} roundIndex={0} onComplete={leftAlone} rng={() => 0} />);
    expect(screen.getByText(copy.games.reactionTap.instructionsWithRed)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(circle()).toHaveTextContent(copy.games.reactionTap.red);
    act(() => vi.advanceTimersByTime(3000));
    expect(leftAlone).toHaveBeenCalledWith({ correct: true, reaction_ms: null, hint_used: false });
    unmount();

    const tapped = vi.fn();
    render(<ReactionTapRound level={10} roundIndex={0} onComplete={tapped} rng={() => 0} />);
    act(() => vi.advanceTimersByTime(2300));
    fireEvent.click(circle());
    expect(tapped).toHaveBeenCalledWith({ correct: false, reaction_ms: 300, hint_used: false });
  });
});
