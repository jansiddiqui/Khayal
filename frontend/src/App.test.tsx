import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "./api/client";
import type { GameType, Patient, User } from "./api/client";
import { App } from "./App";
import { copy } from "./copy";
import { EMPTY_SIGNALS, EMPTY_TREND } from "./test/fixtures";
import { renderWithProviders } from "./test/renderWithProviders";

/** Patient Home greets by the time of day (Good morning / afternoon / evening, or Hello late at night). */
const KAMALA_GREETING = /^(Good (morning|afternoon|evening)|Hello), Kamala$/;

vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    pairDevice: vi.fn(),
    listPatients: vi.fn(),
    getGlance: vi.fn(),
    addElder: vi.fn(),
    checkInvite: vi.fn(),
    listSessions: vi.fn(),
    getGameCatalog: vi.fn(),
    resetTutorial: vi.fn(),
    getTrend: vi.fn(),
    getSignals: vi.fn(),
    updatePatient: vi.fn(),
    getTodaysGames: vi.fn(),
    getTodayReminders: vi.fn(),
    listAlerts: vi.fn(),
    listRecordings: vi.fn(),
    listFamily: vi.fn(),
  };
});

const api = vi.mocked(apiClient);

const kamala: User = { id: 2, name: "Kamala Devi", email: "kamala@khayal.test", role: "patient", created_at: "", city: "Pune", pinned_games: null, voice_task_enabled: false, voice_consent_at: null };
const priya: User = { id: 1, name: "Priya Sharma", email: "caregiver@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };

function signInAs(user: User) {
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(user);
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getTodayReminders.mockResolvedValue([]);
  api.listAlerts.mockResolvedValue([]);
  api.listRecordings.mockResolvedValue([]);
  api.listFamily.mockResolvedValue([]);
  api.getTrend.mockResolvedValue(EMPTY_TREND);
  api.getSignals.mockResolvedValue(EMPTY_SIGNALS);
  api.getTodaysGames.mockResolvedValue({ games: [], pinned: false });
});

const patientRoutes = ["/patient", "/patient/games", "/patient/reminders", "/patient/who-is-this", "/patient/voice"];

describe("signed out", () => {
  // "/" is the public landing page now (CLAUDE.md section 11); patient pages still start at pairing.
  it.each(["/patient", "/patient/games"])("%s starts at Pair a device", async (route) => {
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
    // A moment to see it worked, then Start (never rushed).
    expect(await screen.findByText(copy.pair.ready("Kamala"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.pair.readyStart }));
    expect(await screen.findByRole("heading", { name: KAMALA_GREETING })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: KAMALA_GREETING })).toBeInTheDocument();
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

  it("/register explains that Khayal is invite-only", async () => {
    renderWithProviders(<App />, { route: "/register" });
    expect(await screen.findByRole("heading", { name: "Khayal is invite-only for now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request an invite" })).toHaveAttribute("href", "/#invite");
  });

  it("an invite link creates a caregiver account with consent and lands on the dashboard", async () => {
    api.checkInvite.mockResolvedValue({ kind: "signup", elder_name: null, expires_at: "2026-11-29T00:00:00Z" });
    api.register.mockResolvedValue({ access_token: "t", token_type: "bearer", user: priya });
    api.listPatients.mockResolvedValue([]);
    renderWithProviders(<App />, { route: "/join/invite-token-1234567890" });

    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Priya Sharma" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "p@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "a-long-password" } });
    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeDisabled(); // consent first
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(api.register).toHaveBeenCalledWith({
      name: "Priya Sharma",
      email: "p@example.com",
      password: "a-long-password",
      invite_token: "invite-token-1234567890",
      consent: true,
    });
  });

  it("an invalid invite link says so kindly", async () => {
    api.checkInvite.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    renderWithProviders(<App />, { route: "/join/old-token-1234567890" });
    expect(await screen.findByRole("heading", { name: "This link is not valid any more" })).toBeInTheDocument();
  });
});

describe("patient", () => {
  beforeEach(() => {
    signInAs(kamala);
    api.getTodaysGames.mockResolvedValue({ pinned: false, games: [{ game_type: "daily_orientation", done_today: false }] });
  });

  it("Home has the reminder card and exactly 3 main buttons", async () => {
    renderWithProviders(<App />, { route: "/patient" });
    await screen.findByRole("heading", { name: KAMALA_GREETING });

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
    expect(await screen.findByRole("heading", { name: KAMALA_GREETING })).toBeInTheDocument();
  });
});

describe("caregiver", () => {
  beforeEach(() => signInAs(priya));

  it("lists the people they look after and adds one with consent (no email)", async () => {
    const rahim: Patient = { id: 3, name: "Rahim Khan", photos_enabled: false, has_photo: false, city: "Pune", pinned_games: null, core_games: ["memory_match", "sequence_recall", "word_recall", "reaction_tap"] as GameType[], core_is_default: true, voice_task_enabled: false, voice_consent_at: null };
    const glance = (id: number, name: string): apiClient.Glance => ({
  patient_id: id, name, cognitive_status: "insufficient", games_done: 0, games_total: 3,
  medicines: { taken: 0, missed: 0, unsure: 0, to_come: 0 }, alerts_open: 0, last_active_at: null,
  next_action: { kind: "pair", text: `Pair ${name.split(" ")[0]}'s phone or tablet` },
});
    api.getGlance.mockResolvedValueOnce([glance(2, "Kamala Devi")]);
    api.getGlance.mockResolvedValue([glance(2, "Kamala Devi"), glance(3, "Rahim Khan")]);
    api.addElder.mockResolvedValue(rahim);

    renderWithProviders(<App />, { route: "/caregiver" });
    expect(await screen.findByText("Kamala Devi")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("not a medical device");

    // With someone already added, the form waits behind a button instead of filling half the page.
    expect(screen.queryByLabelText("Their name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add another person" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Rahim Khan" } });
    fireEvent.change(screen.getByLabelText(/City/), { target: { value: "Pune" } });
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled(); // consent first
    fireEvent.click(screen.getByLabelText("I am a family member or the legal guardian of this person."));
    fireEvent.click(screen.getByLabelText("Rahim agreed to use Khayal."));
    fireEvent.click(add);

    expect(await screen.findByText(/Added Rahim Khan\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Rahim Khan" })).toBeInTheDocument());
    expect(api.addElder.mock.calls[0]?.[0]).toEqual({
      name: "Rahim Khan",
      city: "Pune",
      is_family_or_guardian: true,
      basis: "elder_agreed",
      photos: false,
      voice: false,
    });
  });

  it("sees a patient's levels and session history", async () => {
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", photos_enabled: false, has_photo: false, city: null, pinned_games: null, core_games: ["memory_match", "sequence_recall", "word_recall", "reaction_tap"] as GameType[], core_is_default: true, voice_task_enabled: false, voice_consent_at: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
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
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", photos_enabled: false, has_photo: false, city: null, pinned_games: null, core_games: ["memory_match", "sequence_recall", "word_recall", "reaction_tap"] as GameType[], core_is_default: true, voice_task_enabled: false, voice_consent_at: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
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
    api.updatePatient.mockResolvedValue({ id: 2, name: "Kamala Devi", photos_enabled: false, has_photo: false, city: "Pune", pinned_games: null, core_games: ["memory_match", "sequence_recall", "word_recall", "reaction_tap"] as GameType[], core_is_default: true, voice_task_enabled: false, voice_consent_at: null });
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });

    expect(await screen.findByRole("cell", { name: "Stopped early (3/5 rounds)" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "—" })).toHaveLength(2); // no level, no reaction time

    fireEvent.change(screen.getByLabelText(/Home city/), { target: { value: " Pune " } });
    fireEvent.click(screen.getByRole("button", { name: "Save city" }));
    await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith(2, { city: "Pune" }));
  });

  it("pins and unpins today's games for a patient", async () => {
    const base = { id: 2, name: "Kamala Devi", photos_enabled: false, has_photo: false, city: null, core_games: ["memory_match", "sequence_recall", "word_recall", "reaction_tap"] as GameType[], core_is_default: true, voice_task_enabled: false, voice_consent_at: null };
    api.listPatients.mockResolvedValue([{ ...base, pinned_games: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listSessions.mockResolvedValue([]);
    api.updatePatient.mockResolvedValue({ ...base, pinned_games: ["reaction_tap", "word_recall"] });
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });

    expect(await screen.findByText(/Automatic: About Today plus the two core games played least recently/)).toBeInTheDocument();
    // While automatic, nothing looks pinned: the choices open on request.
    expect(screen.queryByLabelText("Slot 2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose games to pin" }));
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

  it("changes the core games, offering only levelled games and four different ones", async () => {
    const core = ["memory_match", "sequence_recall", "word_recall", "reaction_tap"] as GameType[];
    const base = { id: 2, name: "Kamala Devi", photos_enabled: false, has_photo: false, city: null, pinned_games: null, core_games: core, core_is_default: true, voice_task_enabled: false, voice_consent_at: null };
    api.listPatients.mockResolvedValue([{ ...base, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listSessions.mockResolvedValue([]);
    api.getGameCatalog.mockResolvedValue(core.map((g, i) => ({ game_type: g, domain: `Domain ${i}` })));
    const reordered = [...core].reverse();
    api.updatePatient.mockResolvedValue({ ...base, core_games: reordered, core_is_default: false });
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });

    fireEvent.click(await screen.findByRole("button", { name: "Change core games" }));
    const first = await screen.findByLabelText("Game 1");
    fireEvent.change(first, { target: { value: "sequence_recall" } });
    expect(screen.getByText("Choose 4 different games.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save core games" })).toBeDisabled();

    reordered.forEach((g, i) => fireEvent.change(screen.getByLabelText(`Game ${i + 1}`), { target: { value: g } }));
    fireEvent.click(screen.getByRole("button", { name: "Save core games" }));
    await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith(2, { core_games: reordered }));
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
