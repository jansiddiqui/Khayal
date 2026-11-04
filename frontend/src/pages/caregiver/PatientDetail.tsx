import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { listPatients, listSessions, type GameSession, type GameType } from "../../api/client";
import { CaregiverLayout } from "../../components/CaregiverLayout";

const GAME_NAMES: Record<GameType, string> = {
  memory_match: "Memory Match",
  sequence_recall: "Sequence Recall",
};

const START_LEVEL = 2;

function levelCell(s: GameSession) {
  const arrow = s.level_end > s.level_start ? "↑" : s.level_end < s.level_start ? "↓" : "→";
  return `${s.level_start} ${arrow} ${s.level_end}`;
}

export function PatientDetail() {
  const patientId = Number(useParams().patientId);
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const sessions = useQuery({ queryKey: ["sessions", patientId], queryFn: () => listSessions(patientId) });
  const patient = patients.data?.find((p) => p.id === patientId);

  // Sessions arrive newest first, so the first one per game holds the current level.
  const currentLevels = (Object.keys(GAME_NAMES) as GameType[]).map((type) => {
    const latest = sessions.data?.find((s) => s.game_type === type);
    return { type, level: latest?.level_end ?? START_LEVEL, played: latest !== undefined };
  });

  return (
    <CaregiverLayout title={patient?.name ?? "Patient"}>
      <Link to="/caregiver" className="mb-4 inline-block text-brand-dark underline">
        ← All patients
      </Link>

      {sessions.isPending && <p className="text-gray-600">Loading sessions…</p>}
      {sessions.isError && <p className="text-red-700">Could not load sessions for this patient.</p>}

      {sessions.isSuccess && (
        <div className="flex flex-col gap-6">
          <section className="grid gap-4 sm:grid-cols-2">
            {currentLevels.map(({ type, level, played }) => (
              <div key={type} className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-gray-600">{GAME_NAMES[type]}</p>
                <p className="text-2xl font-semibold">Level {level} / 10</p>
                {!played && <p className="text-gray-500">Not played yet (starting level)</p>}
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Session history</h2>
            {sessions.data.length === 0 ? (
              <p className="text-gray-600">No games played yet.</p>
            ) : (
              <table className="w-full text-left">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Game</th>
                    <th className="py-2 font-medium">Level</th>
                    <th className="py-2 font-medium">Correct</th>
                    <th className="py-2 font-medium">Avg reaction</th>
                    <th className="py-2 font-medium">Hints</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.data.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2">{new Date(s.started_at).toLocaleString()}</td>
                      <td className="py-2">{GAME_NAMES[s.game_type]}</td>
                      <td className="py-2">{levelCell(s)}</td>
                      <td className="py-2">
                        {s.rounds_correct} / {s.rounds_played}
                      </td>
                      <td className="py-2">{(s.avg_reaction_ms / 1000).toFixed(1)} s</td>
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
