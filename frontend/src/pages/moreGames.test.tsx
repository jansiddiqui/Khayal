import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as apiClient from "../api/client";
import type { Patient, User } from "../api/client";
import { App } from "../App";
import { HiddenGamesForm } from "../components/caregiver/GamesSettings";
import { sessionLabel, sessionTicks } from "../components/caregiver/TrendCharts";
import { copy } from "../copy";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, getMe: vi.fn(), getMoreGames: vi.fn(), getAllMoreGames: vi.fn(), updatePatient: vi.fn(), getMoodToday: vi.fn() };
});
const api = vi.mocked(apiClient);

const kamala: User = { id: 2, name: "Kamala", email: null, role: "patient", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(kamala);
  api.getMoodToday.mockResolvedValue({ asked: true, mood: null });
});

it("More games: 3 games, then one quiet link to the full list", async () => {
  api.getMoreGames.mockResolvedValue([
    { game_type: "clock_setting", done_today: false },
    { game_type: "spatial_span", done_today: true },
    { game_type: "memory_match", done_today: false },
  ]);
  api.getAllMoreGames.mockResolvedValue([
    { game_type: "clock_setting", done_today: false },
    { game_type: "spatial_span", done_today: true },
    { game_type: "memory_match", done_today: false },
    { game_type: "reaction_tap", done_today: false },
    { game_type: "sequence_recall", done_today: false },
  ]);
  renderWithProviders(<App />, { route: "/patient/games/more" });
  const list = within(await screen.findByRole("navigation", { name: copy.games.moreTitle }));
  expect(list.getAllByRole("link")).toHaveLength(3);
  expect(list.getByRole("link", { name: /Tap the squares/ })).toHaveTextContent(copy.games.doneToday);
  fireEvent.click(screen.getByRole("link", { name: copy.games.seeOther }));
  const all = within(await screen.findByRole("navigation", { name: copy.games.otherTitle }));
  expect(all.getAllByRole("link")).toHaveLength(5);
  // The full list has no further link.
  expect(screen.queryByRole("link", { name: copy.games.seeOther })).toBeNull();
});

it("Hide these games: only games outside the core set, saved as a list", async () => {
  const patient: Patient = {
    id: 2, name: "Kamala", city: null, pinned_games: null, core_is_default: true, voice_task_enabled: false, voice_consent_at: null,
    photos_enabled: false, has_photo: false, core_games: ["word_recall", "object_location", "colour_trails", "money_handling"], hidden_games: ["reaction_tap"],
  };
  api.updatePatient.mockResolvedValue({ ...patient, hidden_games: ["reaction_tap", "clock_setting"] });
  renderWithProviders(<HiddenGamesForm patient={patient} />);
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(5);
  expect(screen.queryByLabelText(/Word Recall/)).toBeNull();
  expect(screen.getByLabelText(/Reaction Tap/)).toBeChecked();
  fireEvent.click(screen.getByLabelText(/Clock Setting/));
  fireEvent.click(screen.getByRole("button", { name: "Save hidden games" }));
  await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith(2, { hidden_games: ["reaction_tap", "clock_setting"] }));
});

it("charts date each day's first session once, and the tooltip names the session", () => {
  const day = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
  const times = [day(9, 9), day(9, 10), day(9, 11), day(10, 9), day(10, 15), day(12, 8)];
  expect(sessionTicks(times)).toEqual([1, 4, 6]);
  const many = Array.from({ length: 20 }, (_, i) => day(1 + i, 9));
  expect(sessionTicks(many)).toHaveLength(6);
  expect(sessionLabel(4, day(10, 9))).toMatch(/^Session 4 · 10 Nov 2026/);
});
