import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import type { WeekStats, Weekly } from "../../api/client";
import { LOCALE, t } from "../../t";

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

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
    { label: t.elderPanels.weekly.daysWithGame, now: w.days_played, before: last.days_played },
    { label: t.elderPanels.weekly.gamesFinished, now: w.completed, before: last.completed },
    { label: t.elderPanels.weekly.roundsRight, now: w.accuracy, before: last.accuracy, share: true },
    { label: t.elderPanels.weekly.dosesTaken, now: w.doses.taken, before: last.doses.taken },
    { label: t.elderPanels.weekly.dosesMissed, now: w.doses.missed + w.doses.unsure, before: last.doses.missed + last.doses.unsure },
    { label: t.elderPanels.weekly.remindersDone, now: done(w), before: done(last), share: true },
    { label: t.elderPanels.weekly.alerts, now: w.alerts, before: last.alerts },
    { label: t.elderPanels.weekly.recordings, now: w.recordings, before: last.recordings },
    { label: t.elderPanels.weekly.daysGood, now: w.mood.good, before: last.mood.good },
    { label: t.elderPanels.weekly.daysNotSoGood, now: w.mood.not_so_good, before: last.mood.not_so_good },
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
  if (diff === 0) return { text: t.elderPanels.weekly.same, icon: Minus };
  const n = Math.abs(diff);
  const text = line.share ? t.elderPanels.weekly.pointsChange(n, diff > 0) : t.elderPanels.weekly.countChange(n, diff > 0);
  return { text, icon: diff > 0 ? ArrowUp : ArrowDown };
}

/** "This week" (last 7 days, today included) next to the 7 days before, in words and numbers. */
export function WeeklySummary({ weekly }: { weekly: Weekly }) {
  const { this_week: w, last_week: before } = weekly;
  return (
    <div>
      <p className="mb-3 text-ink-muted">
        {t.elderPanels.weekly.intro(`${shortDate(w.start)} – ${shortDate(w.end)}`, `${shortDate(before.start)} – ${shortDate(before.end)}`)}
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
