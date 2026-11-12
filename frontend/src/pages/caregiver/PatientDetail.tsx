import { ArrowLeft, ArrowRight, ChartLine, ChevronRight, Info, OctagonAlert, Smartphone, TriangleAlert } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  acknowledgeAlert,
  getSignals,
  getTrend,
  listAlerts,
  listPatients,
  listSessions,
  updatePatient,
  type GameSession,
  type GameType,
  type Signals,
  type Trend,
} from "../../api/client";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { PairDevicePanel } from "../../components/caregiver/PairDevicePanel";
import { VoiceRecordings } from "../../components/caregiver/VoiceRecordings";
import { formatZ, StatusBadge } from "../../components/caregiver/Status";
import { GAME_NAMES, GameTrendChart, IndexChart, trendChartId } from "../../components/caregiver/TrendCharts";

/** About Today (Daily Orientation) has no difficulty levels. */
const LEVELLED_GAMES: GameType[] = ["memory_match", "sequence_recall", "word_recall", "reaction_tap"];

const START_LEVEL = 2;
const ROUNDS_PER_SESSION = 5;
const SESSION_ROWS = 20;

function levelCell(s: GameSession): string {
  if (!LEVELLED_GAMES.includes(s.game_type)) return "—";
  const arrow = s.level_end > s.level_start ? "↑" : s.level_end < s.level_start ? "↓" : "→";
  return `${s.level_start} ${arrow} ${s.level_end}`;
}

function statusCell(s: GameSession): string {
  return s.completed ? "Completed" : `Stopped early (${s.rounds_played}/${ROUNDS_PER_SESSION} rounds)`;
}

function CityForm({ patientId, city }: { patientId: number; city: string | null }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(city ?? "");
  const save = useMutation({
    mutationFn: () => updatePatient(patientId, { city: value.trim() || null }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["patients"] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="patient-city" className="text-ink-soft">
          Home city (used in Daily Orientation)
        </label>
        <input
          id="patient-city"
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Pune"
          className="rounded-md border border-line-strong px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={save.isPending}
        className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted"
      >
        {save.isPending ? "Saving…" : "Save city"}
      </button>
      {save.isSuccess && <span className="text-calm">Saved.</span>}
      {save.isError && (
        <span role="alert" className="text-danger">
          Could not save the city.
        </span>
      )}
      {!city && !save.isSuccess && (
        <p className="w-full text-ink-muted">No city set: Daily Orientation asks for the year instead.</p>
      )}
    </form>
  );
}

const SEVERITY_STYLE = {
  info: { box: "border-brand bg-brand-soft", icon: Info, iconClass: "text-brand" },
  warning: { box: "border-accent bg-accent-soft", icon: TriangleAlert, iconClass: "text-accent-strong" },
  critical: { box: "border-danger bg-danger-soft", icon: OctagonAlert, iconClass: "text-danger" },
} as const;

const ALERTS_SHOWN = 3;
/** How long a chart stays highlighted after an alert links to it. */
export const HIGHLIGHT_MS = 2000;

const alertTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const ALERT_TYPE_LABEL = {
  decline: "Decline",
  missed_reminders: "Missed reminders",
  speech_risk: "Speech",
} as const;

/** A decline alert explains each declining game in its own sentence ending "(z = …)."; show one per line. */
export function alertLines(message: string): string[] {
  return message.split(/(?<=\)\.)\s+/).filter(Boolean);
}

/** The game an alert line is about ("Word Recall average dropped …"), if any. */
export function gameOfLine(line: string): GameType | null {
  const hit = (Object.entries(GAME_NAMES) as [GameType, string][]).find(([, name]) => line.startsWith(`${name} `));
  return hit ? hit[0] : null;
}

function AlertsPanel({ patientId, onShowGame }: { patientId: number; onShowGame: (game: GameType) => void }) {
  const queryClient = useQueryClient();
  const alerts = useQuery({ queryKey: ["alerts", patientId], queryFn: () => listAlerts(patientId) });
  const ack = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["alerts", patientId] }),
  });
  const [showAll, setShowAll] = useState(false);
  const open = alerts.data?.filter((a) => !a.acknowledged) ?? [];
  const shown = showAll ? open : open.slice(0, ALERTS_SHOWN);
  const past = alerts.data?.filter((a) => a.acknowledged) ?? [];

  return (
    <section className="mb-6 rounded-lg border border-line bg-surface p-4" aria-labelledby="alerts-heading">
      <h2 id="alerts-heading" className="mb-3 text-lg font-semibold">
        Alerts{open.length > 0 ? ` (${open.length} new)` : ""}
      </h2>
      {alerts.isPending && <p className="text-ink-muted">Loading alerts…</p>}
      {alerts.isError && <p className="text-danger">Could not load alerts.</p>}
      {alerts.isSuccess && alerts.data.length === 0 && <p className="text-ink-muted">No alerts.</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((a) => {
          const look = SEVERITY_STYLE[a.severity];
          const lines = alertLines(a.message);
          return (
          <li key={a.id} className={`flex flex-wrap items-start gap-3 rounded-md border p-3 ${look.box}`}>
            <look.icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${look.iconClass}`} />
            <div className="min-w-0 flex-1">
              <p className="mb-1">
                <span className="font-semibold capitalize">{a.severity}</span>
                <span className="text-ink-muted"> · {ALERT_TYPE_LABEL[a.type]} · {alertTime(a.created_at)}</span>
              </p>
              <ul className={lines.length > 1 ? "flex list-disc flex-col gap-1 pl-5" : "flex flex-col gap-1"}>
                {lines.map((line) => {
                  const game = gameOfLine(line);
                  return (
                    <li key={line}>
                      {line}{" "}
                      {game && (
                        <button
                          type="button"
                          onClick={() => onShowGame(game)}
                          className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-brand-dark underline underline-offset-2"
                        >
                          <ChartLine aria-hidden="true" className="size-4" />
                          See {GAME_NAMES[game]} chart
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => ack.mutate(a.id)}
              disabled={ack.isPending}
              className="rounded-md border border-line-strong bg-surface px-3 py-1 hover:bg-sunken"
            >
              Acknowledge
            </button>
          </li>
          );
        })}
      </ul>
      {open.length > ALERTS_SHOWN && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-brand-dark underline">
          {showAll ? "Show newest only" : `Show ${open.length - ALERTS_SHOWN} more`}
        </button>
      )}
      {past.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-ink-soft">Acknowledged ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-ink-muted">
            {past.map((a) => (
              <li key={a.id}>
                {alertTime(a.created_at)} · {a.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Fix slots 2-3 of the patient's "Today's games", or leave them automatic (least recently played). */
function PinForm({ patientId, pinned }: { patientId: number; pinned: GameType[] | null }) {
  const queryClient = useQueryClient();
  const [first, setFirst] = useState<GameType>(pinned?.[0] ?? LEVELLED_GAMES[0]!);
  const [second, setSecond] = useState<GameType>(pinned?.[1] ?? LEVELLED_GAMES[1]!);
  const save = useMutation({
    mutationFn: (pins: GameType[] | null) => updatePatient(patientId, { pinned_games: pins }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["patients"] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate([first, second]);
  }

  const select = (id: string, label: string, value: GameType, onChange: (g: GameType) => void) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-ink-soft">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as GameType)}
        className="rounded-md border border-line-strong bg-surface px-3 py-2"
      >
        {LEVELLED_GAMES.map((g) => (
          <option key={g} value={g}>
            {GAME_NAMES[g]}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Pin games</h2>
      <p className="text-ink-muted">
        {pinned
          ? `Pinned: About Today, ${GAME_NAMES[pinned[0]!]}, ${GAME_NAMES[pinned[1]!]}.`
          : "Automatic: About Today plus the two games played least recently."}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {select("pin-slot-2", "Slot 2", first, setFirst)}
        {select("pin-slot-3", "Slot 3", second, setSecond)}
        <button
          type="submit"
          disabled={save.isPending || first === second}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted"
        >
          Pin these games
        </button>
        {pinned && (
          <button
            type="button"
            onClick={() => save.mutate(null)}
            disabled={save.isPending}
            className="rounded-md border border-line-strong px-4 py-2 hover:bg-sunken"
          >
            Unpin (automatic)
          </button>
        )}
      </div>
      {first === second && <p className="text-accent-strong">Choose two different games.</p>}
      {save.isError && (
        <p role="alert" className="text-danger">
          Could not save the pinned games.
        </p>
      )}
    </form>
  );
}

const percent = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Secondary signals: shown for context, no alerts yet. */
function SignalTiles({ signals }: { signals: Signals }) {
  const a = signals.adherence;
  const tiles = [
    {
      label: "Stopped early",
      value: percent(signals.stopped_early_rate),
      note: `of ${signals.sessions} sessions`,
    },
    { label: "Hints used", value: percent(signals.hint_rate), note: "of rounds played" },
    {
      label: "Reminder adherence",
      value: percent(a.rate),
      note: `marked by the patient (${a.done_by_patient} done, ${a.done_by_caregiver} by caregiver, ${a.missed} missed)`,
    },
  ];
  return (
    <section aria-labelledby="signals-heading" className="flex flex-col gap-3">
      <h2 id="signals-heading" className="text-sm font-medium text-ink-muted">
        Last {signals.days} days · for context, no alerts
      </h2>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-line bg-surface p-4" role="group" aria-label={t.label}>
          <p className="text-ink-muted">{t.label}</p>
          <p className="text-2xl font-semibold">{t.value}</p>
          <p className="text-sm text-ink-muted">{t.note}</p>
        </div>
      ))}
    </section>
  );
}

export function PatientDetail() {
  const patientId = Number(useParams().patientId);
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const sessions = useQuery({ queryKey: ["sessions", patientId], queryFn: () => listSessions(patientId) });
  const trend = useQuery({ queryKey: ["trend", patientId], queryFn: () => getTrend(patientId) });
  const signals = useQuery({ queryKey: ["signals", patientId], queryFn: () => getSignals(patientId) });
  const patient = patients.data?.find((p) => p.id === patientId);
  const [allRows, setAllRows] = useState(false);

  // An alert's "See … chart" scrolls to that game's chart and rings it for 2 seconds.
  const [highlighted, setHighlighted] = useState<GameType | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  function showGame(game: GameType) {
    const chart = document.getElementById(trendChartId(game));
    // Open the game's card (and the Games section) before scrolling to it.
    if (chart instanceof HTMLDetailsElement) chart.open = true;
    const section = chart?.closest("details.section");
    if (section instanceof HTMLDetailsElement) section.open = true;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    chart?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
    chart?.focus({ preventScroll: true });
    setHighlighted(game);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
  }

  function openSettings() {
    const settings = document.getElementById("settings");
    if (settings instanceof HTMLDetailsElement) settings.open = true;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    settings?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }

  // Sessions arrive newest first, so the first one per game holds the current level.
  const currentLevels = LEVELLED_GAMES.map((type) => {
    const latest = sessions.data?.find((s) => s.game_type === type);
    return { type, level: latest?.level_end ?? START_LEVEL, played: latest !== undefined };
  });
  const rows = allRows ? sessions.data ?? [] : (sessions.data ?? []).slice(0, SESSION_ROWS);

  return (
    <CaregiverLayout title={patient?.name ?? "Patient"}>
      <nav className="mb-4 flex gap-6">
        <Link to="/caregiver" className="inline-flex items-center gap-1 text-brand-dark underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          All patients
        </Link>
        <Link to={`/caregiver/patients/${patientId}/reminders`} className="inline-flex items-center gap-1 text-brand-dark underline">
          Reminders
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        <Link to={`/caregiver/patients/${patientId}/family`} className="inline-flex items-center gap-1 text-brand-dark underline">
          Family photos
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        <button type="button" onClick={openSettings} className="inline-flex items-center gap-1 text-brand-dark underline">
          <Smartphone aria-hidden="true" className="size-4" />
          Pair a device
        </button>
      </nav>

      <SummaryCard patientId={patientId} trend={trend.data} signals={signals.data} lastSession={sessions.data?.[0]} />

      {/* Alerts are always shown, never collapsed. */}
      <AlertsPanel patientId={patientId} onShowGame={showGame} />

      <Section title="Overall trend and signals" defaultOpen>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          {trend.isSuccess ? <IndexChart trend={trend.data} /> : <p className="text-ink-muted">Loading trends…</p>}
          {signals.isSuccess && <SignalTiles signals={signals.data} />}
        </div>
      </Section>
      {trend.isError && <p className="mb-4 text-danger">Could not load the trends.</p>}

      {trend.isSuccess && (
        <Section title="Games" hint="Games on Watch or Declining are open; tap a game to open or close it." defaultOpen>
          <p className="mb-3 text-sm text-ink-muted">
            Bold line: the average of the last 5 sessions, which is what alerts use. Dots: single sessions. Dashed line and
            shaded band: this patient's usual range (sessions 6–15, ±1.5 standard deviations).
          </p>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {trend.data.games.map((g) => (
              <GameTrendChart
                key={g.game_type}
                trend={g}
                overall={trend.data.cognitive_status}
                highlighted={highlighted === g.game_type}
              />
            ))}
          </div>
        </Section>
      )}

      {sessions.isPending && <p className="text-ink-muted">Loading sessions…</p>}
      {sessions.isError && <p className="text-danger">Could not load sessions for this patient.</p>}

      {sessions.isSuccess && (
        <Section title="Levels and session history" hint={`${sessions.data.length} sessions`}>
        <div className="flex flex-col gap-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {currentLevels.map(({ type, level, played }) => (
              <div key={type} className="rounded-lg border border-line bg-surface p-4">
                <p className="text-ink-muted">{GAME_NAMES[type]}</p>
                <p className="text-2xl font-semibold">Level {level} / 10</p>
                {!played && <p className="text-ink-muted">Not played yet (starting level)</p>}
              </div>
            ))}
          </section>

          <section className="overflow-x-auto rounded-lg border border-line bg-surface p-4">
            <h2 className="mb-3 text-lg font-semibold">Session history</h2>
            {sessions.data.length === 0 ? (
              <p className="text-ink-muted">No games played yet.</p>
            ) : (
              <>
                <table className="w-full text-left">
                  <thead className="border-b border-line text-ink-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Game</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Level</th>
                      <th className="py-2 pr-3 font-medium">Correct</th>
                      <th className="py-2 pr-3 font-medium">Avg reaction</th>
                      <th className="py-2 font-medium">Hints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{alertTime(s.started_at)}</td>
                        <td className="py-2 pr-3">{GAME_NAMES[s.game_type]}</td>
                        <td className={`py-2 pr-3 ${s.completed ? "" : "text-accent-strong"}`}>{statusCell(s)}</td>
                        <td className="py-2 pr-3">{levelCell(s)}</td>
                        <td className="py-2 pr-3">
                          {s.rounds_correct} / {s.rounds_played}
                        </td>
                        <td className="py-2 pr-3">
                          {s.avg_reaction_ms === null ? "—" : `${(s.avg_reaction_ms / 1000).toFixed(1)} s`}
                        </td>
                        <td className="py-2">{s.hints_used}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sessions.data.length > SESSION_ROWS && (
                  <button type="button" onClick={() => setAllRows(!allRows)} className="mt-3 text-brand-dark underline">
                    {allRows ? "Show latest only" : `Show all ${sessions.data.length} sessions`}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
        </Section>
      )}

      {patient && (
        <Section
          id="voice"
          title="Voice recordings"
          hint={patient.voice_task_enabled ? "Weekly picture description · on" : "Weekly picture description · off"}
        >
          <VoiceRecordings patient={patient} />
        </Section>
      )}

      {patient && (
        <Section id="settings" title="Settings" hint="Pair a device, home city, pinned games">
          <div className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-4" aria-label="Settings">
            <PairDevicePanel patientId={patient.id} patientName={patient.name} />
            <CityForm key={`city-${patient.city ?? ""}`} patientId={patient.id} city={patient.city} />
            <PinForm key={`pins-${(patient.pinned_games ?? []).join()}`} patientId={patient.id} pinned={patient.pinned_games} />
          </div>
        </Section>
      )}
    </CaregiverLayout>
  );
}

/** A collapsible page section: the heading always shows; the content opens and closes. */
function Section({
  id,
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} open={defaultOpen} className="section group mb-6 scroll-mt-20">
      <summary className="mb-3 flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 self-center text-ink-muted transition-transform group-open:rotate-90" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <span className="text-sm text-ink-muted">{hint}</span>}
      </summary>
      {children}
    </details>
  );
}

/** At a glance: overall status, the latest new alert, reminder adherence and when the patient last played. */
function SummaryCard({
  patientId,
  trend,
  signals,
  lastSession,
}: {
  patientId: number;
  trend: Trend | undefined;
  signals: Signals | undefined;
  lastSession: GameSession | undefined;
}) {
  const alerts = useQuery({ queryKey: ["alerts", patientId], queryFn: () => listAlerts(patientId) });
  const latest = alerts.data?.find((a) => !a.acknowledged);
  const rate = signals?.adherence.rate;
  return (
    <section aria-label="Summary" className="mb-6 grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="text-ink-muted">Overall</p>
        {trend ? (
          <p className="flex items-center gap-3 text-lg">
            <StatusBadge status={trend.cognitive_status} />
            {trend.cognitive_index !== null && <span className="text-ink-muted">index {formatZ(trend.cognitive_index)}</span>}
          </p>
        ) : (
          <p className="text-ink-muted">Loading…</p>
        )}
      </div>
      <div>
        <p className="text-ink-muted">Latest alert</p>
        {latest ? (
          <p className="line-clamp-2">
            <span className="font-medium capitalize">{latest.severity}</span>
            <span className="text-ink-muted"> · {alertTime(latest.created_at)}</span>
            <br />
            {alertLines(latest.message)[0]}
          </p>
        ) : (
          <p>{alerts.isSuccess ? "No new alerts" : "Loading…"}</p>
        )}
      </div>
      <div>
        <p className="text-ink-muted">Reminders done by the patient</p>
        <p className="text-lg font-semibold">{rate === undefined ? "Loading…" : rate === null ? "—" : `${Math.round(rate * 100)}%`}</p>
        {signals && <p className="text-ink-muted">last {signals.adherence.days} days</p>}
      </div>
      <div>
        <p className="text-ink-muted">Last played</p>
        {lastSession ? (
          <p>
            <span className="font-medium">{GAME_NAMES[lastSession.game_type]}</span>
            <br />
            <span className="text-ink-muted">{alertTime(lastSession.started_at)}</span>
          </p>
        ) : (
          <p className="text-ink-muted">Not played yet</p>
        )}
      </div>
    </section>
  );
}
