import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import type { WeekStats, Weekly } from "../../api/client";

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export interface WeekLine {
  label: string;
  now: number | null;
  before: number | null;
  /** A share (0–1) shown as a percentage; changes are then in percentage points. */
  share?: boolean;
}

export function weeklyLines(w: WeekStats, last: WeekStats): WeekLine[] {
  const done = (x: WeekStats) => (x.reminders_total ? x.reminders_done / x.reminders_total : null);
  return [
    { label: "Days with a game", now: w.days_played, before: last.days_played },
    { label: "Games finished", now: w.completed, before: last.completed },
    { label: "Rounds right (finished games)", now: w.accuracy, before: last.accuracy, share: true },
    { label: "Medicine doses taken", now: w.doses.taken, before: last.doses.taken },
    { label: "Doses missed or not sure", now: w.doses.missed + w.doses.unsure, before: last.doses.missed + last.doses.unsure },
    { label: "Reminders done", now: done(w), before: done(last), share: true },
    { label: "Alerts", now: w.alerts, before: last.alerts },
    { label: "Voice recordings", now: w.recordings, before: last.recordings },
    { label: "Days feeling good", now: w.mood.good, before: last.mood.good },
    { label: "Days feeling not so good", now: w.mood.not_so_good, before: last.mood.not_so_good },
  ];
}

export function valueText(line: WeekLine): string {
  if (line.now === null) return "—";
  return line.share ? `${Math.round(line.now * 100)}%` : String(line.now);
}

/** "3 more than the week before", "12 points lower than the week before", or null without a comparison. */
export function changeText(line: WeekLine): { text: string; icon: LucideIcon } | null {
  if (line.now === null || line.before === null) return null;
  const diff = line.share ? Math.round(line.now * 100) - Math.round(line.before * 100) : line.now - line.before;
  if (diff === 0) return { text: "same as the week before", icon: Minus };
  const n = Math.abs(diff);
  const words = line.share ? `${n} ${n === 1 ? "point" : "points"} ${diff > 0 ? "higher" : "lower"}` : `${n} ${diff > 0 ? "more" : "fewer"}`;
  return { text: `${words} than the week before`, icon: diff > 0 ? ArrowUp : ArrowDown };
}

/** "This week" (last 7 days, today included) next to the 7 days before, in words and numbers. */
export function WeeklySummary({ weekly }: { weekly: Weekly }) {
  const { this_week: w, last_week: before } = weekly;
  return (
    <div>
      <p className="mb-3 text-ink-muted">
        {shortDate(w.start)} – {shortDate(w.end)}, compared with {shortDate(before.start)} – {shortDate(before.end)}. Rounds
        right also depends on the level, so a lower share can simply mean harder games.
      </p>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {weeklyLines(w, before).map((line) => {
          const c = changeText(line);
          return (
            <div key={line.label} className="flex flex-col">
              <dt className="text-ink-muted">{line.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-lg font-semibold tabular-nums">{valueText(line)}</span>
                {c && (
                  <span className="inline-flex items-center gap-1 text-sm text-ink-soft">
                    <c.icon aria-hidden="true" className="size-3.5 self-center" />
                    {c.text}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
