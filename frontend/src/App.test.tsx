import { screen } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "./App";
import { copy } from "./copy";
import { renderWithProviders } from "./test/renderWithProviders";

vi.mock("./api/client", () => ({
  getHealth: vi.fn().mockResolvedValue({ status: "ok", app: "khayal" }),
}));

const patientRoutes = ["/patient", "/patient/games", "/patient/reminders", "/patient/who-is-this", "/patient/voice"];

describe("App routing", () => {
  it("shows the start screen at /", () => {
    renderWithProviders(<App />, { route: "/" });
    expect(screen.getByRole("heading", { name: copy.start.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.start.patient })).toBeInTheDocument();
  });

  it.each(patientRoutes)("patient screen %s has the Home button and at most 3 buttons", (route) => {
    renderWithProviders(<App />, { route });
    expect(screen.getByRole("link", { name: copy.nav.home })).toHaveAttribute("href", "/patient");
    const actions = [...screen.queryAllByRole("link"), ...screen.queryAllByRole("button")];
    expect(actions.length).toBeLessThanOrEqual(3);
  });

  it("patient home offers games", () => {
    renderWithProviders(<App />, { route: "/patient" });
    expect(screen.getByRole("link", { name: copy.patientHome.playGames })).toHaveAttribute("href", "/patient/games");
  });

  it("renders the caregiver dashboard with backend status", async () => {
    renderWithProviders(<App />, { route: "/caregiver" });
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(await screen.findByText("ok")).toBeInTheDocument();
  });
});
