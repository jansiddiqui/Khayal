import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "./api/client";
import type { Patient, User } from "./api/client";
import { App } from "./App";
import { copy } from "./copy";
import { renderWithProviders } from "./test/renderWithProviders";

vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    pairDevice: vi.fn(),
    listPatients: vi.fn(),
    linkPatient: vi.fn(),
    listSessions: vi.fn(),
    getTrend: vi.fn(),
    getSignals: vi.fn(),
    updatePatient: vi.fn(),
    getTodaysGames: vi.fn(),
    getTodayReminders: vi.fn(),
    listAlerts: vi.fn(),
  };
});

const api = vi.mocked(apiClient);

const kamala: User = { id: 2, name: "Kamala Devi", email: "kamala@khayal.test", role: "patient", created_at: "", city: "Pune", pinned_games: null };
const priya: User = { id: 1, name: "Priya Sharma", email: "caregiver@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null };

function signInAs(user: User) {
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(user);
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getTodayReminders.mockResolvedValue([]);
  api.listAlerts.mockResolvedValue([]);
});

const patientRoutes = ["/patient", "/patient/games", "/patient/reminders", "/patient/who-is-this", "/patient/voice"];

describe("signed out", () => {
  it.each(["/", "/patient", "/patient/games"])("%s starts at Pair a device", async (route) => {
    renderWithProviders(<App />, { route });
    expect(await screen.findByRole("heading", { name: copy.pair.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.pair.caregiverLink })).toHaveAttribute("href", "/login");
  });

  it("caregiver pages still go to email sign-in", async () => {
    renderWithProviders(<App />, { route: "/caregiver" });
    expect(await screen.findByRole("heading", { name: copy.login.title })).toBeInTheDocument();
  });

  it("pairs a patient device with the 6-digit code and lands on patient Home", async () => {
    api.pairDevice.mockResolvedValue({ access_token: "paired", token_type: "bearer", user: kamala });
    renderWithProviders(<App />, { route: "/pair" });
    fireEvent.change(screen.getByLabelText(copy.pair.codeLabel), { target: { value: "12 34-56x7" } });
    expect(screen.getByLabelText(copy.pair.codeLabel)).toHaveValue("123456"); // digits only, 6 at most
    fireEvent.click(screen.getByRole("button", { name: copy.pair.submit }));
    expect(await screen.findByRole("heading", { name: "Hello, Kamala!" })).toBeInTheDocument();
    expect(api.pairDevice).toHaveBeenCalledWith("123456");
    expect(localStorage.getItem("khayal.token")).toBe("paired");
  });

  it("asks kindly for a new code when pairing fails", async () => {
    api.pairDevice.mockRejectedValue(Object.assign(new Error("400"), { isAxiosError: true, response: { status: 400 } }));
    renderWithProviders(<App />, { route: "/pair" });
    fireEvent.change(screen.getByLabelText(copy.pair.codeLabel), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: copy.pair.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.pair.failed);
  });

  it("signs a patient in and lands on patient Home", async () => {
    api.login.mockResolvedValue({ access_token: "t", token_type: "bearer", user: kamala });
    renderWithProviders(<App />, { route: "/login" });

    fireEvent.change(screen.getByLabelText(copy.login.email), { target: { value: "kamala@khayal.test" } });
    fireEvent.change(screen.getByLabelText(copy.login.password), { target: { value: "khayal-demo" } });
    fireEvent.click(screen.getByRole("button", { name: copy.login.submit }));

    expect(await screen.findByRole("heading", { name: "Hello, Kamala!" })).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith("kamala@khayal.test", "khayal-demo");
    expect(localStorage.getItem("khayal.token")).toBe("t");
  });

  it("shows a gentle message when sign-in fails", async () => {
    api.login.mockRejectedValue(Object.assign(new Error("401"), { isAxiosError: true, response: { status: 401 } }));
    renderWithProviders(<App />, { route: "/login" });
    fireEvent.change(screen.getByLabelText(copy.login.email), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText(copy.login.password), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: copy.login.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.login.failed);
  });

  it("registers a caregiver and lands on the dashboard", async () => {
    api.register.mockResolvedValue({ access_token: "t", token_type: "bearer", user: priya });
    api.listPatients.mockResolvedValue([]);
    renderWithProviders(<App />, { route: "/register" });

    fireEvent.change(screen.getByLabelText(copy.register.name), { target: { value: "Priya Sharma" } });
    fireEvent.change(screen.getByLabelText(copy.register.email), { target: { value: "p@example.com" } });
    fireEvent.change(screen.getByLabelText(copy.register.password), { target: { value: "password123" } });
    fireEvent.click(screen.getByLabelText(copy.register.roleCaregiver));
    fireEvent.click(screen.getByRole("button", { name: copy.register.submit }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(api.register).toHaveBeenCalledWith({
      name: "Priya Sharma",
      email: "p@example.com",
      password: "password123",
      role: "caregiver",
    });
  });
});

describe("patient", () => {
  beforeEach(() => {
    signInAs(kamala);
    api.getTodaysGames.mockResolvedValue({ pinned: false, games: [{ game_type: "daily_orientation", done_today: false }] });
  });

  it("Home has the reminder card and exactly 3 main buttons", async () => {
    renderWithProviders(<App />, { route: "/patient" });
    await screen.findByRole("heading", { name: "Hello, Kamala!" });

    expect(screen.getByRole("region", { name: copy.patientHome.nextReminderLabel })).toBeInTheDocument();
    const main = within(screen.getByRole("navigation", { name: "Main actions" }));
    const labels = main.getAllByRole("link").map((l) => l.textContent?.trim());
    expect(labels).toEqual([
      expect.stringContaining(copy.patientHome.playGames),
      expect.stringContaining(copy.patientHome.todaysReminders),
      expect.stringContaining(copy.patientHome.whoIsThis),
    ]);
  });

  it.each(patientRoutes)("%s has the top bar and at most 3 buttons in the main area", async (route) => {
    renderWithProviders(<App />, { route });
    const topBar = within(await screen.findByRole("banner", { name: "Top bar" }));
    expect(topBar.getByRole("link", { name: copy.nav.home })).toHaveAttribute("href", "/patient");
    expect(topBar.getByRole("button", { name: copy.nav.readAloudOff })).toBeInTheDocument();

    const main = within(screen.getByRole("main"));
    expect([...main.queryAllByRole("link"), ...main.queryAllByRole("button")].length).toBeLessThanOrEqual(3);
  });

  it("games list shows today's 3 games from the server, with Done today", async () => {
    api.getTodaysGames.mockResolvedValue({
      pinned: false,
      games: [
        { game_type: "daily_orientation", done_today: true },
        { game_type: "word_recall", done_today: false },
        { game_type: "reaction_tap", done_today: false },
      ],
    });
    renderWithProviders(<App />, { route: "/patient/games" });
    const list = within(await screen.findByRole("navigation", { name: "Games" }));
    const links = list.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/patient/games/daily_orientation",
      "/patient/games/word_recall",
      "/patient/games/reaction_tap",
    ]);
    // Finished today: marked, but still playable.
    expect(links[0]).toHaveAccessibleName(`${copy.games.orientation.title} ${copy.games.doneToday}`);
    expect(links[1]).toHaveAccessibleName(copy.games.wordRecall.title);
  });

  it("Read aloud toggle switches on and is remembered", async () => {
    renderWithProviders(<App />, { route: "/patient" });
    fireEvent.click(await screen.findByRole("button", { name: copy.nav.readAloudOff }));
    const on = screen.getByRole("button", { name: copy.nav.readAloudOn });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("khayal.readAloud")).toBe("on");
  });

  it("is sent home from caregiver pages", async () => {
    renderWithProviders(<App />, { route: "/caregiver" });
    expect(await screen.findByRole("heading", { name: "Hello, Kamala!" })).toBeInTheDocument();
  });
});

describe("caregiver", () => {
  beforeEach(() => signInAs(priya));

  it("lists linked patients and links a new one", async () => {
    const rahim: Patient = { id: 3, name: "Rahim Khan", email: "rahim@khayal.test", city: null, pinned_games: null };
    api.listPatients.mockResolvedValueOnce([{ id: 2, name: "Kamala Devi", email: "kamala@khayal.test", city: null, pinned_games: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", email: "kamala@khayal.test", city: null, pinned_games: null, cognitive_index: null, cognitive_status: "insufficient" as const }, { ...rahim, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.linkPatient.mockResolvedValue(rahim);

    renderWithProviders(<App />, { route: "/caregiver" });
    expect(await screen.findByText("Kamala Devi")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Patient's account email"), { target: { value: "rahim@khayal.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Link patient" }));

    expect(await screen.findByText("Linked Rahim Khan.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("cell", { name: "Rahim Khan" })).toBeInTheDocument());
    expect(api.linkPatient.mock.calls[0]?.[0]).toBe("rahim@khayal.test");
  });

  it("sees a patient's levels and session history", async () => {
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", email: "kamala@khayal.test", city: null, pinned_games: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listSessions.mockResolvedValue([
      {
        id: 9,
        patient_id: 2,
        game_type: "memory_match",
        level_start: 2,
        level_end: 3,
        started_at: "2026-11-04T10:00:00Z",
        ended_at: "2026-11-04T10:05:00Z",
        rounds_played: 5,
        rounds_correct: 5,
        avg_reaction_ms: 2400,
        hints_used: 0,
        completed: true,
      },
    ]);
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });

    expect(await screen.findByRole("heading", { name: "Kamala Devi" })).toBeInTheDocument();
    expect(screen.getByText("Level 3 / 10")).toBeInTheDocument(); // memory match, from latest session
    expect(screen.getAllByText("Level 2 / 10")).toHaveLength(3); // the three games not played yet
    expect(screen.getByRole("cell", { name: "2 ↑ 3" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "5 / 5" })).toBeInTheDocument();
    expect(api.listSessions).toHaveBeenCalledWith(2);
  });

  it("shows stopped-early sessions and saves the patient's city", async () => {
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", email: "kamala@khayal.test", city: null, pinned_games: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listSessions.mockResolvedValue([
      {
        id: 10,
        patient_id: 2,
        game_type: "daily_orientation",
        level_start: 1,
        level_end: 1,
        started_at: "2026-11-04T10:00:00Z",
        ended_at: "2026-11-04T10:02:00Z",
        rounds_played: 3,
        rounds_correct: 2,
        avg_reaction_ms: null,
        hints_used: 0,
        completed: false,
      },
    ]);
    api.updatePatient.mockResolvedValue({ id: 2, name: "Kamala Devi", email: "kamala@khayal.test", city: "Pune", pinned_games: null });
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });

    expect(await screen.findByRole("cell", { name: "Stopped early (3/5 rounds)" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "—" })).toHaveLength(2); // no level, no reaction time

    fireEvent.change(screen.getByLabelText(/Home city/), { target: { value: " Pune " } });
    fireEvent.click(screen.getByRole("button", { name: "Save city" }));
    await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith(2, { city: "Pune" }));
  });

  it("pins and unpins today's games for a patient", async () => {
    const base = { id: 2, name: "Kamala Devi", email: "kamala@khayal.test", city: null };
    api.listPatients.mockResolvedValue([{ ...base, pinned_games: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listSessions.mockResolvedValue([]);
    api.updatePatient.mockResolvedValue({ ...base, pinned_games: ["reaction_tap", "word_recall"] });
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });

    expect(await screen.findByText(/Automatic: About Today plus the two games played least recently/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Slot 2"), { target: { value: "reaction_tap" } });
    fireEvent.change(screen.getByLabelText("Slot 3"), { target: { value: "reaction_tap" } });
    expect(screen.getByText("Choose two different games.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin these games" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Slot 3"), { target: { value: "word_recall" } });
    fireEvent.click(screen.getByRole("button", { name: "Pin these games" }));
    await waitFor(() =>
      expect(api.updatePatient).toHaveBeenCalledWith(2, { pinned_games: ["reaction_tap", "word_recall"] }),
    );
  });

  it("signs out back to the sign-in screen", async () => {
    api.listPatients.mockResolvedValue([]);
    renderWithProviders(<App />, { route: "/caregiver" });
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: copy.login.title })).toBeInTheDocument();
    expect(localStorage.getItem("khayal.token")).toBeNull();
  });

  it("is sent to the dashboard from patient pages", async () => {
    api.listPatients.mockResolvedValue([]);
    renderWithProviders(<App />, { route: "/patient" });
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});
