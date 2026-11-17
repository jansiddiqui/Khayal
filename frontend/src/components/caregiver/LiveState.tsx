import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../ui/Button";

/** "just now", "3 min ago", "2 hours ago" for a past moment. */
export function ago(ms: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h === 1 ? "1 hour ago" : `${h} hours ago`;
}

/** Re-render every half minute, so relative times stay true. */
function useTick(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * "Updated 3 min ago · Refresh": when what you see was fetched, and a way to fetch it again. While
 * fetching, the button shows a spinner instead of a second request.
 */
export function LastUpdated({ updatedAt, fetching, onRefresh }: { updatedAt: number; fetching: boolean; onRefresh: () => void }) {
  const now = useTick();
  if (!updatedAt) return null;
  return (
    <span className="inline-flex items-center gap-2 text-ink-muted">
      <span aria-live="polite">{fetching ? "Updating…" : `Updated ${ago(updatedAt, now)}`}</span>
      <Button size="sm" variant="quiet" icon={<RotateCw />} loading={fetching} onClick={onRefresh}>
        Refresh
      </Button>
    </span>
  );
}

/**
 * Whether the elder used Khayal today: a green dot and "Active today, 9:40 AM", or when they were last
 * active. Words always, colour only beside them.
 */
export function ActiveState({ lastActiveAt }: { lastActiveAt: string | null | undefined }) {
  const now = useTick(60_000);
  if (!lastActiveAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-ink-muted">
        <span aria-hidden="true" className="size-2 rounded-full border border-line-strong" />
        Not used yet
      </span>
    );
  }
  const when = new Date(lastActiveAt);
  const today = new Date(now);
  const sameDay = when.toDateString() === today.toDateString();
  const yesterday = new Date(now - 86_400_000).toDateString() === when.toDateString();
  const days = Math.max(1, Math.round((today.setHours(0, 0, 0, 0) - new Date(when).setHours(0, 0, 0, 0)) / 86_400_000));
  const time = when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`size-2 rounded-full ${sameDay ? "bg-success" : "bg-line-strong"}`} />
      <span className={sameDay ? "text-ink" : "text-ink-soft"}>
        {sameDay ? `Active today, ${time}` : yesterday ? "Last active yesterday" : `Last active ${days} days ago`}
      </span>
    </span>
  );
}
