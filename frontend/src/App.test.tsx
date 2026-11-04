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
    listPatients: vi.fn(),
    linkPatient: vi.fn(),
  };
});

const api = vi.mocked(apiClient);

const kamala: User = { id: 2, name: "Kamala Devi", email: "kamala@khayal.test", role: "patient", created_at: "" };
const priya: User = { id: 1, name: "Priya Sharma", email: "caregiver@khayal.test", role: "caregiver", created_at: "" };

function signInAs(user: User) {
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(user);
}

beforeEach(() => {
  vi.resetAllMocks();
});

const patientRoutes = ["/patient", "/patient/games", "/patient/reminders", "/patient/who-is-this", "/patient/voice"];

describe("signed out", () => {
  it.each(["/", "/patient", "/caregiver"])("%s redirects to sign in", async (route) => {
    renderWithProviders(<App />, { route });
    expect(await screen.findByRole("heading", { name: copy.login.title })).toBeInTheDocument();
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
  beforeEach(() => signInAs(kamala));

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
    const rahim: Patient = { id: 3, name: "Rahim Khan", email: "rahim@khayal.test" };
    api.listPatients.mockResolvedValueOnce([{ id: 2, name: "Kamala Devi", email: "kamala@khayal.test" }]);
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", email: "kamala@khayal.test" }, rahim]);
    api.linkPatient.mockResolvedValue(rahim);

    renderWithProviders(<App />, { route: "/caregiver" });
    expect(await screen.findByText("Kamala Devi")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Patient's account email"), { target: { value: "rahim@khayal.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Link patient" }));

    expect(await screen.findByText("Linked Rahim Khan.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("cell", { name: "Rahim Khan" })).toBeInTheDocument());
    expect(api.linkPatient.mock.calls[0]?.[0]).toBe("rahim@khayal.test");
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
