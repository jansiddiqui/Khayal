import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
} from "../../api/client";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { GAME_NAMES, GameTrendChart, IndexChart } from "../../components/caregiver/TrendCharts";

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
        <label htmlFor="patient-city" className="text-gray-700">
          Home city (used in Daily Orientation)
        </label>
        <input
          id="patient-city"
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Pune"
          className="rounded-md border border-gray-400 px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={save.isPending}
        className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {save.isPending ? "Saving…" : "Save city"}
      </button>
      {save.isSuccess && <span className="text-calm">Saved.</span>}
      {save.isError && (
        <span role="alert" className="text-red-700">
          Could not save the city.
        </span>
      )}
      {!city && !save.isSuccess && (
        <p className="w-full text-gray-600">No city set: Daily Orientation asks for the year instead.</p>
      )}
    </form>
  );
}

const SEVERITY_STYLE = {
  info: "border-blue-300 bg-blue-50",
  warning: "border-amber-400 bg-amber-50",
  critical: "border-red-500 bg-red-50",
} as const;

const ALERTS_SHOWN = 3;

const ALERT_TYPE_LABEL = {
  decline: "Decline",
  missed_reminders: "Missed reminders",
  speech_risk: "Speech",
} as const;

/** A decline alert explains each declining game in its own sentence ending "(z = …)."; show one per line. */
export function alertLines(message: string): string[] {
  return message.split(/(?<=\)\.)\s+/).filter(Boolean);
}

function AlertsPanel({ patientId }: { patientId: number }) {
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
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="alerts-heading">
      <h2 id="alerts-heading" className="mb-3 text-lg font-semibold">
        Alerts{open.length > 0 ? ` (${open.length} new)` : ""}
      </h2>
      {alerts.isPending && <p className="text-gray-600">Loading alerts…</p>}
      {alerts.isError && <p className="text-red-700">Could not load alerts.</p>}
      {alerts.isSuccess && alerts.data.length === 0 && <p className="text-gray-600">No alerts.</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((a) => (
          <li key={a.id} className={`flex flex-wrap items-start gap-3 rounded-md border-l-4 p-3 ${SEVERITY_STYLE[a.severity]}`}>
            <div className="min-w-0 flex-1">
              <p className="mb-1">
                <span className="font-semibold capitalize">{a.severity}</span>
                <span className="text-gray-600"> · {ALERT_TYPE_LABEL[a.type]} · {new Date(a.created_at).toLocaleString()}</span>
              </p>
              <ul className="list-disc pl-5">
                {alertLines(a.message).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => ack.mutate(a.id)}
              disabled={ack.isPending}
              className="rounded-md border border-gray-400 bg-white px-3 py-1 hover:bg-gray-100"
            >
              Acknowledge
            </button>
          </li>
        ))}
      </ul>
      {open.length > ALERTS_SHOWN && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-brand-dark underline">
          {showAll ? "Show newest only" : `Show ${open.length - ALERTS_SHOWN} more`}
        </button>
      )}
      {past.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-gray-700">Acknowledged ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-gray-600">
            {past.map((a) => (
              <li key={a.id}>
                {new Date(a.created_at).toLocaleString()} · {a.message}
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
      <label htmlFor={id} className="text-gray-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as GameType)}
        className="rounded-md border border-gray-400 bg-white px-3 py-2"
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
      <p className="text-gray-600">
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
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          Pin these games
        </button>
        {pinned && (
          <button
            type="button"
            onClick={() => save.mutate(null)}
            disabled={save.isPending}
            className="rounded-md border border-gray-400 px-4 py-2 hover:bg-gray-100"
          >
            Unpin (automatic)
          </button>
        )}
      </div>
      {first === second && <p className="text-amber-800">Choose two different games.</p>}
      {save.isError && (
        <p role="alert" className="text-red-700">
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
      <h2 id="signals-heading" className="text-sm font-medium text-gray-600">
        Last {signals.days} days · for context, no alerts
      </h2>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-gray-200 bg-white p-4" role="group" aria-label={t.label}>
          <p className="text-gray-600">{t.label}</p>
          <p className="text-2xl font-semibold">{t.value}</p>
          <p className="text-sm text-gray-500">{t.note}</p>
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

  // Sessions arrive newest first, so the first one per game holds the current level.
  const currentLevels = LEVELLED_GAMES.map((type) => {
    const latest = sessions.data?.find((s) => s.game_type === type);
    return { type, level: latest?.level_end ?? START_LEVEL, played: latest !== undefined };
  });
  const rows = allRows ? sessions.data ?? [] : (sessions.data ?? []).slice(0, SESSION_ROWS);

  return (
    <CaregiverLayout title={patient?.name ?? "Patient"}>
      <nav className="mb-4 flex gap-6">
        <Link to="/caregiver" className="text-brand-dark underline">
          ← All patients
        </Link>
        <Link to={`/caregiver/patients/${patientId}/reminders`} className="text-brand-dark underline">
          Reminders →
        </Link>
        <Link to={`/caregiver/patients/${patientId}/family`} className="text-brand-dark underline">
          Family photos →
        </Link>
      </nav>

      <AlertsPanel patientId={patientId} />

      <section className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        {trend.isSuccess ? <IndexChart trend={trend.data} /> : <p className="text-gray-600">Loading trends…</p>}
        {signals.isSuccess && <SignalTiles signals={signals.data} />}
      </section>
      {trend.isError && <p className="mb-4 text-red-700">Could not load the trends.</p>}

      {trend.isSuccess && (
        <section aria-labelledby="games-heading" className="mb-6">
          <h2 id="games-heading" className="mb-1 text-lg font-semibold">
            Games
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            Composite score per completed session. Dashed line: baseline (first 10 sessions); shaded band: ±1.5 standard
            deviations.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {trend.data.games.map((g) => (
              <GameTrendChart key={g.game_type} trend={g} />
            ))}
          </div>
        </section>
      )}

      {sessions.isPending && <p className="text-gray-600">Loading sessions…</p>}
      {sessions.isError && <p className="text-red-700">Could not load sessions for this patient.</p>}

      {sessions.isSuccess && (
        <div className="mb-6 flex flex-col gap-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {currentLevels.map(({ type, level, played }) => (
              <div key={type} className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-gray-600">{GAME_NAMES[type]}</p>
                <p className="text-2xl font-semibold">Level {level} / 10</p>
                {!played && <p className="text-gray-500">Not played yet (starting level)</p>}
              </div>
            ))}
          </section>

          <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Session history</h2>
            {sessions.data.length === 0 ? (
              <p className="text-gray-600">No games played yet.</p>
            ) : (
              <>
                <table className="w-full text-left">
                  <thead className="border-b border-gray-200 text-gray-600">
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
                      <tr key={s.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-3">{new Date(s.started_at).toLocaleString()}</td>
                        <td className="py-2 pr-3">{GAME_NAMES[s.game_type]}</td>
                        <td className={`py-2 pr-3 ${s.completed ? "" : "text-amber-800"}`}>{statusCell(s)}</td>
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
      )}

      {patient && (
        <section className="flex flex-col gap-6 rounded-lg border border-gray-200 bg-white p-4" aria-label="Settings">
          <CityForm key={patient.city ?? ""} patientId={patient.id} city={patient.city} />
          <PinForm key={(patient.pinned_games ?? []).join()} patientId={patient.id} pinned={patient.pinned_games} />
        </section>
      )}
    </CaregiverLayout>
  );
}
