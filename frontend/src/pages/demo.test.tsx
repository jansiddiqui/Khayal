import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import { apiBase, type DemoStart } from "../api/client";
import { App } from "../App";
import { Layout } from "../components/Layout";
import { copy } from "../copy";
import { DEMO, setTestAppConfig } from "../test/appConfigState";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, getMe: vi.fn(), startDemo: vi.fn(), listPatients: vi.fn() };
});

const api = vi.mocked(apiClient);

const started: DemoStart = {
  access_token: "demo-token",
  token_type: "bearer",
  user: {
    id: 10,
    name: "Demo caregiver",
    email: "caregiver-abc@demo.khayal.example",
    role: "caregiver",
    created_at: "2026-11-15T00:00:00Z",
    city: null,
    pinned_games: null,
    voice_task_enabled: false,
    voice_consent_at: null,
    demo_expires_at: "2026-11-22T00:00:00Z",
  },
  patient_id: 11,
  patient_name: "Kamala Devi",
  pairing: { code: "482913", expires_at: "2026-11-15T00:10:00Z" },
};

beforeEach(() => {
  vi.resetAllMocks();
  api.listPatients.mockResolvedValue([]);
});

describe("public demo", () => {
  it("shows the banner and the Try the demo button only in demo mode", () => {
    const { unmount } = renderWithProviders(<App />, { route: "/login" });
    expect(screen.queryByText(copy.demo.banner)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: copy.demo.tryIt })).not.toBeInTheDocument();
    unmount();

    setTestAppConfig({ config: DEMO });
    renderWithProviders(<App />, { route: "/login" });
    expect(screen.getByRole("note")).toHaveTextContent(copy.demo.banner);
    expect(screen.getByRole("link", { name: copy.demo.tryIt })).toHaveAttribute("href", "/demo");
  });

  it("the banner is on patient screens too", () => {
    setTestAppConfig({ config: DEMO });
    renderWithProviders(<App />, { route: "/pair" });
    expect(screen.getByRole("note")).toHaveTextContent(copy.demo.banner);
    expect(screen.getByRole("link", { name: copy.demo.pairLink })).toHaveAttribute("href", "/demo");
  });

  it("Try the demo signs in and shows the pairing code for the patient side", async () => {
    setTestAppConfig({ config: DEMO });
    api.startDemo.mockResolvedValue(started);
    renderWithProviders(<App />, { route: "/demo" });
    expect(screen.getByText(copy.demo.deleted(7))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: copy.demo.start }));
    expect(await screen.findByRole("heading", { name: copy.demo.readyTitle })).toBeInTheDocument();
    expect(screen.getByText("482913")).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/pair`)).toBeInTheDocument();
    expect(localStorage.getItem("khayal.token")).toBe("demo-token");
    expect(screen.getByRole("link", { name: copy.demo.toDashboard })).toHaveAttribute("href", "/caregiver");
    expect(api.startDemo).toHaveBeenCalledTimes(1);
  });

  it("welcomes signed-out visitors at / with two choices and a sign-in link", async () => {
    setTestAppConfig({ config: DEMO });
    renderWithProviders(<App />, { route: "/" });
    expect(await screen.findByRole("heading", { name: /Khayal/ })).toBeInTheDocument();
    expect(screen.getByText(copy.welcome.description)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(copy.demo.banner);
    const main = screen.getByRole("main");
    // At most 3 main actions (CLAUDE.md section 4): two big choices and one small link.
    expect(within(main).getAllByRole("button")).toHaveLength(1);
    expect(within(main).getAllByRole("link").map((l) => l.textContent)).toEqual([copy.welcome.haveCode, copy.welcome.signIn]);
    expect(within(main).getByRole("link", { name: copy.welcome.haveCode })).toHaveAttribute("href", "/pair");
    expect(within(main).getByRole("link", { name: copy.welcome.signIn })).toHaveAttribute("href", "/login");
  });

  it("Try the demo on the welcome page starts the demo at once", async () => {
    setTestAppConfig({ config: DEMO });
    api.startDemo.mockResolvedValue(started);
    renderWithProviders(<App />, { route: "/" });
    fireEvent.click(await screen.findByRole("button", { name: copy.welcome.tryDemo }));
    expect(await screen.findByRole("heading", { name: copy.demo.readyTitle })).toBeInTheDocument();
    expect(screen.getByText("482913")).toBeInTheDocument();
    expect(api.startDemo).toHaveBeenCalledTimes(1);
  });

  it("outside demo mode, / still goes to pairing", async () => {
    renderWithProviders(<App />, { route: "/" });
    expect(await screen.findByRole("heading", { name: copy.pair.title })).toBeInTheDocument();
    expect(screen.queryByText(copy.welcome.haveCode)).not.toBeInTheDocument();
  });

  it("while the server wakes up, says so calmly instead of hiding the demo", async () => {
    setTestAppConfig({ config: undefined, waking: true });
    renderWithProviders(<App />, { route: "/" });
    expect(await screen.findByRole("status")).toHaveTextContent(copy.demo.waking);
    expect(screen.getByRole("heading", { name: /Khayal/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: copy.pair.title })).not.toBeInTheDocument();
  });

  it("explains kindly when too many demos were started", async () => {
    setTestAppConfig({ config: DEMO });
    api.startDemo.mockRejectedValue({ isAxiosError: true, response: { status: 429 } });
    renderWithProviders(<App />, { route: "/demo" });
    fireEvent.click(screen.getByRole("button", { name: copy.demo.start }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(copy.demo.tooMany)).toBeInTheDocument();
  });
});

describe("play mode", () => {
  it("marks the page while a game board is in play mode, so the banner steps aside", () => {
    const { unmount } = renderWithProviders(
      <Layout title="Find the Pairs" compact>
        <p>board</p>
      </Layout>,
    );
    expect(document.documentElement).toHaveAttribute("data-play-mode");
    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-play-mode");

    renderWithProviders(
      <Layout title="Home">
        <p>home</p>
      </Layout>,
    );
    expect(document.documentElement).not.toHaveAttribute("data-play-mode");
  });
});

describe("API address", () => {
  it("uses the dev proxy when VITE_API_URL is unset, else the backend's address", () => {
    expect(apiBase(undefined)).toBe("/api");
    expect(apiBase("")).toBe("/api");
    expect(apiBase("https://khayal-api.example.app")).toBe("https://khayal-api.example.app/api");
    expect(apiBase("https://khayal-api.example.app/")).toBe("https://khayal-api.example.app/api");
    expect(apiBase("https://khayal-api.example.app/api")).toBe("https://khayal-api.example.app/api");
  });
});
