import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { GameType } from "../api/client";
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
    listRecordings: vi.fn(),
    getGlance: vi.fn(),
    getInsights: vi.fn(),
    getWeekly: vi.fn(),
    getTimeline: vi.fn(),
  };
});
const api = vi.mocked(apiClient);

const priya: User = { id: 1, name: "Priya", email: "p@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };
const base = { photos_enabled: false, has_photo: false, city: null, pinned_games: null, core_games: ["memory_match", "sequence_recall", "word_recall", "reaction_tap"] as GameType[], core_is_default: true, voice_task_enabled: false, voice_consent_at: null };

function game(
  game_type: GameTrend["game_type"],
  status: GameTrend["status"],
  trend_status: GameTrend["trend_status"],
  z: number | null,
  explanation: string,
): GameTrend {
  return {
    game_type,
    status,
    trend_status,
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
    game("memory_match", "critical", "declining", -2.7, "Memory Match average dropped from 0.62 to 0.41 over the last 5 sessions (z = −2.7)."),
    game("word_recall", "stable", "watch", -1.1, "Word Recall average is 0.55 over the last 5 sessions, against a baseline of 0.62 (z = −1.1)."),
    game("reaction_tap", "insufficient", "insufficient", null, "Learning this patient's normal (8/15 sessions)"),
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(priya);
  api.listSessions.mockResolvedValue([]);
  api.listRecordings.mockResolvedValue([]);
  api.listAlerts.mockResolvedValue([]);
  api.getTrend.mockResolvedValue(trend);
  api.getSignals.mockResolvedValue({
    days: 14,
    sessions: 40,
    stopped_early_rate: 0.125,
    hint_rate: 0.08,
    adherence: { days: 14, done_by_patient: 30, done_by_caregiver: 4, missed: 6, rate: 0.75 },
  });
  api.getInsights.mockResolvedValue([]);
  api.getTimeline.mockResolvedValue([]);
  const week = { start: "2026-11-12", end: "2026-11-18", days_played: 6, sessions: 18, completed: 17, accuracy: 0.72, doses: { taken: 13, taken_late: 1, missed: 1, unsure: 0 }, reminders_done: 30, reminders_total: 32, alerts: 1, recordings: 0 };
  api.getWeekly.mockResolvedValue({ this_week: week, last_week: { ...week, start: "2026-11-05", end: "2026-11-11", days_played: 7, accuracy: 0.71 } });
});

function card(id: number, name: string, status: apiClient.IndexStatus, kind: apiClient.NextActionKind, text: string): apiClient.Glance {
  return {
    patient_id: id, name, cognitive_status: status, games_done: 1, games_total: 3,
    medicines: { taken: 1, missed: 0, unsure: kind === "check_dose" ? 1 : 0, to_come: 2 },
    alerts_open: kind === "alerts" ? 2 : 0, last_active_at: null, next_action: { kind, text },
  };
}

it("dashboard shows one glance card per elder, who needs you first, with the ONE next action", async () => {
  api.getGlance.mockResolvedValue([
    card(2, "Rahim", "stable", "all_good", "Nothing needs you today"),
    card(3, "Kamala", "watch", "check_dose", "Check the 9:00 AM Blood pressure tablet with Kamala"),
    card(4, "Shanti", "declining", "alerts", "Look at 2 new alerts"),
  ]);
  renderWithProviders(<App />, { route: "/caregiver" });
  const cards = await screen.findAllByRole("article");
  expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual(["Kamala", "Shanti", "Rahim"]);
  const kamala = within(cards[0]!);
  expect(kamala.getByText("Watch")).toBeInTheDocument();
  expect(kamala.getByText("1 of 3 games done today")).toBeInTheDocument();
  expect(kamala.getByText("Medicines: 1 taken · 1 not sure · 2 to come")).toBeInTheDocument();
  expect(kamala.getByRole("link", { name: /Check the 9:00 AM Blood pressure tablet/ })).toHaveAttribute("href", "/caregiver/patients/3/reminders");
  expect(within(cards[1]!).getByRole("link", { name: /Look at 2 new alerts/ })).toHaveAttribute("href", "/caregiver/patients/4#alerts");
  expect(within(cards[2]!).getByRole("link", { name: /Nothing needs you today/ })).toHaveAttribute("href", "/caregiver/patients/2#week");
  // No z-scores on the dashboard.
  expect(screen.queryByText(/−\d\.\d/)).not.toBeInTheDocument();
});

it("patient page puts plain words first, with the numbers on tap, and a weekly comparison", async () => {
  api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala", ...base, cognitive_index: -1.9, cognitive_status: "declining" }]);
  api.getInsights.mockResolvedValue([
    { key: "doses", tone: "attention", text: "2 doses unsure this week", detail: "Last 7 days, medicine reminders only: taken 12, missed 0, not sure 2." },
    { key: "games_memory", tone: "good", text: "Memory games steady this month", detail: "Word Recall: z = −0.2" },
  ]);
  renderWithProviders(<App />, { route: "/caregiver/patients/2" });
  const insights = within(await screen.findByRole("region", { name: "In plain words" }));
  const dose = await insights.findByText("2 doses unsure this week");
  const details = dose.closest("details")!;
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(dose);
  expect(details).toHaveAttribute("open");
  expect(insights.getByText(/taken 12, missed 0, not sure 2/)).toBeInTheDocument();

  const week = within(await screen.findByRole("region", { name: "This week" }));
  expect(await week.findByText("1 fewer than the week before")).toBeInTheDocument();
  expect(week.getByText("72%")).toBeInTheDocument();
  expect(week.getByText("1 point higher than the week before")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Doctor report" })).toHaveAttribute("href", "/caregiver/patients/2/report");
});

it("patient page shows the index, game trends with explanations, and secondary signals", async () => {
  api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala", ...base, cognitive_index: -1.9, cognitive_status: "declining" }]);
  renderWithProviders(<App />, { route: "/caregiver/patients/2" });

  const index = within(await screen.findByRole("figure", { name: "Overall cognitive index trend" }));
  expect(index.getByText("−1.9")).toBeInTheDocument();
  expect(index.getByText("Overall:", { selector: "span.text-ink-muted", exact: false }).parentElement).toHaveTextContent("Overall: Declining");

  // One scale for games and overall; a game that differs from the overall says why.
  const memory = within(screen.getByRole("group", { name: "Memory Match trend" }));
  expect(memory.getByText("This game:", { selector: "span.text-ink-muted", exact: false }).parentElement).toHaveTextContent("This game: Declining");
  expect(memory.queryByText(/averages all games/)).toBeNull();
  const word = within(screen.getByRole("group", { name: "Word Recall trend" }));
  expect(word.getByText("This game:", { selector: "span.text-ink-muted", exact: false }).parentElement).toHaveTextContent("This game: Watch");
  expect(word.getByText(/steadier than the overall status \(Declining\)/)).toBeInTheDocument();

  // Only Declining charts open by default; Watch and Stable cards stay closed (status still shown).
  expect(screen.getByRole("group", { name: "Memory Match trend" })).toHaveAttribute("open");
  expect(screen.getByRole("group", { name: "Word Recall trend" })).not.toHaveAttribute("open");
  // Sections needing attention are open, with their status in the heading.
  expect(screen.getByText("Overall: Declining")).toBeInTheDocument();
  expect(screen.getByText("Overall trend and signals").closest("details")).toHaveAttribute("open");
  expect(screen.getByText("Levels and session history").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByRole("group", { name: "Reaction Tap trend" })).not.toHaveAttribute("open");

  // Summary card at the top: overall status, latest alert, adherence, last played.
  const summary = within(screen.getByRole("region", { name: "Summary" }));
  expect(summary.getByText("Declining")).toBeInTheDocument();
  expect(summary.getByText("75%")).toBeInTheDocument();
  expect(summary.getByText("No new alerts")).toBeInTheDocument();
  expect(memory.getByText(trend.games[0]!.explanation)).toBeInTheDocument();
  const reaction = within(screen.getByRole("group", { name: "Reaction Tap trend" }));
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

it("each alert line links to its game's chart, which is highlighted for 2 seconds", async () => {
  const { HIGHLIGHT_MS } = await import("./caregiver/PatientDetail");
  api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala", ...base, cognitive_index: -1.9, cognitive_status: "declining" }]);
  api.listAlerts.mockResolvedValue([
    {
      id: 7,
      patient_id: 2,
      type: "decline",
      severity: "warning",
      created_at: "2026-11-10T09:00:00Z",
      acknowledged: false,
      message:
        "Memory Match average dropped from 0.62 to 0.41 over the last 5 sessions (z = −2.7). Word Recall average dropped from 0.5 to 0.3 over the last 5 sessions (z = −1.6).",
    },
    { id: 8, patient_id: 2, type: "missed_reminders", severity: "warning", created_at: "2026-11-10T09:00:00Z", acknowledged: false, message: "Kamala missed 3 reminders in the last 48 hours." },
  ]);
  const scrolled: string[] = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id);
  };
  renderWithProviders(<App />, { route: "/caregiver/patients/2" });

  const link = await screen.findByRole("button", { name: "See Word Recall chart" });
  expect(screen.getAllByRole("button", { name: /^See .* chart$/ })).toHaveLength(2); // none for missed reminders
  vi.useFakeTimers();
  fireEvent.click(link);
  const chart = screen.getByRole("group", { name: "Word Recall trend" });
  expect(scrolled).toEqual(["trend-word_recall"]);
  expect(chart).toHaveAttribute("open");
  expect(chart.className).toContain("border-accent-strong");
  act(() => vi.advanceTimersByTime(HIGHLIGHT_MS));
  expect(chart.className).not.toContain("border-accent-strong");
  vi.useRealTimers();
});

it("draws the 5-session average that alerts use", async () => {
  const { rollingMean } = await import("../components/caregiver/TrendCharts");
  expect(rollingMean([1, 2, 3, 4, 5, 6])).toEqual([1, 1.5, 2, 2.5, 3, 4]);
});
