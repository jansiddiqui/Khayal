import { Play } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LoadError } from "./LoadError";
import { fetchAudioBlob, listRecordings, setElderConsent, type Patient, type SpeechSample } from "../../api/client";
import { serverDate } from "../../api/client";

const when = (iso: string) =>
  serverDate(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The weekly voice task for one patient: the consent toggle (off by default) and the list of
 * recordings with playback. There is no analysis yet, so no score is ever shown.
 */
export function VoiceRecordings({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const recordings = useQuery({ queryKey: ["speech", patient.id], queryFn: () => listRecordings(patient.id) });
  const [confirmOff, setConfirmOff] = useState(false);
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setElderConsent(patient.id, "voice", enabled),
    onSuccess: () => {
      setConfirmOff(false);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      void queryClient.invalidateQueries({ queryKey: ["speech", patient.id] });
      void queryClient.invalidateQueries({ queryKey: ["consents", patient.id] });
    },
  });
  const count = recordings.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-3 font-medium">
          <input
            type="checkbox"
            className="size-5 accent-brand"
            checked={patient.voice_task_enabled}
            disabled={toggle.isPending}
            onChange={(e) => (e.target.checked ? toggle.mutate(true) : setConfirmOff(true))}
          />
          Voice task enabled (separate consent)
        </label>
        {confirmOff && (
          <div role="alertdialog" aria-label="Turn off the voice task" className="flex flex-wrap items-center gap-3 rounded-md border border-danger bg-danger-soft p-3">
            <p className="min-w-0 flex-1">
              {count === 0
                ? `Turning this off withdraws the consent for ${patient.name}. There are no recordings to delete.`
                : `Turning this off withdraws the consent and deletes ${count === 1 ? "the 1 recording" : `all ${count} recordings`} for ${patient.name}. This cannot be undone.`}
            </p>
            <button type="button" onClick={() => toggle.mutate(false)} className="rounded-md bg-danger px-3 py-1 font-medium text-white">
              Turn off and delete
            </button>
            <button type="button" onClick={() => setConfirmOff(false)} className="rounded-md border border-line-strong px-3 py-1">
              Keep it on
            </button>
          </div>
        )}
        <p className="text-ink-muted">
          {patient.voice_task_enabled && patient.voice_consent_at
            ? `Turned on ${when(patient.voice_consent_at)}. Once a week, ${patient.name} is asked to describe a picture out loud; it replaces the third game that day.`
            : `Off. When turned on, ${patient.name} is asked once a week to describe a picture out loud, and the recording is kept here.`}
        </p>
        {toggle.isError && (
          <p role="alert" className="text-danger">
            Could not change the voice task setting.
          </p>
        )}
      </div>

      {recordings.isPending && <p className="text-ink-muted">Loading recordings…</p>}
      {recordings.isError && <LoadError message="Could not load the recordings." onRetry={() => void recordings.refetch()} />}
      {recordings.isSuccess &&
        (recordings.data.length === 0 ? (
          <p className="text-ink-muted">No recordings yet.</p>
        ) : (
          <ul className="flex flex-col" aria-label="Recordings">
            {recordings.data.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0"
              >
                <span className="flex flex-col">
                  <span className="whitespace-nowrap font-medium">{when(r.recorded_at)}</span>
                  <span className="text-ink-muted tabular-nums">Length {formatDuration(r.duration_ms)}</span>
                </span>
                <Playback recording={r} />
                <span className="text-ink-muted">Analysis coming soon</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** Private audio: fetched with the login token only when asked for, then played from memory. */
function Playback({ recording }: { recording: SpeechSample }) {
  const [wanted, setWanted] = useState(false);
  const blob = useQuery({
    queryKey: ["speechAudio", recording.audio_url],
    queryFn: () => fetchAudioBlob(recording.audio_url),
    enabled: wanted,
    staleTime: Infinity,
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob.data) return;
    const url = URL.createObjectURL(blob.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob.data]);

  if (objectUrl) {
    return <audio controls autoPlay src={objectUrl} className="h-10 w-full max-w-xs" aria-label={`Recording from ${when(recording.recorded_at)}`} />;
  }
  if (blob.isError) return <span className="text-danger">Could not load the recording.</span>;
  return (
    <button
      type="button"
      onClick={() => setWanted(true)}
      disabled={wanted}
      className="inline-flex items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 hover:bg-sunken disabled:text-ink-muted"
    >
      <Play aria-hidden="true" className="size-4" />
      {wanted ? "Loading…" : "Play"}
    </button>
  );
}
