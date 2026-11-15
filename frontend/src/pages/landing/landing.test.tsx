import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../../api/client";
import { App } from "../../App";
import { setTestAppConfig } from "../../test/appConfigState";
import { renderWithProviders } from "../../test/renderWithProviders";
import { landing as t, NAV } from "./content";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, getMe: vi.fn(), requestInvite: vi.fn() };
});

const api = vi.mocked(apiClient);

beforeEach(() => {
  vi.resetAllMocks();
});

/** The landing page and its sections load lazily: the first load in a test run compiles them. */
const LAZY = { timeout: 10_000 };

async function openLanding() {
  renderWithProviders(<App />, { route: "/" });
  await screen.findByRole("heading", { name: t.hero.headline }, LAZY);
  await screen.findByRole("heading", { name: t.faq.title }, LAZY);
}

function fillValidForm(form: HTMLElement) {
  fireEvent.change(within(form).getByLabelText(t.invite.name), { target: { value: "Anita Rao" } });
  fireEvent.change(within(form).getByLabelText(t.invite.email), { target: { value: "anita@example.com" } });
  fireEvent.click(within(form).getByLabelText("A doctor"));
  fireEvent.change(within(form).getByLabelText(t.invite.city), { target: { value: "Pune" } });
  fireEvent.click(within(form).getByLabelText(t.invite.consent));
}

describe("landing page", () => {
  it("is what a signed-out visitor sees at /, outside demo mode too", async () => {
    await openLanding();
    const header = screen.getAllByRole("banner")[0]!;
    for (const n of NAV) expect(within(header).getAllByText(n.label).length).toBeGreaterThan(0);
    expect(within(header).getByRole("link", { name: t.signIn })).toHaveAttribute("href", "/login");
    expect(within(header).getAllByRole("link", { name: t.requestInvite })[0]).toHaveAttribute("href", "#invite");
    expect(screen.getByRole("link", { name: t.hero.haveCode })).toHaveAttribute("href", "/pair");
    expect(screen.queryByRole("button", { name: t.hero.tryDemo })).not.toBeInTheDocument();
    expect(document.title).toBe(t.title);
  });

  it("has every section the brief asks for, and the honest disclaimer", async () => {
    await openLanding();
    for (const title of [t.how.title, t.audiences.title, t.features.title, t.science.title, t.privacy.title, t.faq.title]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    for (const card of t.audiences.cards) expect(screen.getByRole("heading", { name: card.title })).toBeInTheDocument();
    for (const f of t.features.items) expect(screen.getByRole("heading", { name: f.title })).toBeInTheDocument();
    expect(screen.getByText(t.science.disclaimer)).toBeInTheDocument();
    expect(screen.getByText(t.science.evidence)).toBeInTheDocument();
    expect(document.querySelectorAll("details")).toHaveLength(t.faq.items.length);
    expect(await screen.findByRole("link", { name: t.footer.privacy }, LAZY)).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: t.footer.terms })).toHaveAttribute("href", "/terms");
    expect(screen.getByText(t.footer.madeIn)).toBeInTheDocument();
  });

  it("shows the contact email from the server's settings", async () => {
    setTestAppConfig({
      config: { demo_mode: false, recording_limit_seconds: 180, demo_account_days: 7, contact_email: "hello@khayal.example" },
    });
    await openLanding();
    expect(await screen.findByRole("link", { name: /hello@khayal\.example/ })).toHaveAttribute("href", "mailto:hello@khayal.example");
  });

  it("sends an invite request and says thank you warmly", async () => {
    api.requestInvite.mockResolvedValue(undefined);
    await openLanding();
    const form = screen.getByRole("form", { name: t.invite.title });
    fillValidForm(form);
    fireEvent.change(within(form).getByLabelText(t.invite.message), { target: { value: "My father is 78." } });
    fireEvent.click(within(form).getByRole("button", { name: t.invite.submit }));
    expect(await screen.findByRole("heading", { name: t.invite.thanksTitle })).toBeInTheDocument();
    expect(api.requestInvite).toHaveBeenCalledWith({
      name: "Anita Rao",
      email: "anita@example.com",
      role: "doctor",
      city: "Pune",
      message: "My father is 78.",
      consent: true,
      website: undefined,
    });
  });

  it("does not send without consent and says what to fix", async () => {
    await openLanding();
    const form = screen.getByRole("form", { name: t.invite.title });
    fillValidForm(form);
    fireEvent.click(within(form).getByLabelText(t.invite.consent)); // untick it again
    fireEvent.click(within(form).getByRole("button", { name: t.invite.submit }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(t.invite.errorInvalid);
    expect(api.requestInvite).not.toHaveBeenCalled();
  });

  it("explains rate limits and a sleeping server kindly", async () => {
    await openLanding();
    const form = screen.getByRole("form", { name: t.invite.title });
    fillValidForm(form);
    api.requestInvite.mockRejectedValueOnce({ isAxiosError: true, response: { status: 429 } });
    fireEvent.click(within(form).getByRole("button", { name: t.invite.submit }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(t.invite.errorBusy);
    api.requestInvite.mockRejectedValueOnce(new Error("Network Error"));
    fireEvent.click(within(form).getByRole("button", { name: t.invite.submit }));
    await waitFor(() => expect(within(form).getByRole("alert")).toHaveTextContent(t.invite.errorDown));
  });

  it("the placeholder privacy and terms pages exist", async () => {
    renderWithProviders(<App />, { route: "/privacy" });
    expect(await screen.findByRole("heading", { name: "Privacy policy" }, LAZY)).toBeInTheDocument();
  });
});
