import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { User } from "../api/client";
import { App } from "../App";
import { copy } from "../copy";
import { EMPTY_SIGNALS, EMPTY_TREND } from "../test/fixtures";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    getTodayReminders: vi.fn(),
    getTodaysGames: vi.fn(),
    listPatients: vi.fn(),
    listSessions: vi.fn(),
    listAlerts: vi.fn(),
    getTrend: vi.fn(),
    getSignals: vi.fn(),
    listRecordings: vi.fn(),
  };
});

const api = vi.mocked(apiClient);
const user = (role: User["role"]): User => ({
  id: role === "patient" ? 2 : 1,
  name: role === "patient" ? "Kamala Devi" : "Priya Sharma",
  email: `${role}@khayal.test`,
  role,
  created_at: "2026-01-01T00:00:00Z",
  city: null,
  pinned_games: null,
  voice_task_enabled: false,
  voice_consent_at: null,
});

function signInAs(role: User["role"]) {
  localStorage.setItem("khayal.token", "token");
  api.getMe.mockResolvedValue(user(role));
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getTodaysGames.mockResolvedValue({ games: [], pinned: false });
  api.listSessions.mockResolvedValue([]);
  api.listAlerts.mockResolvedValue([]);
  api.getTrend.mockResolvedValue(EMPTY_TREND);
  api.getSignals.mockResolvedValue(EMPTY_SIGNALS);
  api.listRecordings.mockResolvedValue([]);
});

describe("patient states", () => {
  beforeEach(() => signInAs("patient"));

  it("Home never says nothing is planned when reminders could not be loaded", async () => {
    api.getTodayReminders.mockRejectedValue(new Error("offline"));
    renderWithProviders(<App />, { route: "/patient" });
    expect(await screen.findByText(copy.patientHome.reminderUnavailable)).toBeInTheDocument();
    expect(screen.queryByText(copy.patientHome.noReminder)).toBeNull();
  });

  it("an empty games list gets a kind message", async () => {
    api.getTodayReminders.mockResolvedValue([]);
    renderWithProviders(<App />, { route: "/patient/games" });
    expect(await screen.findByText(copy.games.empty)).toBeInTheDocument();
  });
});

describe("caregiver states", () => {
  beforeEach(() => signInAs("caregiver"));

  it("a patient who is not linked shows Patient not found", async () => {
    api.listPatients.mockResolvedValue([]);
    renderWithProviders(<App />, { route: "/caregiver/patients/9" });
    expect(await screen.findByRole("heading", { name: "Patient not found" })).toBeInTheDocument();
  });

  it("a failed load offers Try again", async () => {
    api.listPatients.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    renderWithProviders(<App />, { route: "/caregiver" });
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.listPatients).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/No linked patients yet/)).toBeInTheDocument();
  });
});
