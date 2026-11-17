import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { Alert, Reminder, TodayReminder, User } from "../api/client";
import { App } from "../App";
import { copy } from "../copy";
import { EMPTY_SIGNALS, EMPTY_TREND } from "../test/fixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { todayLabel } from "./caregiver/Reminders";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    getTodayReminders: vi.fn(),
    markReminderDone: vi.fn(),
    markReminderUnsure: vi.fn(),
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
    listRecordings: vi.fn(),
    getTodaysGames: vi.fn(),
  };
});
const api = vi.mocked(apiClient);

const kamala: User = { id: 2, name: "Kamala Devi", email: "k@khayal.test", role: "patient", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };
const priya: User = { id: 1, name: "Priya", email: "p@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };

function signInAs(user: User) {
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(user);
}

/** A patient reminder; its phase follows from status and due unless given (overdue = past its hour). */
const today = (
  id: number,
  title: string,
  time: string,
  status: TodayReminder["status"],
  due: boolean,
  phase?: TodayReminder["phase"],
): TodayReminder => ({
  id,
  title,
  type: "medicine",
  time_of_day: `${time}:00`,
  status,
  due,
  phase: phase ?? (status === "done" ? "done" : status === "unsure" ? "unsure" : !due ? "upcoming" : status === "missed" ? "overdue" : "due"),
});

beforeEach(() => {
  vi.resetAllMocks();
  api.listRecordings.mockResolvedValue([]);
  api.getTrend.mockResolvedValue(EMPTY_TREND);
  api.getSignals.mockResolvedValue(EMPTY_SIGNALS);
  api.getTodaysGames.mockResolvedValue({ games: [], pinned: false });
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

  it("shows something within its hour first", async () => {
    api.getTodayReminders.mockResolvedValue([
      today(1, "Blood pressure tablet", "09:00", "pending", true),
      today(2, "Lunch", "13:00", "pending", false),
    ]);
    renderWithProviders(<App />, { route: "/patient" });
    expect(await (await card()).findByText("Now · Blood pressure tablet")).toBeInTheDocument();
  });

  it("never calls an overdue reminder 'Now'; shows the next one later today instead", async () => {
    api.getTodayReminders.mockResolvedValue([
      today(1, "Blood pressure tablet", "09:00", "missed", true, "overdue"),
      today(2, "Lunch", "13:00", "pending", false),
    ]);
    renderWithProviders(<App />, { route: "/patient" });
    const c = await card();
    expect(await c.findByText("1:00 PM · Lunch")).toBeInTheDocument();
    expect(c.queryByText(/Now/)).toBeNull();
  });

  it("is calm when nothing is left", async () => {
    api.getTodayReminders.mockResolvedValue([today(1, "Lunch", "13:00", "done", true)]);
    renderWithProviders(<App />, { route: "/patient" });
    expect(await (await card()).findByText(copy.patientHome.noReminder)).toBeInTheDocument();
  });

  it("greets by the time of day and shows today's progress in words", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 17, 9, 0));
    api.getTodayReminders.mockResolvedValue([today(1, "Tea", "06:00", "done", true), today(2, "Lunch", "13:00", "pending", false)]);
    api.getTodaysGames.mockResolvedValue({ games: [{ game_type: "daily_orientation", done_today: true }, { game_type: "memory_match", done_today: false }, { game_type: "word_recall", done_today: false }], pinned: false });
    renderWithProviders(<App />, { route: "/patient" });
    expect(await screen.findByRole("heading", { name: "Good morning, Kamala" })).toBeInTheDocument();
    // Today's progress is in the buttons it belongs to.
    expect(await screen.findByRole("link", { name: /Play a game.*1 of 3 done today/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Today's reminders.*1 of 2 done today/ })).toBeInTheDocument();
    vi.useRealTimers();
    expect(copy.patientHome.greetingAt("Kamala", 14)).toBe("Good afternoon, Kamala");
    expect(copy.patientHome.greetingAt("Kamala", 19)).toBe("Good evening, Kamala");
    expect(copy.patientHome.greetingAt("Kamala", 23)).toBe("Hello, Kamala");
  });
});

describe("patient Today's reminders", () => {
  beforeEach(() => signInAs(kamala));

  it("asks about overdue ones and offers Done within the hour, never more than 3 buttons", async () => {
    api.getTodayReminders.mockResolvedValue([
      today(1, "Tablet A", "07:00", "missed", true, "overdue"),
      today(2, "Tablet B", "08:00", "pending", true, "due"),
      today(3, "Tablet C", "08:30", "pending", true, "due"),
      today(5, "Lunch", "13:00", "pending", false),
      today(6, "Tea", "06:00", "done", true),
    ]);
    renderWithProviders(<App />, { route: "/patient/reminders" });

    await screen.findByRole("heading", { name: copy.reminders.nowHeading });
    const main = within(screen.getByRole("main"));
    const a = within(screen.getByRole("region", { name: "Tablet A" }));
    expect(a.getByText("This was for 7:00 AM. Is it done?")).toBeInTheDocument();
    expect(a.getByRole("button", { name: copy.reminders.yesDone })).toBeInTheDocument();
    expect(a.getByRole("button", { name: copy.reminders.notSure })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tablet B" })).getByRole("button", { name: copy.reminders.done })).toBeInTheDocument();
    // Tablet C waits its turn (2 + 1 buttons already on screen): it appears once one is answered.
    expect(screen.queryByRole("region", { name: "Tablet C" })).toBeNull();
    expect(main.getAllByRole("button").filter((b) => b.closest("header") === null)).toHaveLength(3);
    // Never urges: no "Now" wording on an overdue card, no negative words anywhere.
    expect(a.queryByText(copy.reminders.letsDoItNow)).toBeNull();
    expect(screen.getByRole("main").textContent).not.toMatch(/\b(missed|wrong|late)\b/i);

    expect(screen.getByRole("heading", { name: copy.reminders.laterHeading })).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText(copy.reminders.doneMark)).toBeInTheDocument();
  });

  it("ticks a reminder off where it is and thanks the patient", async () => {
    api.getTodayReminders
      .mockResolvedValueOnce([today(1, "Tablet", "09:00", "pending", true)])
      .mockResolvedValue([today(1, "Tablet", "09:00", "done", true)]);
    api.markReminderDone.mockResolvedValue({} as Reminder);
    renderWithProviders(<App />, { route: "/patient/reminders" });

    fireEvent.click(await screen.findByRole("button", { name: copy.reminders.done }));
    const card = within(screen.getByRole("region", { name: "Tablet" }));
    expect(await card.findByRole("status")).toHaveTextContent(copy.reminders.thanks);
    expect(api.markReminderDone.mock.calls[0]?.[0]).toBe(1);
    expect(await screen.findByText(copy.reminders.allDone)).toBeInTheDocument();
    // It stays in the same place on this visit (not moved to the Done list).
    expect(screen.queryByRole("heading", { name: copy.reminders.doneHeading })).toBeNull();
  });

  it("'No / not sure' never suggests a dose and tells the family", async () => {
    api.getTodayReminders
      .mockResolvedValueOnce([today(1, "Blood pressure tablet", "09:00", "missed", true, "overdue")])
      .mockResolvedValue([today(1, "Blood pressure tablet", "09:00", "unsure", true)]);
    api.markReminderUnsure.mockResolvedValue({} as Reminder);
    renderWithProviders(<App />, { route: "/patient/reminders" });

    fireEvent.click(await screen.findByRole("button", { name: copy.reminders.notSure }));
    await waitFor(() => expect(api.markReminderUnsure.mock.calls[0]?.[0]).toBe(1));
    const card = within(screen.getByRole("region", { name: "Blood pressure tablet" }));
    expect(await card.findByRole("status")).toHaveTextContent("Please ask your family before taking it. We've let them know.");
    expect(card.queryByRole("button")).toBeNull();
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
    repeat: "daily",
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    on_date: null,
    start_date: "2026-11-01",
    end_date: null,
    active: true,
    past: false,
    today_status: "missed",
    today_marked_by: null,
  };

  beforeEach(() => {
    // Tuesday 17 November 2026, 3:30 PM in India (the app clock).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
    signInAs(priya);
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", photos_enabled: false, has_photo: false, city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listReminders.mockResolvedValue([reminder]);
    api.getAdherence.mockResolvedValue({ days: 7, done_by_patient: 4, done_by_caregiver: 1, missed: 1, rate: 4 / 6 });
  });
  afterEach(() => vi.useRealTimers());

  /** The add form opens from "Add a reminder" (the list comes first). */
  const addForm = async () => {
    const open = screen.queryByRole("button", { name: "Add a reminder" }) ?? (await screen.findByRole("button", { name: "Add a reminder" }));
    fireEvent.click(open);
    return within(await screen.findByRole("form", { name: "Add reminder" }));
  };
  /** Deletes wait for their Undo window; closing the message carries them out at once. */
  const closeToast = async (text: RegExp) => {
    const toast = (await screen.findByText(text)).closest("[role=status]") as HTMLElement;
    fireEvent.click(within(toast).getByRole("button", { name: "Close message" }));
  };

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

  it("summarises each schedule in plain words, and moves past ones to their own section", async () => {
    api.listReminders.mockResolvedValue([
      reminder,
      { ...reminder, id: 10, title: "Eye check-up", type: "appointment", repeat: "once", days_of_week: [], on_date: "2026-11-18", start_date: null, time_of_day: "20:00:00", today_status: null },
      { ...reminder, id: 11, title: "Walk", type: "other", repeat: "weekly_days", days_of_week: [0, 2, 4], time_of_day: "18:00:00", end_date: "2026-11-30", today_status: null },
      { ...reminder, id: 12, title: "Physio", type: "other", repeat: "weekly_days", days_of_week: [1], start_date: "2026-11-20", today_status: null },
      { ...reminder, id: 13, title: "Blood test", type: "appointment", repeat: "once", days_of_week: [], on_date: "2026-11-10", start_date: null, past: true, today_status: null },
    ]);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const current = within(await screen.findByRole("region", { name: "Reminders" }));
    await current.findByRole("cell", { name: "Blood pressure tablet" });
    const when = (title: string) => within(current.getByRole("cell", { name: title }).closest("tr")!).getByRole("cell", { name: /·/ }).textContent;
    expect(when("Blood pressure tablet")).toBe("Every day · 9:00 AM");
    expect(when("Eye check-up")).toBe("Once · Wed 18 Nov · 8:00 PM");
    expect(when("Walk")).toBe("Mon, Wed, Fri · 6:00 PM · until 30 Nov");
    expect(when("Physio")).toBe("Tue · 9:00 AM · from 20 Nov");
    expect(current.getByRole("cell", { name: "Missed" })).toBeInTheDocument();
    expect(current.queryByText("Blood test")).toBeNull();

    const past = within(screen.getByRole("region", { name: "Past reminders" }));
    expect(past.getByRole("cell", { name: "Once · Tue 10 Nov · 9:00 AM" })).toBeInTheDocument();
    expect(past.queryByRole("button", { name: /Edit/ })).toBeNull();
    api.deleteReminder.mockResolvedValue(undefined);
    fireEvent.click(past.getByRole("button", { name: "Delete Blood test" }));
    // Gone at once, with Undo for a few seconds; only then is it deleted on the server.
    await waitFor(() => expect(screen.queryByText("Blood test")).toBeNull());
    expect(api.deleteReminder).not.toHaveBeenCalled();
    await closeToast(/Reminder deleted: Blood test/);
    await waitFor(() => expect(api.deleteReminder).toHaveBeenCalledWith(2, 13));
  });

  it("shows only the fields for the chosen repeat, with today as the default date", async () => {
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = await addForm();
    // Medicine starts as "Every day": time, start (today), and "Until I stop it".
    expect(form.getByLabelText("Every day")).toBeChecked();
    expect(form.getByLabelText("Starts")).toHaveValue("2026-11-17");
    expect(form.getByLabelText("Until I stop it")).toBeChecked();
    expect(form.queryByLabelText("Date")).toBeNull();
    expect(form.queryByLabelText("Mon")).toBeNull();

    fireEvent.change(form.getByLabelText("Type"), { target: { value: "appointment" } });
    expect(form.getByLabelText("Just once")).toBeChecked();
    expect(form.getByLabelText("Date")).toHaveValue("2026-11-17");
    expect(form.getByLabelText("Date")).toHaveAttribute("min", "2026-11-17");
    expect(form.queryByLabelText("Starts")).toBeNull();
    expect(form.queryByLabelText("Until I stop it")).toBeNull();

    fireEvent.click(form.getByLabelText("On some days"));
    expect(form.getByLabelText("Mon")).not.toBeChecked();
    expect(form.getByText("Choose at least one day.")).toBeInTheDocument();
    // Once the caregiver picked "Repeats" themself, changing the type no longer changes it.
    fireEvent.change(form.getByLabelText("Type"), { target: { value: "medicine" } });
    expect(form.getByLabelText("On some days")).toBeChecked();
  });

  it("adds a one-time reminder, and not for a time that has passed", async () => {
    api.createReminder.mockResolvedValue(reminder);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = await addForm();
    fireEvent.change(form.getByLabelText("Title"), { target: { value: " Dr. Mehta " } });
    fireEvent.change(form.getByLabelText("Type"), { target: { value: "appointment" } });
    fireEvent.change(form.getByLabelText("Time"), { target: { value: "15:00" } }); // today, but 3:30 PM has passed it
    expect(form.getByText("That time has already passed. Choose a later date or time.")).toBeInTheDocument();
    expect(form.getByRole("button", { name: "Add reminder" })).toBeDisabled();

    fireEvent.change(form.getByLabelText("Time"), { target: { value: "20:00" } });
    fireEvent.click(form.getByRole("button", { name: "Add reminder" }));
    await waitFor(() =>
      expect(api.createReminder).toHaveBeenCalledWith(2, {
        title: "Dr. Mehta",
        type: "appointment",
        time_of_day: "20:00",
        active: true,
        repeat: "once",
        days_of_week: [],
        on_date: "2026-11-17",
        start_date: null,
        end_date: null,
        late_window_minutes: null,
      }),
    );
  });

  it("adds an every-day and an on-some-days reminder with an end date", async () => {
    api.createReminder.mockResolvedValue(reminder);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    let form = await addForm();
    fireEvent.change(form.getByLabelText("Title"), { target: { value: "Tablet" } });
    fireEvent.click(form.getByRole("button", { name: "Add reminder" }));
    await waitFor(() =>
      expect(api.createReminder).toHaveBeenLastCalledWith(2, expect.objectContaining({
        repeat: "daily", days_of_week: [0, 1, 2, 3, 4, 5, 6], on_date: null, start_date: "2026-11-17", end_date: null,
      })),
    );

    form = await addForm();
    fireEvent.change(form.getByLabelText("Title"), { target: { value: "Walk" } });
    fireEvent.change(form.getByLabelText("Type"), { target: { value: "other" } });
    expect(form.getByLabelText("On some days")).toBeChecked();
    ["Mon", "Wed", "Fri"].forEach((d) => fireEvent.click(form.getByLabelText(d)));
    fireEvent.change(form.getByLabelText("Time"), { target: { value: "18:00" } });
    fireEvent.click(form.getByLabelText("Ends on"));
    expect(form.getByLabelText("Ends on date")).toHaveAttribute("min", "2026-11-17");
    fireEvent.change(form.getByLabelText("Ends on date"), { target: { value: "2026-11-30" } });
    fireEvent.click(form.getByRole("button", { name: "Add reminder" }));
    await waitFor(() =>
      expect(api.createReminder).toHaveBeenLastCalledWith(2, {
        title: "Walk", type: "other", time_of_day: "18:00", active: true,
        repeat: "weekly_days", days_of_week: [0, 2, 4], on_date: null, start_date: "2026-11-17", end_date: "2026-11-30",
        late_window_minutes: null,
      }),
    );
  });

  it("can't end before it starts", async () => {
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = await addForm();
    fireEvent.change(form.getByLabelText("Title"), { target: { value: "Tablet" } });
    fireEvent.change(form.getByLabelText("Starts"), { target: { value: "2026-11-25" } });
    fireEvent.click(form.getByLabelText("Ends on"));
    expect(form.getByLabelText("Ends on date")).toHaveValue("2026-11-25");
    fireEvent.change(form.getByLabelText("Ends on date"), { target: { value: "2026-11-20" } });
    expect(form.getByText("It can't end before it starts.")).toBeInTheDocument();
    expect(form.getByRole("button", { name: "Add reminder" })).toBeDisabled();
  });

  it("uses the app clock's day, not the browser's, near midnight", async () => {
    // 11:30 PM UTC on the 17th is already 5:00 AM on the 18th in India.
    vi.setSystemTime(new Date("2026-11-17T23:30:00Z"));
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = await addForm();
    expect(form.getByLabelText("Starts")).toHaveValue("2026-11-18");
  });

  it("edits and deletes a reminder", async () => {
    api.updateReminder.mockResolvedValue(reminder);
    api.deleteReminder.mockResolvedValue(undefined);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });

    fireEvent.click(await screen.findByRole("button", { name: "Edit Blood pressure tablet" }));
    const form = within(screen.getByRole("form", { name: "Save changes" }));
    expect(form.getByLabelText("Time")).toHaveValue("09:00");
    expect(form.getByLabelText("Every day")).toBeChecked();
    expect(form.getByLabelText("Starts")).toHaveValue("2026-11-01");
    fireEvent.click(form.getByLabelText("Active"));
    fireEvent.click(form.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api.updateReminder).toHaveBeenCalledWith(2, 7, expect.objectContaining({ active: false, time_of_day: "09:00", start_date: "2026-11-01" })),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Delete Blood pressure tablet" }));
    await closeToast(/Reminder deleted: Blood pressure tablet/);
    await waitFor(() => expect(api.deleteReminder).toHaveBeenCalledWith(2, 7));
  });

  it("Undo brings a deleted reminder back without touching the server", async () => {
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    fireEvent.click(await screen.findByRole("button", { name: "Delete Blood pressure tablet" }));
    await waitFor(() => expect(screen.queryByRole("cell", { name: "Blood pressure tablet" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("cell", { name: "Blood pressure tablet" })).toBeInTheDocument();
    expect(api.deleteReminder).not.toHaveBeenCalled();
  });

  it("adds optimistically, confirms, and rolls back with a message if the server refuses", async () => {
    let refuse: (e: unknown) => void = () => undefined;
    api.createReminder.mockImplementation(() => new Promise((_, reject) => (refuse = reject)));
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = await addForm();
    fireEvent.change(form.getByLabelText("Title"), { target: { value: "Evening walk" } });
    fireEvent.change(form.getByLabelText("Type"), { target: { value: "other" } });
    fireEvent.click(form.getByLabelText("Every day"));
    fireEvent.click(form.getByRole("button", { name: "Add reminder" }));
    // In the list at once, before the server answers.
    expect(await screen.findByRole("cell", { name: "Evening walk" })).toBeInTheDocument();
    refuse(Object.assign(new Error("500"), { isAxiosError: true, response: { status: 500, data: {} } }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the change.");
    await waitFor(() => expect(screen.queryByRole("cell", { name: "Evening walk" })).toBeNull());
  });

  it("a medicine can have a safe late window; other types can't", async () => {
    api.createReminder.mockResolvedValue(reminder);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = await addForm();
    fireEvent.change(form.getByLabelText("Title"), { target: { value: "Tablet" } });
    fireEvent.change(form.getByLabelText("Safe late window"), { target: { value: "180" } });
    fireEvent.click(form.getByRole("button", { name: "Add reminder" }));
    await waitFor(() => expect(api.createReminder).toHaveBeenLastCalledWith(2, expect.objectContaining({ late_window_minutes: 180 })));
    const again = await addForm();
    fireEvent.change(again.getByLabelText("Type"), { target: { value: "meal" } });
    expect(again.queryByLabelText("Safe late window")).toBeNull();
  });

  it("shows confirmed-later and not-sure answers in words", () => {
    expect(todayLabel({ ...reminder, today_status: "done", today_marked_by: "patient", today_late: true, today_logged_at: "2026-11-17T15:10:00Z" })).toBe(
      "Done, confirmed later at 8:40 pm",
    );
    expect(todayLabel({ ...reminder, today_status: "unsure" })).toBe("Not sure (family told)");
  });

  it("shows the server's reason when a save is refused", async () => {
    api.createReminder.mockRejectedValue(
      Object.assign(new Error("422"), { isAxiosError: true, response: { status: 422, data: { detail: "Pick a date and time that have not passed yet." } } }),
    );
    renderWithProviders(<App />, { route: "/caregiver/patients/2/reminders" });
    const form = await addForm();
    fireEvent.change(form.getByLabelText("Title"), { target: { value: "Tablet" } });
    fireEvent.click(form.getByRole("button", { name: "Add reminder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the change. Pick a date and time that have not passed yet.");
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

    const panel = within(await screen.findByRole("region", { name: "Alerts (1 new)" }));
    // Under every alert: Khayal is not a medical device (CLAUDE.md section 11).
    expect(panel.getByText(/not a medical device and does not diagnose/)).toBeInTheDocument();
    expect(panel.getByText(alert.message)).toBeInTheDocument();
    // The summary card at the top repeats the latest new alert.
    expect(within(screen.getByRole("region", { name: "Summary" })).getByText(alert.message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(api.acknowledgeAlert.mock.calls[0]?.[0]).toBe(3));
    expect(await screen.findByText("Acknowledged (1)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reminders" })).toHaveAttribute("href", "/caregiver/patients/2/reminders");
  });
});
