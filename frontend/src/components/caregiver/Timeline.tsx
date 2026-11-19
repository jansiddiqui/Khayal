import { useInfiniteQuery } from "@tanstack/react-query";
import { Bell, Gamepad2, Mic, Pill, Settings2, Smile, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { getTimeline, serverDate, TIMELINE_PAGE, type TimelineEvent, type TimelineKind } from "../../api/client";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { LoadError } from "./LoadError";
import { TONE } from "./Insights";
import { LOCALE, serverText, t, timeText } from "../../t";

export const KINDS: { kind: TimelineKind; label: string; icon: LucideIcon }[] = [
  { kind: "session", label: t.elderPanels.timeline.games, icon: Gamepad2 },
  { kind: "reminder", label: t.elderPanels.timeline.reminders, icon: Pill },
  { kind: "alert", label: t.elderPanels.timeline.alerts, icon: Bell },
  { kind: "recording", label: t.elderPanels.timeline.recordings, icon: Mic },
  { kind: "mood", label: t.elderPanels.timeline.mood, icon: Smile },
  { kind: "settings", label: t.elderPanels.timeline.settings, icon: Settings2 },
];
const ICON = Object.fromEntries(KINDS.map((k) => [k.kind, k.icon])) as Record<TimelineKind, LucideIcon>;
/** 0 = today (the default); the others are the last N days (game-header-timeline). */
const RANGES = [0, 7, 30, 90] as const;
type Range = (typeof RANGES)[number];
/** The caregiver's last choice, on this device only. */
const RANGE_KEY = "khayal.timelineRange";

function storedRange(): Range {
  try {
    const value = Number(localStorage.getItem(RANGE_KEY));
    return (RANGES as readonly number[]).includes(value) ? (value as Range) : 0;
  } catch {
    return 0;
  }
}

function saveRange(range: Range): void {
  try {
    localStorage.setItem(RANGE_KEY, String(range));
  } catch {
    // Not saved: the next visit opens on Today.
  }
}

const dayKey = (iso: string) => serverDate(iso).toDateString();
const dayHeading = (iso: string) =>
  serverDate(iso).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
const timeAt = (iso: string) => timeText(serverDate(iso));

/** Events grouped by day, newest day first (the server sends them newest first). */
export function byDay(events: readonly TimelineEvent[]): { key: string; heading: string; events: TimelineEvent[] }[] {
  const groups: { key: string; heading: string; events: TimelineEvent[] }[] = [];
  for (const e of events) {
    const key = dayKey(e.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(e);
    else groups.push({ key, heading: dayHeading(e.at), events: [e] });
  }
  return groups;
}

/** Per-elder timeline: sessions, reminders done/missed/not sure, alerts, recordings and settings changes. */
export function Timeline({ patientId }: { patientId: number }) {
  const [kinds, setKinds] = useState<TimelineKind[]>(KINDS.map((k) => k.kind));
  const [days, setDaysState] = useState<Range>(storedRange);
  const setDays = (range: Range) => {
    setDaysState(range);
    saveRange(range);
  };
  const query = useInfiniteQuery({
    queryKey: ["timeline", patientId, days, kinds],
    queryFn: ({ pageParam }) => getTimeline(patientId, days, kinds, pageParam),
    initialPageParam: undefined as string | undefined,
    // A full page may have more behind it: the next page starts before its oldest event.
    getNextPageParam: (last) => (last.length === TIMELINE_PAGE ? last[last.length - 1]!.at : undefined),
    enabled: kinds.length > 0,
  });
  const events = query.data?.pages.flat() ?? [];
  const toggle = (kind: TimelineKind) =>
    setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t.elderPanels.timeline.show}</legend>
        {KINDS.map(({ kind, label, icon: Icon }) => {
          const on = kinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(kind)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 transition-colors duration-150 ease-calm ${
                on ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-surface text-ink-muted hover:bg-sunken"
              }`}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          );
        })}
        <label className="ml-auto inline-flex items-center gap-2 text-ink-soft">
          {t.elderPanels.timeline.period}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as Range)}
            className="rounded-md border border-line bg-surface px-2 py-1"
          >
            {RANGES.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? t.elderPanels.timeline.today : t.elderPanels.timeline.lastDays(d)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {kinds.length === 0 && <p className="text-ink-muted">{t.elderPanels.timeline.chooseKind}</p>}
      {kinds.length > 0 && query.isPending && (
        <div role="status" aria-busy="true" aria-label={t.elderPanels.timeline.loading} className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}
      {query.isError && <LoadError message={t.elderPanels.timeline.loadFailed} onRetry={() => void query.refetch()} />}
      {query.isSuccess && kinds.length > 0 && events.length === 0 && days === 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-ink-muted">{t.elderPanels.timeline.nothingToday}</p>
          <Button size="sm" onClick={() => setDays(7)}>
            {t.elderPanels.timeline.showWeek}
          </Button>
        </div>
      )}
      {query.isSuccess && kinds.length > 0 && events.length === 0 && days > 0 && (
        <p className="text-ink-muted">{t.elderPanels.timeline.empty(days)}</p>
      )}
      {query.isSuccess && kinds.length > 0 && events.length > 0 && (
        <ol className="flex flex-col gap-4" aria-label={t.elderPanels.timeline.label}>
          {byDay(events).map((day) => (
            <li key={day.key}>
              <h3 className="mb-1.5 font-semibold">{day.heading}</h3>
              <ol className="flex flex-col border-l border-line pl-3">
                {day.events.map((e, i) => {
                  const Icon = ICON[e.kind];
                  const tone = TONE[e.tone];
                  return (
                    <li key={`${e.at}-${i}`} className="relative flex gap-3 py-1.5">
                      <time dateTime={e.at} className="min-w-16 shrink-0 whitespace-nowrap tabular-nums text-ink-muted">
                        {timeAt(e.at)}
                      </time>
                      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${e.tone === "neutral" ? "text-ink-muted" : tone.className}`} />
                      <span className="min-w-0">
                        <span className={e.tone === "attention" ? "font-medium text-ink" : "text-ink"}>{serverText(e.title, e.title_i18n)}</span>
                        {e.detail && <span className="block text-ink-muted">{serverText(e.detail, e.detail_i18n)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
      {query.hasNextPage && (
        <Button className="self-start" size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t.elderPanels.timeline.loadMore}
        </Button>
      )}
    </div>
  );
}
