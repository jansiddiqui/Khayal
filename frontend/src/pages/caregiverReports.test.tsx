import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as apiClient from "../api/client";
import type { DoctorReport, User } from "../api/client";
import { App } from "../App";
import { Timeline } from "../components/caregiver/Timeline";
import { changeText } from "../components/caregiver/WeeklySummary";
import { renderWithProviders } from "../test/renderWithProviders";
import { REPORT_STATEMENT } from "./caregiver/Report";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, getMe: vi.fn(), getReport: vi.fn(), getTimeline: vi.fn() };
});
const api = vi.mocked(apiClient);

const priya: User = { id: 1, name: "Priya", email: "p@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };

const report: DoctorReport = {
  patient_id: 2,
  name: "Kamala Devi",
  start: "2026-10-20",
  end: "2026-11-18",
  days: 30,
  generated_at: "2026-11-18T10:00:00Z",
  cognitive_index: -1.3,
  cognitive_status: "watch",
  games: [
    { game_type: "daily_orientation", sessions: 25, first_half: 0.98, second_half: 0.95, z: -0.3, status: "stable", sessions_to_baseline: 0, points: [{ day: "2026-10-21", composite: 1 }, { day: "2026-10-22", composite: 0.9 }] },
    { game_type: "word_recall", sessions: 9, first_half: 0.2, second_half: 0.16, z: null, status: "insufficient", sessions_to_baseline: 4, points: [] },
  ],
  doses: { taken: 13, taken_late: 2, missed: 1, unsure: 0 },
  reminders_done: 32,
  reminders_total: 36,
  alerts: [{ id: 9, patient_id: 2, type: "decline", message: "Word Recall average dropped (z = −1.6).", severity: "warning", created_at: "2026-11-15T14:30:00Z", acknowledged: false }],
  recordings: 1,
  days_played: 28,
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(priya);
  api.getReport.mockResolvedValue(report);
  api.getTimeline.mockResolvedValue([]);
});

it("doctor report: period, games, adherence, alerts, notes and the statement; Download PDF prints", async () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  renderWithProviders(<App />, { route: "/caregiver/patients/2/report" });
  const sheet = within(await screen.findByRole("article"));
  expect(sheet.getByRole("heading", { name: "Kamala Devi" })).toBeInTheDocument();
  expect(sheet.getByText(/20 October 2026 – 18 November 2026 \(30 days\)/)).toBeInTheDocument();
  expect(sheet.getByRole("cell", { name: "About Today" })).toBeInTheDocument();
  expect(sheet.getByText("(z −0.3)")).toBeInTheDocument();
  expect(sheet.getByText("4 sessions to baseline")).toBeInTheDocument();
  expect(sheet.getByText(/Medicine doses: 13 of 14 taken/)).toHaveTextContent("Medicine doses: 13 of 14 taken (2 confirmed later), 1 missed, 0 not sure.");
  expect(sheet.getByText(/Word Recall average dropped/)).toBeInTheDocument();
  expect(sheet.getByText(REPORT_STATEMENT)).toBeInTheDocument();
  expect(REPORT_STATEMENT).toMatch(/not a medical device and this is not a diagnosis/);

  fireEvent.change(screen.getByRole("textbox", { name: /Notes for the doctor/ }), { target: { value: "Sleeping less." } });
  expect(sheet.getByText("Sleeping less.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  expect(print).toHaveBeenCalledOnce();

  fireEvent.change(screen.getByRole("combobox", { name: "Period" }), { target: { value: "90" } });
  await waitFor(() => expect(api.getReport).toHaveBeenLastCalledWith(2, 90));
});

it("timeline groups events by day and filters by kind", async () => {
  api.getTimeline.mockResolvedValue([
    { at: "2026-11-18T05:00:00Z", kind: "reminder", title: "Tablet (10:00 AM): not sure", detail: "", tone: "attention", game_type: null },
    { at: "2026-11-18T04:00:00Z", kind: "session", title: "Word Recall: 4 of 5 right", detail: "Level 3", tone: "neutral", game_type: "word_recall" },
    { at: "2026-11-16T09:00:00Z", kind: "settings", title: "City set to Lucknow", detail: "", tone: "neutral", game_type: null },
  ]);
  renderWithProviders(<Timeline patientId={2} />);
  const list = await screen.findByRole("list", { name: "Timeline" });
  expect(within(list).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Wednesday, 18 November", "Monday, 16 November"]);
  expect(within(list).getByText("Tablet (10:00 AM): not sure")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Games" }));
  expect(screen.getByRole("button", { name: "Games" })).toHaveAttribute("aria-pressed", "false");
  await waitFor(() => expect(api.getTimeline).toHaveBeenLastCalledWith(2, 14, ["reminder", "alert", "recording", "settings"]));
});

it("weekly change words", () => {
  expect(changeText({ label: "x", now: 3, before: 5 })?.text).toBe("2 fewer than the week before");
  expect(changeText({ label: "x", now: 5, before: 5 })?.text).toBe("same as the week before");
  expect(changeText({ label: "x", now: 0.81, before: 0.7, share: true })?.text).toBe("11 points higher than the week before");
  expect(changeText({ label: "x", now: null, before: 5 })).toBeNull();
});
