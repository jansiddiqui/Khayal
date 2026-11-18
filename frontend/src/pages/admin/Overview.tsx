import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { admin, serverDate, type PilotOverview, type SystemHealth } from "../../api/client";
import { LoadError } from "../../components/caregiver/LoadError";
import { Skeleton } from "../../ui/Skeleton";

export const card = "flex flex-col gap-3 rounded-lg border border-line bg-surface p-4";
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const when = (iso: string | null, never = "Never") =>
  iso === null ? never : serverDate(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function megabytes(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");

function Tile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-ink-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

function SessionsChart({ data }: { data: PilotOverview["sessions_per_day"] }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <figure aria-label="Sessions per day, last 30 days" className="flex flex-col gap-2">
      <figcaption className="font-medium">
        Games per day, last 30 days <span className="font-normal text-ink-muted">· {total} in all</span>
      </figcaption>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.map((d) => ({ ...d, label: shortDay(d.date) }))} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="label" tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={false} interval={6} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "var(--color-brand-soft)" }} formatter={(v) => [String(v), "Games"]} labelFormatter={(l) => String(l)} />
            <Bar dataKey="count" fill="var(--color-brand)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const FUNNEL: { key: keyof PilotOverview["funnel"]; label: string }[] = [
  { key: "requested", label: "Requested an invite" },
  { key: "approved", label: "Request approved" },
  { key: "invited", label: "Invite links made (with direct invites)" },
  { key: "signed_up", label: "Signed up" },
  { key: "paired", label: "Elder's device paired" },
  { key: "active", label: "Active in the last 30 days" },
];

function Funnel({ funnel }: { funnel: PilotOverview["funnel"] }) {
  const top = Math.max(1, ...Object.values(funnel));
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Invite funnel</h3>
      <ol className="flex flex-col gap-1.5">
        {FUNNEL.map(({ key, label }) => (
          <li key={key} className="grid grid-cols-[1fr_2.5rem] items-center gap-x-2 gap-y-1 sm:grid-cols-[minmax(9rem,14rem)_1fr_2.5rem]">
            <span className="text-ink-soft">{label}</span>
            <span className="order-last col-span-2 h-3 rounded-sm bg-sunken sm:order-none sm:col-span-1" aria-hidden="true">
              <span className="block h-3 rounded-sm bg-brand" style={{ width: `${(100 * funnel[key]) / top}%` }} />
            </span>
            <span className="text-right font-medium tabular-nums">{funnel[key]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PilotOverviewCard() {
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: admin.overview });
  return (
    <section className={card} aria-labelledby="overview-title">
      <h2 id="overview-title" className="text-lg font-semibold">
        Pilot overview
      </h2>
      <p className="text-ink-muted">Real families only (demo accounts left out). A family is one elder with their family; active = played or ticked a reminder.</p>
      {q.isPending && <Skeleton className="h-48 w-full" />}
      {q.isError && <LoadError message="Could not load the overview." onRetry={() => void q.refetch()} />}
      {q.isSuccess && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Families" value={q.data.families} />
            <Tile label="Active, 7 days" value={q.data.active_7} note={pct(q.data.active_7, q.data.families)} />
            <Tile label="Active, 30 days" value={q.data.active_30} note={pct(q.data.active_30, q.data.families)} />
            <Tile label="Family accounts" value={q.data.caregivers} />
          </div>
          <SessionsChart data={q.data.sessions_per_day} />
          <Funnel funnel={q.data.funnel} />
          <div className="grid gap-3 sm:grid-cols-2">
            {[q.data.retention_7, q.data.retention_30].map((r) => (
              <Tile
                key={r.days}
                label={`Still playing after ${r.days} days`}
                value={pct(r.retained, r.eligible)}
                note={`${r.retained} of ${r.eligible} elders who started at least ${r.days} days ago played again ${r.days}+ days after their first game`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Row({ ok, label, children }: { ok: boolean; label: string; children: ReactNode }) {
  const Icon: LucideIcon = ok ? CircleCheck : CircleAlert;
  return (
    <div className="flex flex-wrap items-start gap-x-2 py-1.5">
      <Icon aria-label={ok ? "OK" : "Needs a look"} role="img" className={`mt-0.5 size-4 shrink-0 ${ok ? "text-success" : "text-accent-strong"}`} />
      <dt className="flex-1 text-ink-muted sm:w-32 sm:flex-none">{label}</dt>
      <dd className="min-w-0 basis-full pl-6 break-words sm:flex-1 sm:basis-auto sm:pl-0">{children}</dd>
    </div>
  );
}

export function HealthCard() {
  const q = useQuery({ queryKey: ["admin", "health"], queryFn: admin.health, refetchInterval: 60_000 });
  return (
    <section className={card} aria-labelledby="health-title">
      <h2 id="health-title" className="text-lg font-semibold">
        System health
      </h2>
      {q.isPending && <Skeleton className="h-32 w-full" />}
      {q.isError && <LoadError message="Could not load the system health." onRetry={() => void q.refetch()} />}
      {q.isSuccess && <HealthRows h={q.data} />}
    </section>
  );
}

export function HealthRows({ h }: { h: SystemHealth }) {
  const share = h.db_bytes === null ? null : h.db_bytes / h.db_limit_bytes;
  return (
    <dl className="flex flex-col divide-y divide-line">
      <Row ok label="Server">
        Up for {duration(h.uptime_seconds)} (woke {when(h.started_at)})
      </Row>
      <Row ok={h.last_tick_at !== null} label="Last cron tick">
        {when(h.last_tick_at, "No external cron yet")}
        <span className="block text-sm text-ink-muted">Last housekeeping: {when(h.last_housekeeping_at)}</span>
      </Row>
      <Row ok={!h.db_warning} label={`Database (${h.database})`}>
        {h.db_bytes === null ? (
          "Size unknown"
        ) : (
          <>
            {megabytes(h.db_bytes)} of {megabytes(h.db_limit_bytes)} ({Math.round((share ?? 0) * 100)}%)
            <span className="mt-1 block h-2 w-48 rounded-sm bg-sunken" aria-hidden="true">
              <span className={`block h-2 rounded-sm ${h.db_warning ? "bg-accent-strong" : "bg-brand"}`} style={{ width: `${Math.min(100, (share ?? 0) * 100)}%` }} />
            </span>
          </>
        )}
      </Row>
      <Row ok={!h.backup_warning} label="Full backup">
        {h.days_since_backup === null
          ? "No backup downloaded yet. Download one on the Data tab."
          : `${h.days_since_backup === 0 ? "Today" : `${h.days_since_backup} ${h.days_since_backup === 1 ? "day" : "days"} ago`}${h.last_backup_by ? `, by ${h.last_backup_by}` : ""}`}
        {h.backup_warning && h.days_since_backup !== null && <span className="block text-sm text-accent-strong">More than 7 days: download a new backup.</span>}
      </Row>
    </dl>
  );
}
