import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { PatientSummary, User } from "../api/client";
import { App } from "../App";
import { EMPTY_SIGNALS, EMPTY_TREND } from "../test/fixtures";
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
    listDevices: vi.fn(),
    listShares: vi.fn(),
    revokeDevice: vi.fn(),
    createShare: vi.fn(),
    setElderConsent: vi.fn(),
    myConsents: vi.fn(),
    deleteMyAccount: vi.fn(),
    checkInvite: vi.fn(),
    acceptShare: vi.fn(),
    admin: {
      requests: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      invites: vi.fn(),
      invite: vi.fn(),
      revokeInvite: vi.fn(),
      users: vi.fn(),
      resetLink: vi.fn(),
      demoCount: vi.fn(),
      removeDemo: vi.fn(),
    },
  };
});

const api = vi.mocked(apiClient);
const adminApi = vi.mocked(apiClient.admin);

const priya: User = {
  id: 1, name: "Priya Sharma", email: "priya@example.com", role: "caregiver", created_at: "2026-11-01T00:00:00Z",
  city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null, is_admin: true,
};
const kamala: PatientSummary = {
  id: 2, name: "Kamala Devi", city: "Pune", pinned_games: null, voice_task_enabled: false, voice_consent_at: null,
  photos_enabled: true, has_photo: false, cognitive_index: null, cognitive_status: "insufficient",
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem("khayal.token", "token");
  api.getMe.mockResolvedValue(priya);
  api.listPatients.mockResolvedValue([kamala]);
  api.listSessions.mockResolvedValue([]);
  api.listAlerts.mockResolvedValue([]);
  api.getTrend.mockResolvedValue(EMPTY_TREND);
  api.getSignals.mockResolvedValue(EMPTY_SIGNALS);
  api.listRecordings.mockResolvedValue([]);
  api.listDevices.mockResolvedValue([{ id: 7, device_label: "Android phone · Chrome", created_at: "2026-11-10T00:00:00Z", last_seen_at: "2026-11-15T09:00:00Z" }]);
  api.listShares.mockResolvedValue([]);
  api.myConsents.mockResolvedValue([]);
  adminApi.requests.mockResolvedValue([
    { id: 4, name: "Anita Rao", email: "anita@example.com", role: "family", city: "Pune", message: "For my father", status: "new", created_at: "2026-11-14T00:00:00Z" },
  ]);
  adminApi.invites.mockResolvedValue([]);
  adminApi.users.mockResolvedValue([]);
  adminApi.demoCount.mockResolvedValue(4);
});

describe("admin page", () => {
  it("approving a request shows a single-use invite link to copy", async () => {
    adminApi.approve.mockResolvedValue({ id: 9, token: "invite-token-abc", expires_at: "2026-11-29T00:00:00Z" });
    renderWithProviders(<App />, { route: "/admin" });
    expect(await screen.findByText("Anita Rao")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    const link = await screen.findByRole("textbox", { name: /Invite link for Anita Rao/ });
    expect(link).toHaveValue(`${window.location.origin}/join/invite-token-abc`);
    expect(adminApi.approve).toHaveBeenCalledWith(4);
  });

  it("removing demo accounts shows the count first and sends it back as confirmation", async () => {
    adminApi.removeDemo.mockResolvedValue(4);
    renderWithProviders(<App />, { route: "/admin" });
    expect(await screen.findByText("4 demo accounts (caregivers and elders).")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove all demo accounts…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove all demo accounts" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove 4 demo accounts" }));
    await waitFor(() => expect(adminApi.removeDemo).toHaveBeenCalledWith(4));
  });

  it("is linked from the caregiver header for admins only", async () => {
    renderWithProviders(<App />, { route: "/caregiver" });
    expect(await screen.findByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });
});

describe("account page", () => {
  it("deletes the account only after DELETE and the password", async () => {
    api.deleteMyAccount.mockResolvedValue({ removed: 2 });
    renderWithProviders(<App />, { route: "/caregiver/account" });
    const button = await screen.findByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "a-long-password" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(button);
    await waitFor(() => expect(api.deleteMyAccount).toHaveBeenCalledWith("a-long-password"));
    expect(localStorage.getItem("khayal.token")).toBeNull();
  });
});

describe("privacy, devices and family on the patient page", () => {
  it("withdrawing photos asks first, and devices can be revoked", async () => {
    api.setElderConsent.mockResolvedValue({ patient: { ...kamala, photos_enabled: false }, deleted: 3 });
    api.revokeDevice.mockResolvedValue();
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });
    fireEvent.click(await screen.findByRole("checkbox", { name: /Family photos/ }));
    const dialog = screen.getByRole("alertdialog", { name: "Turn off photos" });
    expect(dialog).toHaveTextContent("deletes every family photo");
    expect(api.setElderConsent).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn off and delete" }));
    await waitFor(() => expect(api.setElderConsent).toHaveBeenCalledWith(2, "photos", false));

    expect(await screen.findByText("Android phone · Chrome")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(api.revokeDevice).toHaveBeenCalledWith(2, 7));
  });

  it("a share link is shown once to copy", async () => {
    api.createShare.mockResolvedValue({ id: 3, token: "share-token-xyz", expires_at: "2026-11-29T00:00:00Z" });
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });
    fireEvent.click(await screen.findByRole("button", { name: "Create a share link" }));
    expect(await screen.findByRole("textbox", { name: "Share link for Kamala Devi" })).toHaveValue(
      `${window.location.origin}/share/share-token-xyz`,
    );
  });
});

describe("share links", () => {
  it("a signed-in family member joins the elder", async () => {
    api.checkInvite.mockResolvedValue({ kind: "share", elder_name: "Kamala", expires_at: "2026-11-29T00:00:00Z" });
    api.acceptShare.mockResolvedValue(kamala);
    renderWithProviders(<App />, { route: "/share/share-token-xyz" });
    fireEvent.click(await screen.findByRole("button", { name: "Join Kamala" }));
    await waitFor(() => expect(api.acceptShare).toHaveBeenCalledWith("share-token-xyz"));
  });
});
