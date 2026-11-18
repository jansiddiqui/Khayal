import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { GameType, PatientSummary, User } from "../api/client";
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
      backup: vi.fn(),
      overview: vi.fn(),
      health: vi.fn(),
      feedback: vi.fn(),
      setFeedbackStatus: vi.fn(),
      feedbackVoiceUrl: vi.fn(),
      log: vi.fn(),
      researchExport: vi.fn(),
    },
    sendFeedback: vi.fn(),
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
  core_games: ["memory_match", "sequence_recall", "word_recall", "reaction_tap"] as GameType[], core_is_default: true,
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
  adminApi.overview.mockResolvedValue({
    families: 12, active_7: 9, active_30: 11, caregivers: 15,
    sessions_per_day: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, count: i % 4 })),
    funnel: { requested: 20, approved: 14, invited: 16, signed_up: 13, paired: 12, active: 11 },
    retention_7: { days: 7, eligible: 10, retained: 8 },
    retention_30: { days: 30, eligible: 4, retained: 2 },
  });
  adminApi.health.mockResolvedValue({
    started_at: "2026-11-18T08:00:00Z", uptime_seconds: 7_500, last_start_at: "2026-11-18T08:00:00Z", last_tick_at: null,
    last_housekeeping_at: "2026-11-18T09:30:00Z", database: "postgresql", db_bytes: 900 * 1024 ** 2, db_limit_bytes: 1024 ** 3,
    db_warning: true, last_backup_at: "2026-11-08T09:00:00Z", last_backup_by: "priya@example.com", days_since_backup: 10, backup_warning: true,
  });
  adminApi.feedback.mockResolvedValue([]);
  adminApi.log.mockResolvedValue([]);
});

describe("admin page", () => {
  it("approving a request shows a single-use invite link to copy", async () => {
    adminApi.approve.mockResolvedValue({ id: 9, token: "invite-token-abc", expires_at: "2026-11-29T00:00:00Z" });
    renderWithProviders(<App />, { route: "/admin" });
    fireEvent.click(await screen.findByRole("tab", { name: "People and invites" }));
    expect(await screen.findByText("Anita Rao")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    const link = await screen.findByRole("textbox", { name: /Invite link for Anita Rao/ });
    expect(link).toHaveValue(`${window.location.origin}/join/invite-token-abc`);
    expect(adminApi.approve).toHaveBeenCalledWith(4);
  });

  it("removing demo accounts shows the count first and sends it back as confirmation", async () => {
    adminApi.removeDemo.mockResolvedValue(4);
    renderWithProviders(<App />, { route: "/admin" });
    fireEvent.click(await screen.findByRole("tab", { name: "Data" }));
    expect(await screen.findByText("4 demo accounts (caregivers and elders).")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove all demo accounts…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove all demo accounts" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove 4 demo accounts" }));
    await waitFor(() => expect(adminApi.removeDemo).toHaveBeenCalledWith(4));
  });

  it("downloads a full backup and explains the 10-minute limit", async () => {
    const blob = new Blob(["zip"], { type: "application/zip" });
    adminApi.backup.mockResolvedValueOnce({ blob, fileName: "khayal-backup-2026-11-16-0930.zip" });
    adminApi.backup.mockRejectedValueOnce(Object.assign(new Error("429"), { isAxiosError: true, response: { status: 429 } }));
    URL.createObjectURL = vi.fn(() => "blob:backup");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderWithProviders(<App />, { route: "/admin" });
    fireEvent.click(await screen.findByRole("tab", { name: "Data" }));
    const button = await screen.findByRole("button", { name: "Download full backup" });
    fireEvent.click(button);
    expect(await screen.findByText("Saved as khayal-backup-2026-11-16-0930.zip.")).toBeInTheDocument();
    expect(click).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Download full backup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A backup was made in the last 10 minutes");
    click.mockRestore();
  });

  it("overview: families, funnel, retention, and health warnings for the database and the backup", async () => {
    renderWithProviders(<App />, { route: "/admin" });
    const overview = within(await screen.findByRole("region", { name: "Pilot overview" }));
    expect(await overview.findByText("Families")).toBeInTheDocument();
    expect(overview.getByText("75%")).toBeInTheDocument(); // active 9 of 12
    expect(overview.getByRole("figure", { name: "Sessions per day, last 30 days" })).toBeInTheDocument();
    expect(overview.getByText("Elder's device paired")).toBeInTheDocument();
    expect(overview.getByText("80%")).toBeInTheDocument(); // 8 of 10 still playing after 7 days
    const health = within(await screen.findByRole("region", { name: "System health" }));
    expect(await health.findByText("No external cron yet")).toBeInTheDocument();
    expect(health.getByText(/900.0 MB of 1.00 GB \(88%\)/)).toBeInTheDocument();
    expect(health.getByText("More than 7 days: download a new backup.")).toBeInTheDocument();
    expect(health.getAllByRole("img", { name: "Needs a look" })).toHaveLength(3);
  });

  it("feedback inbox: read, resolve, and play a voice note", async () => {
    adminApi.feedback.mockResolvedValue([
      { id: 5, role: "patient", kind: "hard", text: null, page: "/patient/games", has_voice: true, status: "new", created_at: "2026-11-18T09:00:00Z", sender: "Kamala Devi (elder of Priya Sharma)" },
    ]);
    adminApi.setFeedbackStatus.mockResolvedValue({} as never);
    adminApi.feedbackVoiceUrl.mockResolvedValue("blob:voice");
    renderWithProviders(<App />, { route: "/admin#feedback" });
    const inbox = within(await screen.findByRole("region", { name: "Feedback" }));
    expect(await inbox.findByText("Something was hard")).toBeInTheDocument();
    expect(inbox.getByText(/Kamala Devi \(elder of Priya Sharma\)/)).toBeInTheDocument();
    fireEvent.click(inbox.getByRole("button", { name: "Play voice note" }));
    await waitFor(() => expect(document.querySelector("audio")).toHaveAttribute("src", "blob:voice"));
    fireEvent.click(inbox.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(adminApi.setFeedbackStatus).toHaveBeenCalledWith(5, "resolved"));
    expect(adminApi.feedback).toHaveBeenCalledWith("new");
  });

  it("users can be searched and filtered", async () => {
    renderWithProviders(<App />, { route: "/admin#people" });
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search name or email" }), { target: { value: "kam" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Role" }), { target: { value: "caregiver" } });
    await waitFor(() => expect(adminApi.users).toHaveBeenLastCalledWith({ q: "kam", role: "caregiver", kind: undefined }));
  });

  it("research export downloads a zip; the log lists admin actions", async () => {
    adminApi.researchExport.mockResolvedValue({ blob: new Blob(["zip"]), fileName: "khayal-research-2026-11-18.zip" });
    adminApi.log.mockResolvedValue([{ id: 1, admin_email: "priya@example.com", at: "2026-11-18T09:00:00Z", action: "research_export", detail: "3 families, 2048 bytes" }]);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderWithProviders(<App />, { route: "/admin#data" });
    fireEvent.click(await screen.findByRole("button", { name: "Download research export" }));
    expect(await screen.findByText("Saved as khayal-research-2026-11-18.zip.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Activity log" }));
    expect(await screen.findByRole("cell", { name: "Downloaded a research export" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "3 families, 2048 bytes" })).toBeInTheDocument();
    click.mockRestore();
  });

  it("caregivers send feedback from the header", async () => {
    api.sendFeedback.mockResolvedValue(3);
    renderWithProviders(<App />, { route: "/caregiver/account" });
    fireEvent.click(await screen.findByRole("button", { name: "Send feedback" }));
    fireEvent.click(screen.getByLabelText("Something was hard"));
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Pairing took three tries" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/The Khayal team reads every message/)).toBeInTheDocument();
    expect(api.sendFeedback).toHaveBeenCalledWith("hard", "Pairing took three tries", "/caregiver/account");
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
