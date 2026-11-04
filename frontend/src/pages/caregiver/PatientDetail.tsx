import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  acknowledgeAlert,
  listAlerts,
  listPatients,
  listSessions,
  updatePatient,
  type GameSession,
  type GameType,
} from "../../api/client";
import { CaregiverLayout } from "../../components/CaregiverLayout";

const GAME_NAMES: Record<GameType, string> = {
  memory_match: "Memory Match",
  sequence_recall: "Sequence Recall",
  word_recall: "Word Recall",
  daily_orientation: "Daily Orientation",
  reaction_tap: "Reaction Tap",
};

/** Daily Orientation has no difficulty levels. */
const LEVELLED_GAMES: GameType[] = ["memory_match", "sequence_recall", "word_recall", "reaction_tap"];

const START_LEVEL = 2;
const ROUNDS_PER_SESSION = 5;

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

function AlertsPanel({ patientId }: { patientId: number }) {
  const queryClient = useQueryClient();
  const alerts = useQuery({ queryKey: ["alerts", patientId], queryFn: () => listAlerts(patientId) });
  const ack = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["alerts", patientId] }),
  });
  const open = alerts.data?.filter((a) => !a.acknowledged) ?? [];
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
        {open.map((a) => (
          <li key={a.id} className={`flex flex-wrap items-center gap-3 rounded-md border-l-4 p-3 ${SEVERITY_STYLE[a.severity]}`}>
            <span className="font-semibold capitalize">{a.severity}</span>
            <span className="flex-1">{a.message}</span>
            <span className="text-gray-600">{new Date(a.created_at).toLocaleString()}</span>
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

export function PatientDetail() {
  const patientId = Number(useParams().patientId);
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const sessions = useQuery({ queryKey: ["sessions", patientId], queryFn: () => listSessions(patientId) });
  const patient = patients.data?.find((p) => p.id === patientId);

  // Sessions arrive newest first, so the first one per game holds the current level.
  const currentLevels = LEVELLED_GAMES.map((type) => {
    const latest = sessions.data?.find((s) => s.game_type === type);
    return { type, level: latest?.level_end ?? START_LEVEL, played: latest !== undefined };
  });

  return (
    <CaregiverLayout title={patient?.name ?? "Patient"}>
      <nav className="mb-4 flex gap-6">
        <Link to="/caregiver" className="text-brand-dark underline">
          ← All patients
        </Link>
        <Link to={`/caregiver/patients/${patientId}/reminders`} className="text-brand-dark underline">
          Reminders →
        </Link>
      </nav>

      <AlertsPanel patientId={patientId} />

      {patient && (
        <section className="mb-6 flex flex-col gap-6 rounded-lg border border-gray-200 bg-white p-4">
          <CityForm key={patient.city ?? ""} patientId={patient.id} city={patient.city} />
          <PinForm key={(patient.pinned_games ?? []).join()} patientId={patient.id} pinned={patient.pinned_games} />
        </section>
      )}

      {sessions.isPending && <p className="text-gray-600">Loading sessions…</p>}
      {sessions.isError && <p className="text-red-700">Could not load sessions for this patient.</p>}

      {sessions.isSuccess && (
        <div className="flex flex-col gap-6">
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
                  {sessions.data.map((s) => (
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
            )}
          </section>
        </div>
      )}
    </CaregiverLayout>
  );
}
