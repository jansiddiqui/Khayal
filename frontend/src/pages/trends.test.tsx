import { screen, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { GameTrend, Trend, User } from "../api/client";
import { App } from "../App";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    listPatients: vi.fn(),
    listSessions: vi.fn(),
    listAlerts: vi.fn(),
    getTrend: vi.fn(),
    getSignals: vi.fn(),
  };
});
const api = vi.mocked(apiClient);

const priya: User = { id: 1, name: "Priya", email: "p@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null };
const base = { email: "x@khayal.test", city: null, pinned_games: null };

function game(game_type: GameTrend["game_type"], status: GameTrend["status"], z: number | null, explanation: string): GameTrend {
  return {
    game_type,
    status,
    z,
    score: z === null ? null : 0.41,
    baseline_mean: z === null ? null : 0.62,
    baseline_std: z === null ? null : 0.08,
    sessions: z === null ? 8 : 30,
    sessions_needed: 15,
    z_raw: z,
    explanation,
    points: [
      { session_id: 1, started_at: "2026-09-01T05:00:00Z", composite: 0.6, rolling_mean: null, z: null },
      { session_id: 2, started_at: "2026-09-02T05:00:00Z", composite: 0.5, rolling_mean: 0.55, z: -0.9 },
    ],
  };
}

const trend: Trend = {
  cognitive_index: -1.9,
  cognitive_status: "declining",
  index_history: [
    { date: "2026-09-01", index: -0.2 },
    { date: "2026-09-02", index: -1.9 },
  ],
  games: [
    game("memory_match", "critical", -2.7, "Memory Match average dropped from 0.62 to 0.41 over the last 5 sessions (z = −2.7)."),
    game("word_recall", "stable", -1.1, "Word Recall average is 0.55 over the last 5 sessions, against a baseline of 0.62 (z = −1.1)."),
    game("reaction_tap", "insufficient", null, "Learning this patient's normal (8/15 sessions)"),
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(priya);
  api.listSessions.mockResolvedValue([]);
  api.listAlerts.mockResolvedValue([]);
  api.getTrend.mockResolvedValue(trend);
  api.getSignals.mockResolvedValue({
    days: 14,
    sessions: 40,
    stopped_early_rate: 0.125,
    hint_rate: 0.08,
    adherence: { days: 14, done_by_patient: 30, done_by_caregiver: 4, missed: 6, rate: 0.75 },
  });
});

it("patient list shows a status dot with a word and the index", async () => {
  api.listPatients.mockResolvedValue([
    { id: 2, name: "Rahim", ...base, cognitive_index: 0.3, cognitive_status: "stable" },
    { id: 3, name: "Kamala", ...base, cognitive_index: -0.9, cognitive_status: "watch" },
    { id: 4, name: "Shanti", ...base, cognitive_index: -2.1, cognitive_status: "declining" },
    { id: 5, name: "New", ...base, cognitive_index: null, cognitive_status: "insufficient" },
  ]);
  renderWithProviders(<App />, { route: "/caregiver" });
  const row = async (name: string) => within((await screen.findByRole("link", { name })).closest("tr")!);
  expect((await row("Rahim")).getByText("Stable")).toBeInTheDocument();
  expect((await row("Kamala")).getByText("Watch")).toBeInTheDocument();
  expect((await row("Kamala")).getByRole("cell", { name: "−0.9" })).toBeInTheDocument();
  expect((await row("Shanti")).getByText("Declining")).toBeInTheDocument();
  expect((await row("New")).getByText("Not enough data")).toBeInTheDocument();
});

it("patient page shows the index, game trends with explanations, and secondary signals", async () => {
  api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala", ...base, cognitive_index: -1.9, cognitive_status: "declining" }]);
  renderWithProviders(<App />, { route: "/caregiver/patients/2" });

  const index = within(await screen.findByRole("figure", { name: "Overall cognitive index trend" }));
  expect(index.getByText("−1.9")).toBeInTheDocument();
  expect(index.getByText("Declining")).toBeInTheDocument();

  const memory = within(screen.getByRole("figure", { name: "Memory Match trend" }));
  expect(memory.getByText("Critical")).toBeInTheDocument();
  expect(memory.getByText(trend.games[0]!.explanation)).toBeInTheDocument();
  const reaction = within(screen.getByRole("figure", { name: "Reaction Tap trend" }));
  expect(reaction.getByText("Learning")).toBeInTheDocument();
  expect(reaction.getByText("Learning this patient's normal (8/15 sessions)")).toBeInTheDocument();

  expect(within(screen.getByRole("group", { name: "Stopped early" })).getByText("13%")).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Hints used" })).getByText("8%")).toBeInTheDocument();
  const adherence = within(screen.getByRole("group", { name: "Reminder adherence" }));
  expect(adherence.getByText("75%")).toBeInTheDocument();
  expect(adherence.getByText(/30 done, 4 by caregiver, 6 missed/)).toBeInTheDocument();
});

it("splits a multi-game decline alert into one line per game", async () => {
  const { alertLines } = await import("./caregiver/PatientDetail");
  expect(
    alertLines(
      "About Today average dropped from 0.98 to 0.32 over the last 5 sessions (z ≤ −4.0). Memory Match average dropped from 0.36 to 0.06 over the last 5 sessions (z = −2.5).",
    ),
  ).toEqual([
    "About Today average dropped from 0.98 to 0.32 over the last 5 sessions (z ≤ −4.0).",
    "Memory Match average dropped from 0.36 to 0.06 over the last 5 sessions (z = −2.5).",
  ]);
  expect(alertLines("Kamala Devi missed 3 reminders in the last 48 hours.")).toEqual([
    "Kamala Devi missed 3 reminders in the last 48 hours.",
  ]);
});
