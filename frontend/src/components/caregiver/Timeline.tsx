import { useQuery } from "@tanstack/react-query";
import { Bell, Gamepad2, Mic, Pill, Settings2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { getTimeline, serverDate, type TimelineEvent, type TimelineKind } from "../../api/client";
import { Skeleton } from "../../ui/Skeleton";
import { LoadError } from "./LoadError";
import { TONE } from "./Insights";

export const KINDS: { kind: TimelineKind; label: string; icon: LucideIcon }[] = [
  { kind: "session", label: "Games", icon: Gamepad2 },
  { kind: "reminder", label: "Reminders", icon: Pill },
  { kind: "alert", label: "Alerts", icon: Bell },
  { kind: "recording", label: "Recordings", icon: Mic },
  { kind: "settings", label: "Settings changes", icon: Settings2 },
];
const ICON = Object.fromEntries(KINDS.map((k) => [k.kind, k.icon])) as Record<TimelineKind, LucideIcon>;
const RANGES = [7, 14, 30, 90] as const;

const dayKey = (iso: string) => serverDate(iso).toDateString();
const dayHeading = (iso: string) =>
  serverDate(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
const timeText = (iso: string) => serverDate(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

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
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const query = useQuery({
    queryKey: ["timeline", patientId, days, kinds],
    queryFn: () => getTimeline(patientId, days, kinds),
    enabled: kinds.length > 0,
  });
  const toggle = (kind: TimelineKind) =>
    setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Show</legend>
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
          Period
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as (typeof RANGES)[number])}
            className="rounded-md border border-line bg-surface px-2 py-1"
          >
            {RANGES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {kinds.length === 0 && <p className="text-ink-muted">Choose at least one kind of event to show.</p>}
      {kinds.length > 0 && query.isPending && (
        <div role="status" aria-busy="true" aria-label="Loading the timeline" className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}
      {query.isError && <LoadError message="Could not load the timeline." onRetry={() => void query.refetch()} />}
      {query.isSuccess && kinds.length > 0 && query.data.length === 0 && (
        <p className="text-ink-muted">Nothing in the last {days} days for these filters.</p>
      )}
      {query.isSuccess && kinds.length > 0 && query.data.length > 0 && (
        <ol className="flex flex-col gap-4" aria-label="Timeline">
          {byDay(query.data).map((day) => (
            <li key={day.key}>
              <h3 className="mb-1.5 font-semibold">{day.heading}</h3>
              <ol className="flex flex-col border-l border-line pl-3">
                {day.events.map((e, i) => {
                  const Icon = ICON[e.kind];
                  const tone = TONE[e.tone];
                  return (
                    <li key={`${e.at}-${i}`} className="relative flex gap-3 py-1.5">
                      <time dateTime={e.at} className="w-16 shrink-0 tabular-nums text-ink-muted">
                        {timeText(e.at)}
                      </time>
                      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${e.tone === "neutral" ? "text-ink-muted" : tone.className}`} />
                      <span className="min-w-0">
                        <span className={e.tone === "attention" ? "font-medium text-ink" : "text-ink"}>{e.title}</span>
                        {e.detail && <span className="block text-ink-muted">{e.detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
