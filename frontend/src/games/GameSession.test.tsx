import { fireEvent, screen } from "@testing-library/react";
import { Puzzle } from "lucide-react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { SessionResult } from "../api/client";
import { copy } from "../copy";
import { renderWithProviders } from "../test/renderWithProviders";
import { GameSession, ROUNDS_PER_SESSION } from "./GameSession";
import type { GameDefinition, RoundProps } from "./types";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getLevel: vi.fn(),
    postSession: vi.fn(),
    postSessionOnPageHide: vi.fn(),
    getTodaysGames: vi.fn(),
  };
});
const api = vi.mocked(apiClient);

/** A stand-in game: each round is one button press, always correct. */
function FakeRound({ level, onComplete }: RoundProps) {
  return (
    <button type="button" data-level={level} onClick={() => onComplete({ correct: true, reaction_ms: 900, hint_used: false })}>
      Finish round
    </button>
  );
}
const fakeGame: GameDefinition = { type: "memory_match", title: "Fake", intro: "Play the fake game.", icon: Puzzle, Round: FakeRound };

/** The end message: one of the encouragements, plus the gentle note only when the game got harder. */
const isEncouragement = (text: string) => (copy.games.encouragement as readonly string[]).includes(text);
async function findEnding(withUp = false) {
  const words = await screen.findByText(isEncouragement);
  if (withUp) expect(screen.getByText(copy.games.endUp)).toBeInTheDocument();
  else expect(screen.queryByText(copy.games.endUp)).toBeNull();
  return words;
}

function result(change: SessionResult["level_change"]): SessionResult {
  const end = change === "up" ? 4 : change === "down" ? 2 : 3;
  return {
    level_change: change,
    new_level: end,
    session: {
      id: 1,
      patient_id: 1,
      game_type: "memory_match",
      level_start: 3,
      level_end: end,
      started_at: "",
      ended_at: "",
      rounds_played: 5,
      rounds_correct: 5,
      avg_reaction_ms: 900,
      hints_used: 0,
      completed: true,
    },
  };
}

async function playFullSession() {
  fireEvent.click(await screen.findByRole("button", { name: copy.games.start }));
  for (let round = 1; round <= ROUNDS_PER_SESSION; round++) {
    expect(screen.getByText(copy.games.roundOf(round, ROUNDS_PER_SESSION))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish round" }));
    if (round < ROUNDS_PER_SESSION) {
      expect(screen.getByRole("status")).toHaveTextContent(copy.games.roundWell);
      fireEvent.click(screen.getByRole("button", { name: copy.games.next }));
    }
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getLevel.mockResolvedValue(3);
  api.getTodaysGames.mockResolvedValue({ games: [], pinned: false });
});

describe("GameSession", () => {
  it("plays 5 rounds at the stored level and saves them as one session", async () => {
    api.postSession.mockResolvedValue(result("up"));
    renderWithProviders(<GameSession game={fakeGame} />);

    fireEvent.click(await screen.findByRole("button", { name: copy.games.start }));
    expect(screen.getByRole("button", { name: "Finish round" })).toHaveAttribute("data-level", "3");
    fireEvent.click(screen.getByRole("button", { name: "Finish round" }));
    fireEvent.click(screen.getByRole("button", { name: copy.games.next }));
    for (let i = 2; i <= ROUNDS_PER_SESSION; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Finish round" }));
      if (i < ROUNDS_PER_SESSION) fireEvent.click(screen.getByRole("button", { name: copy.games.next }));
    }

    expect(await findEnding(true)).toBeInTheDocument();
    expect(api.postSession).toHaveBeenCalledOnce();
    const body = api.postSession.mock.calls[0]![0];
    expect(body.game_type).toBe("memory_match");
    expect(body.rounds).toHaveLength(ROUNDS_PER_SESSION);
    expect(body.rounds[0]).toEqual({ correct: true, reaction_ms: 900, hint_used: false });
  });

  it.each(["down", "same"] as const)("level %s ends on warm encouragement, without the harder-next-time note", async (change) => {
    api.postSession.mockResolvedValue(result(change));
    renderWithProviders(<GameSession game={fakeGame} />);
    await playFullSession();
    expect(await findEnding()).toBeInTheDocument();
  });

  it("never shows the level number to the patient", async () => {
    api.postSession.mockResolvedValue(result("up"));
    const { container } = renderWithProviders(<GameSession game={fakeGame} />);
    await playFullSession();
    await findEnding(true);
    expect(container.textContent).not.toMatch(/level/i);
    expect(container.textContent).not.toMatch(/\b4\b/);
  });

  it("offers a gentle retry when saving fails", async () => {
    api.postSession.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(result("same"));
    renderWithProviders(<GameSession game={fakeGame} />);
    await playFullSession();

    fireEvent.click(await screen.findByRole("button", { name: copy.games.retry }));
    expect(await findEnding()).toBeInTheDocument();
    expect(api.postSession).toHaveBeenCalledTimes(2);
  });

  it("saves the rounds played as stopped early when the patient leaves", async () => {
    api.postSession.mockResolvedValue(result("same"));
    const { unmount } = renderWithProviders(<GameSession game={fakeGame} />);
    fireEvent.click(await screen.findByRole("button", { name: copy.games.start }));
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Finish round" }));
      fireEvent.click(screen.getByRole("button", { name: copy.games.next }));
    }
    expect(api.postSession).not.toHaveBeenCalled();

    unmount(); // e.g. the Home button
    expect(api.postSession).toHaveBeenCalledOnce();
    const body = api.postSession.mock.calls[0]![0];
    expect(body.completed).toBe(false);
    expect(body.rounds).toHaveLength(3);
  });

  it("saves stopped-early rounds when the page is closed, only once", async () => {
    renderWithProviders(<GameSession game={fakeGame} />);
    fireEvent.click(await screen.findByRole("button", { name: copy.games.start }));
    fireEvent.click(screen.getByRole("button", { name: "Finish round" }));

    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pagehide"));
    expect(api.postSessionOnPageHide).toHaveBeenCalledOnce();
    expect(api.postSessionOnPageHide.mock.calls[0]![0]).toMatchObject({ completed: false, rounds: [expect.anything()] });
  });

  it("does not save anything when leaving before the first round ends", async () => {
    const { unmount } = renderWithProviders(<GameSession game={fakeGame} />);
    fireEvent.click(await screen.findByRole("button", { name: copy.games.start }));
    unmount();
    expect(api.postSession).not.toHaveBeenCalled();
  });

  it("does not save twice after a finished session", async () => {
    api.postSession.mockResolvedValue(result("same"));
    const { unmount } = renderWithProviders(<GameSession game={fakeGame} />);
    await playFullSession();
    await findEnding();
    unmount();
    expect(api.postSession).toHaveBeenCalledOnce();
    expect(api.postSession.mock.calls[0]![0].completed).toBe(true);
  });

  it("shows a round's own feedback, including after the last round", async () => {
    api.postSession.mockResolvedValue(result("same"));
    function KindRound({ roundIndex, onComplete }: RoundProps) {
      return (
        <button type="button" onClick={() => onComplete({ correct: false, reaction_ms: 1, hint_used: false }, `Answer ${roundIndex}.`)}>
          Answer
        </button>
      );
    }
    renderWithProviders(<GameSession game={{ ...fakeGame, Round: KindRound }} />);
    fireEvent.click(await screen.findByRole("button", { name: copy.games.start }));
    for (let i = 0; i < ROUNDS_PER_SESSION; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Answer" }));
      if (i < ROUNDS_PER_SESSION - 1) {
        expect(screen.getByRole("status")).toHaveTextContent(`Answer ${i}.`);
        fireEvent.click(screen.getByRole("button", { name: copy.games.next }));
      }
    }
    expect(await screen.findByText(`Answer ${ROUNDS_PER_SESSION - 1}.`)).toBeInTheDocument();
    expect(screen.getByText(isEncouragement)).toBeInTheDocument();
  });

  it("ends with Next game (the next unfinished game today), and Play again as the second choice", async () => {
    api.postSession.mockResolvedValue(result("same"));
    api.getTodaysGames.mockResolvedValue({
      games: [
        { game_type: "daily_orientation", done_today: true },
        { game_type: "memory_match", done_today: true },
        { game_type: "word_recall", done_today: false },
      ],
      pinned: false,
    });
    renderWithProviders(<GameSession game={fakeGame} />);
    await playFullSession();
    const next = await screen.findByRole("link", { name: new RegExp(copy.games.nextGame) });
    expect(next).toHaveAttribute("href", "/patient/games/word_recall");
    expect(next).toHaveTextContent(copy.games.wordRecall.title);
    expect(screen.getByRole("button", { name: copy.games.playAgain })).toBeInTheDocument();
  });

  it("ends with Back to Home when every game today is done", async () => {
    api.postSession.mockResolvedValue(result("same"));
    api.getTodaysGames.mockResolvedValue({
      games: [
        { game_type: "daily_orientation", done_today: true },
        { game_type: "memory_match", done_today: true },
        { game_type: "word_recall", done_today: true },
      ],
      pinned: false,
    });
    renderWithProviders(<GameSession game={fakeGame} />);
    await playFullSession();
    expect(await screen.findByRole("link", { name: copy.games.backHome })).toHaveAttribute("href", "/patient");
    expect(screen.queryByRole("link", { name: new RegExp(copy.games.nextGame) })).toBeNull();
  });
});
