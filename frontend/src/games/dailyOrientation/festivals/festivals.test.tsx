import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import type { User } from "../../../api/client";
import { copy } from "../../../copy";
import { renderWithProviders } from "../../../test/renderWithProviders";
import { ANSWER_HOLD_MS } from "../../Answer";
import { dailyOrientation, DailyOrientationRound, FESTIVAL_ROUND } from "../DailyOrientation";
import { FESTIVALS_2026 } from "./2026";
import { FESTIVALS_2027 } from "./2027";
import { FESTIVAL_ART } from "./FestivalArt";
import { dueFestival, FESTIVAL_IDS, festivalQuestion, nextDate } from "./index";

const day = (iso: string) => new Date(`${iso}T10:00:00`);
const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("../../../auth/AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../auth/AuthContext")>();
  return { ...actual, useAuth: () => ({ state: { status: "authenticated", user: auth.user } }) };
});

describe("festival dates", () => {
  it("have a date in every yearly table, a name and a picture", () => {
    for (const id of FESTIVAL_IDS) {
      expect(FESTIVALS_2026[id]).toMatch(/^2026-\d\d-\d\d$/);
      expect(FESTIVALS_2027[id]).toMatch(/^2027-\d\d-\d\d$/);
      expect(copy.festivals[id]).toBeTruthy();
      expect(FESTIVAL_ART[id]).toBeTruthy();
    }
    expect(nextDate("diwali", day("2026-11-18"))).toBe("2027-10-29");
  });

  it("is due only within 30 days of a festival the family ticked", () => {
    expect(dueFestival(null, day("2026-10-20"))).toBeNull();
    expect(dueFestival([], day("2026-10-20"))).toBeNull();
    expect(dueFestival(["diwali"], day("2026-10-09"))).toBe("diwali"); // 30 days before 8 Nov
    expect(dueFestival(["diwali"], day("2026-10-08"))).toBeNull(); // 31 days before
    expect(dueFestival(["diwali"], day("2026-11-08"))).toBe("diwali"); // on the day
    expect(dueFestival(["diwali", "guru_nanak_jayanti"], day("2026-11-10"))).toBe("guru_nanak_jayanti");
    expect(dueFestival(["not_a_festival"], day("2026-11-01"))).toBeNull();
  });

  it("offers two festivals that come later, so 'next' is never in doubt", () => {
    for (let i = 0; i < 30; i++) {
      const q = festivalQuestion(["diwali", "christmas", "dussehra"], day("2026-10-25"), Math.random)!;
      expect(q.answer).toBe("diwali");
      expect(q.options).toHaveLength(3);
      expect(new Set(q.options).size).toBe(3);
      for (const id of q.options.filter((o) => o !== "diwali")) expect(nextDate(id, day("2026-10-25"))! > "2026-11-08").toBe(true);
    }
  });
});

describe("About Today festival round", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("adds a 6th round only when a ticked festival is near", () => {
    const user = { festivals: ["diwali"] } as unknown as User;
    expect(dailyOrientation.extraRound?.(user, day("2026-10-25"))).toBe(true);
    expect(dailyOrientation.extraRound?.(user, day("2026-07-01"))).toBe(false);
    expect(dailyOrientation.extraRound?.(null, day("2026-10-25"))).toBe(false);
  });

  it("asks which festival comes next, with pictures and words", () => {
    vi.setSystemTime(day("2026-10-25"));
    const kamala = { id: 2, name: "Kamala", role: "patient", festivals: ["diwali", "christmas"] } as unknown as User;
    const onComplete = vi.fn();
    auth.user = kamala;
    renderWithProviders(<DailyOrientationRound level={1} roundIndex={FESTIVAL_ROUND} onComplete={onComplete} />);
    expect(screen.getByText(copy.games.orientation.askFestival)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.festivals.diwali }));
    act(() => vi.advanceTimersByTime(ANSWER_HOLD_MS));
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true }),
      copy.games.orientation.yes + copy.games.orientation.replyFestival(copy.festivals.diwali),
    );
  });
});
