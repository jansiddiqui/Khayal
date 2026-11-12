import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { copy } from "../copy";
import { renderWithProviders } from "../test/renderWithProviders";
import { DailyOrientationRound } from "./dailyOrientation/DailyOrientation";
import { CARD_ART } from "./memory/art";
import { CARD_FACES } from "./memoryMatch/logic";
import { buildWordRound, MAX_OPTIONS, wordCount } from "./wordRecall/logic";
import { WordRecallRound } from "./wordRecall/WordRecall";

const rng = () => 0.42;
const spoken: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 10, 30)); // Wednesday morning
  spoken.length = 0;
  localStorage.setItem("khayal.readAloud", "on");
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    lang = "";
    rate = 1;
    constructor(public text: string) {}
  });
  vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: (u: { text: string }) => spoken.push(u.text) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Word Recall pick list", () => {
  it("has at most 12 words: every shown word plus new ones", () => {
    for (let level = 1; level <= 10; level++) {
      const count = wordCount(level);
      const { shown, options } = buildWordRound(count, rng);
      expect(options).toHaveLength(Math.min(count * 2, MAX_OPTIONS));
      shown.forEach((w) => expect(options).toContain(w));
      expect(new Set(options).size).toBe(options.length);
    }
    expect(buildWordRound(wordCount(10), rng).options).toHaveLength(12); // 8 shown + 4 new
  });
});

describe("read aloud in games", () => {
  it("speaks each question with its answer choices", () => {
    renderWithProviders(<DailyOrientationRound level={1} roundIndex={0} onComplete={vi.fn()} rng={rng} />);
    const options = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(spoken).toContain(`${copy.games.orientation.askDay} ${copy.common.spokenChoices(options)}`);
  });

  it("speaks each word, then the question with every word to choose from", () => {
    renderWithProviders(<WordRecallRound level={1} roundIndex={0} onComplete={vi.fn()} rng={rng} />);
    const { shown, options } = buildWordRound(wordCount(1), rng);
    for (const w of shown) {
      expect(spoken[spoken.length - 1]).toBe(`${copy.games.wordRecall.remember}: ${copy.words[w]}`);
      fireEvent.click(screen.getByRole("button", { name: copy.games.wordRecall.nextWord }));
    }
    for (let n = 1; n <= 5; n++) fireEvent.click(screen.getByRole("button", { name: copy.games.wordRecall.star(n) }));
    act(() => vi.advanceTimersByTime(1000));
    expect(spoken[spoken.length - 1]).toBe(
      `${copy.games.wordRecall.choose} ${copy.common.spokenChoices(options.map((w) => copy.words[w]))}`,
    );
  });

  it("joins choices the way people say them", () => {
    expect(copy.common.spokenChoices(["Summer", "Monsoon", "Winter"])).toBe("Summer, Monsoon, or Winter?");
    expect(copy.common.spokenChoices(["Yes"])).toBe("Yes");
  });
});

describe("Memory Match card art", () => {
  it("has one flat illustration for every card face, and no emoji", () => {
    for (const { id } of CARD_FACES) {
      const Picture = CARD_ART[id];
      const { container, unmount } = render(<Picture className="h-16" />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(container.textContent).toBe("");
      unmount();
    }
  });
});
