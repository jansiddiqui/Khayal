import type { Reminder, ReminderInput, ReminderRepeat, ReminderType } from "../../api/client";
import { copy } from "../../copy";

/**
 * Reminder schedules on the caregiver page. Dates are days on the app's clock (IST by default,
 * `utc_offset_minutes` from /api/config), not the caregiver's own browser clock, so "today" here is
 * the same day the server and the elder's phone use.
 */

export const IST_MINUTES = 330;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // 0 = Monday
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Now" on the app clock: date "YYYY-MM-DD" and time "HH:MM". */
export function appNow(offsetMinutes: number = IST_MINUTES, now: Date = new Date()): { date: string; time: string } {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000).toISOString(); // UTC fields = app-clock fields
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

/** A one-time reminder at or before this moment has already passed (the server refuses it too). */
export function isInThePast(onDate: string, hhmm: string, offsetMinutes: number = IST_MINUTES, now: Date = new Date()): boolean {
  const current = appNow(offsetMinutes, now);
  return onDate < current.date || (onDate === current.date && hhmm <= current.time);
}

/** "Tue 18 Nov" for "2026-11-18". */
export function dayLabel(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = Monday
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]}`;
}

/** "30 Nov" for "2026-11-30". */
function shortDay(iso: string): string {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * A plain summary: "Once · Tue 18 Nov · 8:00 PM", "Every day · 9:00 AM",
 * "Mon, Wed, Fri · 6:00 PM · until 30 Nov" (plus "from 20 Nov" while it has not started yet).
 */
export function scheduleSummary(r: Pick<Reminder, "repeat" | "days_of_week" | "on_date" | "start_date" | "end_date" | "time_of_day">, today: string): string {
  const time = copy.reminders.time(r.time_of_day);
  if (r.repeat === "once") return `Once · ${r.on_date ? dayLabel(r.on_date) : "no date"} · ${time}`;
  const days = r.repeat === "daily" || r.days_of_week.length === 7 ? "Every day" : r.days_of_week.map((d) => WEEKDAYS[d]).join(", ");
  const parts = [days, time];
  if (r.start_date && r.start_date > today) parts.push(`from ${shortDay(r.start_date)}`);
  if (r.end_date) parts.push(`until ${shortDay(r.end_date)}`);
  return parts.join(" · ");
}

/** What "Repeats" starts as for each type: appointments are usually one-off, medicine every day. */
export function defaultRepeat(type: ReminderType): ReminderRepeat {
  if (type === "appointment") return "once";
  if (type === "medicine") return "daily";
  return "weekly_days";
}

/** A new, empty form for `today` (app clock). */
export function emptyReminder(today: string, type: ReminderType = "medicine"): ReminderInput {
  return {
    title: "",
    type,
    time_of_day: "09:00",
    repeat: defaultRepeat(type),
    days_of_week: [],
    on_date: today,
    start_date: today,
    end_date: null,
    active: true,
  };
}

/** Only the fields that apply to the chosen repeat are sent. */
export function cleanInput(form: ReminderInput): ReminderInput {
  const base = { title: form.title.trim(), type: form.type, time_of_day: form.time_of_day, active: form.active, repeat: form.repeat };
  if (form.repeat === "once") return { ...base, days_of_week: [], on_date: form.on_date, start_date: null, end_date: null };
  return {
    ...base,
    days_of_week: form.repeat === "daily" ? [0, 1, 2, 3, 4, 5, 6] : form.days_of_week,
    on_date: null,
    start_date: form.start_date,
    end_date: form.end_date,
  };
}

/** Why the form can't be saved yet, or null. */
export function formProblem(form: ReminderInput, offsetMinutes: number = IST_MINUTES, now: Date = new Date()): string | null {
  if (form.time_of_day === "") return "Choose a time.";
  if (form.repeat === "once") {
    if (!form.on_date) return "Choose a date.";
    if (isInThePast(form.on_date, form.time_of_day, offsetMinutes, now)) return "That time has already passed. Choose a later date or time.";
    return null;
  }
  if (form.repeat === "weekly_days" && form.days_of_week.length === 0) return "Choose at least one day.";
  if (!form.start_date) return "Choose when it starts.";
  if (form.end_date && form.end_date < form.start_date) return "It can't end before it starts.";
  return null;
}
