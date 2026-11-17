import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Puzzle } from "lucide-react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../../api/client";
import { copy } from "../../copy";
import { renderWithProviders } from "../../test/renderWithProviders";
import { GameSession } from "../GameSession";
import type { GameDefinition, RoundProps } from "../types";
import { commitDelayed, DELAY_MAX_MS, DELAY_MIN_MS, dueDelayed, rememberRound } from "./delayed";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, getLevel: vi.fn(), postSession: vi.fn(), postSessionOnPageHide: vi.fn(), getTodaysGames: vi.fn(), markTutorialSeen: vi.fn() };
});
const api = vi.mocked(apiClient);
const t = copy.games.wordRecall;

function FakeRound({ onComplete }: RoundProps) {
  return <button type="button" onClick={() => onComplete({ correct: true, reaction_ms: 1, hint_used: false })}>Finish round</button>;
}
const game = (type: "memory_match" | "word_recall"): GameDefinition => ({
  type,
  title: "Fake",
  intro: "Play the fake game.",
  icon: Puzzle,
  Round: FakeRound,
  tutorial: { steps: ["Tap."], Demo: () => null },
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.getLevel.mockResolvedValue({ level: 3, tutorial: false });
  api.getTodaysGames.mockResolvedValue({ games: [], pinned: false });
  api.postSession.mockResolvedValue({} as apiClient.SessionResult);
});

describe("delayed word recall timing", () => {
  it("is offered 3–30 minutes after Remember the Words, and dropped after that", () => {
    rememberRound({ shown: ["tea", "bus", "rice"], options: ["tea", "bus", "rice", "lamp", "milk", "clock"] });
    commitDelayed(0);
    expect(dueDelayed(DELAY_MIN_MS - 1)).toBeNull(); // too soon: kept for later
    expect(dueDelayed(DELAY_MIN_MS)?.shown).toEqual(["tea", "bus", "rice"]);
    expect(dueDelayed(DELAY_MAX_MS + 1)).toBeNull(); // too late: dropped
    expect(dueDelayed(DELAY_MIN_MS)).toBeNull();
  });

  it("nothing is kept unless a Remember the Words session finished", () => {
    commitDelayed(0);
    expect(dueDelayed(DELAY_MIN_MS)).toBeNull();
  });
});

describe("delayed word recall check", () => {
  it("comes before the next game, saves one round per word shown, and then the game starts", async () => {
    rememberRound({ shown: ["tea", "bus", "rice"], options: ["rice", "lamp", "tea", "milk", "bus", "clock"] });
    commitDelayed(Date.now() - DELAY_MIN_MS - 1000);
    renderWithProviders(<GameSession game={game("memory_match")} />);

    expect(await screen.findByText(t.delayedAsk)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: copy.words.tea }));
    fireEvent.click(screen.getByRole("button", { name: copy.words.rice }));
    fireEvent.click(screen.getByRole("button", { name: copy.words.lamp })); // not shown earlier
    fireEvent.click(screen.getByRole("button", { name: t.done }));

    await waitFor(() => expect(api.postSession).toHaveBeenCalledOnce());
    const body = api.postSession.mock.calls[0]![0];
    expect(body.game_type).toBe("word_recall_delayed");
    expect(body.completed).toBe(true);
    expect(body.rounds.map((r) => r.correct)).toEqual([true, false, true]);
    expect(body.rounds[0]!.errors).toBe(1);
    // Never says how it went; then on to the game.
    expect(screen.getByRole("status")).toHaveTextContent(t.delayedThanks);
    fireEvent.click(screen.getByRole("button", { name: copy.games.next }));
    expect(await screen.findByRole("button", { name: copy.games.start })).toBeInTheDocument();
    expect(dueDelayed()).toBeNull();
  });

  it("isn't asked inside Remember the Words itself", async () => {
    rememberRound({ shown: ["tea", "bus", "rice"], options: ["tea", "bus", "rice"] });
    commitDelayed(Date.now() - DELAY_MIN_MS - 1000);
    renderWithProviders(<GameSession game={game("word_recall")} />);
    expect(await screen.findByRole("button", { name: copy.games.start })).toBeInTheDocument();
    expect(screen.queryByText(t.delayedAsk)).toBeNull();
  });
});
