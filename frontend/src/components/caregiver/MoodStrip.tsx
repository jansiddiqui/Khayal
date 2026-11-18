import { useQuery } from "@tanstack/react-query";
import { Frown, Meh, Minus, Smile, type LucideIcon } from "lucide-react";
import { getMoodHistory, type Mood, type MoodDay } from "../../api/client";
import { Skeleton } from "../../ui/Skeleton";
import { LOCALE, t } from "../../t";

export const MOOD_LOOK: Record<Mood | "skipped" | "none", { label: string; icon: LucideIcon; className: string }> = {
  good: { label: t.common.mood.good, icon: Smile, className: "text-success" },
  okay: { label: t.common.mood.okay, icon: Meh, className: "text-ink-soft" },
  not_so_good: { label: t.common.mood.not_so_good, icon: Frown, className: "text-accent-strong" },
  skipped: { label: t.common.mood.skipped, icon: Minus, className: "text-ink-muted" },
  none: { label: t.elderPage.mood.notAsked, icon: Minus, className: "text-line-strong" },
};

const DAYS = 30;

/** The last 30 days as one row, oldest first, with a gap for days without an answer. */
export function moodDays(history: readonly MoodDay[], today: Date, days = DAYS): { date: string; look: keyof typeof MOOD_LOOK }[] {
  const byDate = new Map(history.map((d) => [d.date, d.mood]));
  const out: { date: string; look: keyof typeof MOOD_LOOK }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const mood = byDate.get(key);
    out.push({ date: key, look: mood === undefined ? "none" : mood === null ? "skipped" : mood });
  }
  return out;
}

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

/**
 * Daily mood next to the score charts (Round 2 batch 4): an icon per day with its word in the
 * tooltip and for screen readers, plus the counts in words. Mood changes no alert rule.
 */
export function MoodStrip({ patientId }: { patientId: number }) {
  const q = useQuery({ queryKey: ["mood", patientId], queryFn: () => getMoodHistory(patientId, DAYS) });
  if (q.isPending) return <Skeleton className="h-16 w-full" />;
  if (q.isError) return null;
  const days = moodDays(q.data, new Date());
  const count = (look: keyof typeof MOOD_LOOK) => days.filter((d) => d.look === look).length;
  return (
    <figure aria-label={t.elderPage.mood.title} className="rounded-lg border border-line bg-surface p-3">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{t.elderPage.mood.title}</span>
        <span className="text-sm text-ink-muted">
          {t.elderPage.mood.counts(count("good"), count("okay"), count("not_so_good"), count("skipped"))}
        </span>
      </figcaption>
      <ol className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-px">
        {days.map((d) => {
          const look = MOOD_LOOK[d.look];
          return (
            <li key={d.date} title={`${dayLabel(d.date)}: ${look.label}`} className="flex justify-center">
              <look.icon aria-label={`${dayLabel(d.date)}: ${look.label}`} role="img" className={`size-4 ${look.className}`} strokeWidth={2.25} />
            </li>
          );
        })}
      </ol>
      <p className="mt-1 flex justify-between text-xs text-ink-muted" aria-hidden="true">
        <span>{dayLabel(days[0]!.date)}</span>
        <span>{t.elderPage.mood.today}</span>
      </p>
      <p className="mt-1 text-sm text-ink-muted">{t.elderPage.mood.note}</p>
    </figure>
  );
}
