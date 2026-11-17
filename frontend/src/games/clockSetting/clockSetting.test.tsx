import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { copy } from "../../copy";
import { ANSWER_HOLD_MS } from "../Answer";
import { ClockSettingRound } from "./ClockSetting";
import {
  addMinutes,
  angleOf,
  buildClockRound,
  errorBits,
  hourPosition,
  readingChoices,
  scoreSetting,
  snapMinute,
  timeWords,
} from "./logic";

const t = copy.games.clockSetting;
const rng = () => 0.3;

describe("Set the clock logic", () => {
  it("follows the levels in research.md 2.3", () => {
    expect(buildClockRound(1, rng)).toMatchObject({ kind: "read", time: { m: 0 } });
    expect(buildClockRound(2, rng)).toMatchObject({ kind: "set", time: { m: 0 }, face: "numbers" });
    expect(buildClockRound(3, rng)).toMatchObject({ kind: "set", time: { m: 30 } });
    expect([15, 45]).toContain(buildClockRound(4, rng).time.m);
    expect(buildClockRound(7, rng).face).toBe("quarters");
    expect(buildClockRound(8, rng).face).toBe("ticks");
    expect(buildClockRound(9, rng)).toMatchObject({ wordsOnly: true });
    const later = buildClockRound(10, rng);
    expect(later).toMatchObject({ kind: "read", later: true });
    expect(later.answer).toEqual(addMinutes(later.time, 90));
    expect(buildClockRound(9, rng, true)).toMatchObject({ kind: "read", time: { m: 0 } });
    // Level 6: the number in the words never equals the hour (the classic pull).
    for (let i = 0; i < 50; i++) {
      const r = buildClockRound(6, Math.random);
      expect(r.time.h).not.toBe(r.time.m / 5);
    }
  });

  it("says times the everyday way", () => {
    expect(timeWords({ h: 11, m: 10 })).toBe("10 past 11");
    expect(timeWords({ h: 3, m: 0 })).toBe("3 o'clock");
    expect(timeWords({ h: 3, m: 30 })).toBe("half past 3");
    expect(timeWords({ h: 3, m: 45 })).toBe("quarter to 4");
    expect(timeWords({ h: 12, m: 40 })).toBe("20 to 1");
    expect(timeWords({ h: 3, m: 40 }, true)).toBe("twenty to four");
    expect(addMinutes({ h: 11, m: 30 }, 90)).toEqual({ h: 1, m: 0 });
  });

  it("turns taps into hand positions", () => {
    expect(angleOf(0, -10)).toBeCloseTo(0);
    expect(angleOf(10, 0)).toBeCloseTo(90);
    expect(hourPosition(angleOf(10, 0))).toBe(3);
    expect(hourPosition(angleOf(0, -10))).toBe(12);
    expect(hourPosition(105)).toBe(3.5);
    expect(snapMinute(62)).toBe(10);
    expect(snapMinute(358)).toBe(0);
  });

  it("scores the hour by sector and the minute within 5 minutes", () => {
    expect(scoreSetting({ h: 11, m: 10 }, 11, 10)).toEqual({ hourRight: true, minuteRight: true });
    expect(scoreSetting({ h: 11, m: 10 }, 10, 10)).toEqual({ hourRight: false, minuteRight: true }); // the pull to 10
    expect(scoreSetting({ h: 3, m: 45 }, 4, 45).hourRight).toBe(true);
    expect(scoreSetting({ h: 3, m: 0 }, 3.5, 0).hourRight).toBe(false);
    expect(scoreSetting({ h: 3, m: 30 }, 3.5, 35).minuteRight).toBe(true);
    expect(scoreSetting({ h: 12, m: 0 }, 12, 0).hourRight).toBe(true);
    expect(errorBits({ hourRight: false, minuteRight: false })).toBe(3);
  });

  it("offers three different answers, one of them right", () => {
    for (const level of [1, 10]) {
      const round = buildClockRound(level, Math.random);
      const choices = readingChoices(round, Math.random);
      expect(choices).toHaveLength(3);
      expect(new Set(choices.map((c) => `${c.h}:${c.m}`)).size).toBe(3);
      expect(choices).toContainEqual(round.answer ?? round.time);
    }
  });
});

describe("Set the clock round", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // jsdom boxes are 0×0 at (0, 0): a click at (x, y) is that far from the centre.
  const tapAt = (x: number, y: number) => fireEvent.click(screen.getByRole("img", { name: t.clockLabel }), { clientX: x, clientY: y });

  it("places the short hand, then the long hand, and lets either move before Done", () => {
    const onComplete = vi.fn();
    render(<ClockSettingRound level={2} roundIndex={0} onComplete={onComplete} rng={rng} />);
    const target = buildClockRound(2, rng).time;
    expect(screen.getByText(t.setTo(timeWords(target)))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.done })).toBeDisabled();

    const at = (hours: number) => {
      const a = (hours * 30 * Math.PI) / 180;
      return [Math.sin(a) * 50, -Math.cos(a) * 50] as const;
    };
    tapAt(...at(target.h + 1)); // short hand, one hour off
    expect(screen.getByText(t.tapLong)).toBeInTheDocument();
    tapAt(...at(0)); // long hand on 12
    // Move the short hand to the right hour.
    fireEvent.click(screen.getByRole("button", { name: t.shortHand }));
    tapAt(...at(target.h));
    fireEvent.click(screen.getByRole("button", { name: t.done }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true, errors: 0, hint_used: false }), undefined);
  });

  it("explains the right time gently after a miss", () => {
    const onComplete = vi.fn();
    render(<ClockSettingRound level={2} roundIndex={0} onComplete={onComplete} rng={rng} />);
    const target = buildClockRound(2, rng).time;
    tapAt(0, 50); // short hand on 6
    tapAt(50, 0); // long hand on 3
    fireEvent.click(screen.getByRole("button", { name: t.done }));
    const [result, feedback] = onComplete.mock.calls[0]!;
    expect(result.correct).toBe(false);
    expect(feedback).toBe(t.thisIs(timeWords(target)));
  });

  it("reads a clock with three choices", () => {
    const onComplete = vi.fn();
    render(<ClockSettingRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    const round = buildClockRound(1, rng);
    fireEvent.click(screen.getByRole("button", { name: timeWords(round.time) }));
    act(() => vi.advanceTimersByTime(ANSWER_HOLD_MS));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true, errors: 0 }), expect.stringContaining(timeWords(round.time)));
  });

  it("practice shows the right answer after a slip and waits for it", () => {
    const onComplete = vi.fn();
    render(<ClockSettingRound level={1} practice roundIndex={0} onComplete={onComplete} rng={rng} />);
    const round = buildClockRound(1, rng, true);
    const wrong = screen.getAllByRole("button").find((b) => b.textContent !== timeWords(round.time))!;
    fireEvent.click(wrong);
    expect(screen.getByText(t.practiceHint(timeWords(round.time)))).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: timeWords(round.time) }));
    act(() => vi.advanceTimersByTime(ANSWER_HOLD_MS));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
