import { describe, expect, it } from "vitest";
import { appNow, dayLabel, defaultRepeat, formProblem, isInThePast, scheduleSummary } from "./reminderSchedule";

const at = (iso: string) => new Date(iso);

describe("the app clock", () => {
  it("turns at India's midnight, not UTC's or the browser's", () => {
    expect(appNow(330, at("2026-11-17T18:29:00Z"))).toEqual({ date: "2026-11-17", time: "23:59" });
    expect(appNow(330, at("2026-11-17T18:30:00Z"))).toEqual({ date: "2026-11-18", time: "00:00" });
    expect(appNow(0, at("2026-11-17T18:30:00Z"))).toEqual({ date: "2026-11-17", time: "18:30" });
  });

  it("knows when a one-time reminder is already in the past", () => {
    const now = at("2026-11-17T10:00:00Z"); // 15:30 IST
    expect(isInThePast("2026-11-16", "23:00", 330, now)).toBe(true);
    expect(isInThePast("2026-11-17", "15:30", 330, now)).toBe(true);
    expect(isInThePast("2026-11-17", "15:31", 330, now)).toBe(false);
    expect(isInThePast("2026-11-18", "00:00", 330, now)).toBe(false);
  });
});

describe("summaries", () => {
  const base = { days_of_week: [], on_date: null, start_date: "2026-11-01", end_date: null, time_of_day: "09:00:00" };
  it("reads like the caregiver would say it", () => {
    expect(dayLabel("2026-11-18")).toBe("Wed 18 Nov");
    expect(scheduleSummary({ ...base, repeat: "once", on_date: "2026-11-18", start_date: null, time_of_day: "20:00:00" }, "2026-11-17")).toBe(
      "Once · Wed 18 Nov · 8:00 PM",
    );
    expect(scheduleSummary({ ...base, repeat: "daily", days_of_week: [0, 1, 2, 3, 4, 5, 6] }, "2026-11-17")).toBe("Every day · 9:00 AM");
    expect(scheduleSummary({ ...base, repeat: "weekly_days", days_of_week: [0, 2, 4], time_of_day: "18:00:00", end_date: "2026-11-30" }, "2026-11-17")).toBe(
      "Mon, Wed, Fri · 6:00 PM · until 30 Nov",
    );
    expect(scheduleSummary({ ...base, repeat: "daily", start_date: "2026-12-01" }, "2026-11-17")).toBe("Every day · 9:00 AM · from 1 Dec");
  });
});

describe("the form", () => {
  it("defaults Repeats from the type", () => {
    expect([defaultRepeat("appointment"), defaultRepeat("medicine"), defaultRepeat("meal"), defaultRepeat("other")]).toEqual([
      "once",
      "daily",
      "weekly_days",
      "weekly_days",
    ]);
  });

  it("explains what is missing", () => {
    const now = at("2026-11-17T10:00:00Z");
    const form = { title: "x", type: "other" as const, time_of_day: "18:00", active: true, days_of_week: [], on_date: "2026-11-17", start_date: "2026-11-17", end_date: null };
    expect(formProblem({ ...form, repeat: "once" }, 330, now)).toBeNull();
    expect(formProblem({ ...form, repeat: "once", on_date: null }, 330, now)).toBe("Choose a date.");
    expect(formProblem({ ...form, repeat: "weekly_days" }, 330, now)).toBe("Choose at least one day.");
    expect(formProblem({ ...form, repeat: "daily", start_date: null }, 330, now)).toBe("Choose when it starts.");
    expect(formProblem({ ...form, repeat: "daily", end_date: "2026-11-16" }, 330, now)).toBe("It can't end before it starts.");
    expect(formProblem({ ...form, repeat: "daily", end_date: "2026-11-17" }, 330, now)).toBeNull();
  });
});
