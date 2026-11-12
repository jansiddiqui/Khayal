import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { Alert, Reminder, TodayReminder, User } from "../api/client";
import { App } from "../App";
import { copy } from "../copy";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    getTodayReminders: vi.fn(),
    markReminderDone: vi.fn(),
    listPatients: vi.fn(),
    listSessions: vi.fn(),
    getTrend: vi.fn(),
    getSignals: vi.fn(),
    listReminders: vi.fn(),
    getAdherence: vi.fn(),
    createReminder: vi.fn(),
    updateReminder: vi.fn(),
    deleteReminder: vi.fn(),
    listAlerts: vi.fn(),
    acknowledgeAlert: vi.fn(),
  };
});
const api = vi.mocked(apiClient);

const kamala: User = { id: 2, name: "Kamala Devi", email: "k@khayal.test", role: "patient", created_at: "", city: null, pinned_games: null };
const priya: User = { id: 1, name: "Priya", email: "p@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null };

function signInAs(user: User) {
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(user);
}

const today = (id: number, title: string, time: string, status: TodayReminder["status"], due: boolean): TodayReminder => ({
  id,
  title,
  type: "medicine",
  time_of_day: `${time}:00`,
  status,
  due,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("time format", () => {
  it("shows 12-hour times", () => {
    expect(copy.reminders.time("09:00:00")).toBe("9:00 AM");
    expect(copy.reminders.time("13:05:00")).toBe("1:05 PM");
    expect(copy.reminders.time("00:30:00")).toBe("12:30 AM");
    expect(copy.reminders.time("12:00:00")).toBe("12:00 PM");
  });
});

describe("patient Home next reminder card", () => {
  beforeEach(() => signInAs(kamala));
  const card = async () => within(await screen.findByRole("region", { name: copy.patientHome.nextReminderLabel }));

  it("shows something due now first", async () => {
    api.getTodayReminders.mockResolvedValue([
      today(1, "Blood pressure tablet", "09:00", "pending", true),
      today(2, "Lunch", "13:00", "pending", false),
    ]);
    renderWithProviders(<App />, { route: "/patient" });
    expect(await (await card()).findByText("Now · Blood pressure tablet")).toBeInTheDocument();
  });

  it("otherwise shows the next one later today", async () => {
    api.getTodayReminders.mockResolvedValue([
      today(1, "Blood pressure tablet", "09:00", "done", true),
      today(2, "Lunch", "13:00", "pending", false),
    ]);
    renderWithProviders(<App />, { route: "/patient" });
    expect(await (await card()).findByText("1:00 PM · Lunch")).toBeInTheDocument();
  });

  it("is calm when nothing is left", async () => {
    api.getTodayReminders.mockResolvedValue([today(1, "Lunch", "13:00", "done", true)]);
    renderWithProviders(<App />, { route: "/patient" });
    expect(await (await card()).findByText(copy.patientHome.noReminder)).toBeInTheDocument();
  });
});

describe("patient Today's reminders", () => {
  beforeEach(() => signInAs(kamala));

  it("shows Done buttons only for reminders whose time has come, at most 3", async () => {
    api.getTodayReminders.mockResolvedValue([
      today(1, "Tablet A", "07:00", "missed", true),
      today(2, "Tablet B", "08:00", "pending", true),
      today(3, "Tablet C", "08:30", "pending", true),
      today(4, "Tablet D", "08:45", "pending", true),
      today(5, "Lunch", "13:00", "pending", false),
      today(6, "Tea", "06:00", "done", true),
    ]);
    renderWithProviders(<App />, { route: "/patient/reminders" });

    await screen.findByRole("heading", { name: copy.reminders.nowHeading });
    const main = within(screen.getByRole("main"));
    expect(main.getAllByRole("button", { name: copy.reminders.done })).toHaveLength(3);
    expect(within(screen.getByRole("region", { name: "Tablet A" })).getByText(copy.reminders.letsDoItNow)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tablet B" })).getByText(copy.reminders.timeForThis)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tablet D" })).toBeNull(); // appears after one is done

    expect(screen.getByRole("heading", { name: copy.reminders.laterHeading })).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText(copy.reminders.doneMark)).toBeInTheDocument();
    // No negative words anywhere.
    expect(screen.getByRole("main").textContent).not.toMatch(/\b(missed|wrong|late)\b/i);
  });

  it("marks a reminder done and thanks the patient", async () => {
    api.getTodayReminders
      .mockResolvedValueOnce([today(1, "Tablet", "09:00", "pending", true)])
      .mockResolvedValue([today(1, "Tablet", "09:00", "done", true)]);
    api.markReminderDone.mockResolvedValue({} as Reminder);
    renderWithProviders(<App />, { route: "/patient/reminders" });

    fireEvent.click(await screen.findByRole("button", { name: copy.reminders.done }));
    expect(await screen.findByRole("status")).toHaveTextContent(copy.reminders.thanks);
    expect(api.markReminderDone.mock.calls[0]?.[0]).toBe(1);
    expect(await screen.findByText(copy.reminders.allDone)).toBeInTheDocument();
  });

  it("is calm when nothing is planned or nothing is due yet", async () => {
    api.getTodayReminders.mockResolvedValue([]);
    const { unmount } = renderWithProviders(<App />, { route: "/patient/reminders" });
    expect(await screen.findByText(copy.reminders.nothingToday)).toBeInTheDocument();
    unmount();

    api.getTodayReminders.mockResolvedValue([today(5, "Lunch", "13:00", "pending", false)]);
    renderWithProviders(<App />, { route: "/patient/reminders" });
    expect(await screen.findByText(copy.reminders.nothingNow)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.reminders.done })).toBeNull();
  });
});

describe("caregiver reminders and alerts", () => {
  const reminder: Reminder = {
    id: 7,
    patient_id: 2,
    title: "Blood pressure tablet",
    type: "medicine",
    time_of_day: "09:00:00",
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    today_status: "missed",
    today_marked_by: null,
  };

  beforeEach(() => {
    signInAs(priya);
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", email: "k@khayal.test", city: null, pinned_games: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listReminders.mockResolvedValue([reminder]);
    api.getAdherence.mockResolvedValue({ days: 7, done_by_patient: 4, done_by_caregiver: 1, missed: 1, rate: 4 / 6 });
  });

  it("shows adherence and caregiver-marked reminders", async () => {
    api.listReminders.mockResolvedValue([
      { ...reminder, id: 8, title: "Lunch", today_status: "done", today_marked_by: "caregiver" },
      { ...reminder, id: 9, title: "Tea", today_status: "done", today_marked_by: "patient" },
    ]);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const summary = within(await screen.findByRole("region", { name: "Adherence, last 7 days" }));
    expect(summary.getByText("67%")).toBeInTheDocument();
    expect(summary.getByText("4 done by Kamala · 1 done by caregiver · 1 missed")).toBeInTheDocument();
    const row = (name: string) => within(screen.getByRole("cell", { name }).closest("tr")!);
    expect(row("Lunch").getByRole("cell", { name: "Done (by caregiver)" })).toBeInTheDocument();
    expect(row("Tea").getByRole("cell", { name: "Done" })).toBeInTheDocument();
  });

  it("lists reminders with today's status", async () => {
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const row = (await screen.findByRole("cell", { name: "Blood pressure tablet" })).closest("tr")!;
    expect(within(row).getByRole("cell", { name: "9:00 AM" })).toBeInTheDocument();
    expect(within(row).getByRole("cell", { name: "Every day" })).toBeInTheDocument();
    expect(within(row).getByRole("cell", { name: "Missed" })).toBeInTheDocument();
  });

  it("adds a reminder", async () => {
    api.createReminder.mockResolvedValue(reminder);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = within(await screen.findByRole("form", { name: "Add reminder" }));

    fireEvent.change(form.getByLabelText("Title"), { target: { value: "  Lunch " } });
    fireEvent.change(form.getByLabelText("Type"), { target: { value: "meal" } });
    fireEvent.change(form.getByLabelText("Time"), { target: { value: "13:00" } });
    ["Sat", "Sun"].forEach((d) => fireEvent.click(form.getByLabelText(d)));
    fireEvent.click(form.getByRole("button", { name: "Add reminder" }));

    await waitFor(() =>
      expect(api.createReminder).toHaveBeenCalledWith(2, {
        title: "Lunch",
        type: "meal",
        time_of_day: "13:00",
        days_of_week: [0, 1, 2, 3, 4],
        active: true,
      }),
    );
  });

  it("needs at least one day", async () => {
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = within(await screen.findByRole("form", { name: "Add reminder" }));
    fireEvent.change(form.getByLabelText("Title"), { target: { value: "Lunch" } });
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => fireEvent.click(form.getByLabelText(d)));
    expect(form.getByText("Choose at least one day.")).toBeInTheDocument();
    expect(form.getByRole("button", { name: "Add reminder" })).toBeDisabled();
  });

  it("edits and deletes a reminder", async () => {
    api.updateReminder.mockResolvedValue(reminder);
    api.deleteReminder.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const form = within(screen.getByRole("form", { name: "Save changes" }));
    expect(form.getByLabelText("Time")).toHaveValue("09:00");
    fireEvent.click(form.getByLabelText("Active"));
    fireEvent.click(form.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api.updateReminder).toHaveBeenCalledWith(2, 7, expect.objectContaining({ active: false, time_of_day: "09:00" })),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteReminder).toHaveBeenCalledWith(2, 7));
  });

  it("shows alerts on the patient page and acknowledges them", async () => {
    const alert: Alert = {
      id: 3,
      patient_id: 2,
      type: "missed_reminders",
      message: "Kamala Devi missed 3 reminders in the last 48 hours.",
      severity: "warning",
      created_at: "2026-11-04T06:00:00Z",
      acknowledged: false,
    };
    api.listAlerts.mockResolvedValueOnce([alert]).mockResolvedValue([{ ...alert, acknowledged: true }]);
    api.acknowledgeAlert.mockResolvedValue({ ...alert, acknowledged: true });
    api.listSessions.mockResolvedValue([]);
    renderWithProviders(<App />, { route: "/caregiver/patients/2" });

    expect(await screen.findByText(alert.message)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alerts (1 new)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(api.acknowledgeAlert.mock.calls[0]?.[0]).toBe(3));
    expect(await screen.findByText("Acknowledged (1)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reminders" })).toHaveAttribute("href", "/caregiver/patients/2/reminders");
  });
});
