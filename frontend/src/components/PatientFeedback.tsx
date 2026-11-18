import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleHelp, Mic, Send, Smile, Square } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router";
import { sendFeedback, sendFeedbackVoice, type FeedbackKind } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { copy } from "../copy";
import { useRecorder } from "../voice/useRecorder";
import { BigButton } from "./BigButton";

/** Voice notes stop by themselves after one minute (no countdown shown). */
const NOTE_MS = 60_000;

/**
 * "Tell us something", inside the Settings sheet (Round 2 batch 3). Step 1: two big choices.
 * Step 2: a few words, a voice note when the voice opt-in is on, and Send. At most 3 controls
 * per step (CLAUDE.md section 4); Back is the sheet's own way out.
 */
export function PatientFeedback({ onDone }: { onDone: () => void }) {
  const f = copy.feedback;
  const { state } = useAuth();
  const voiceAllowed = state.status === "authenticated" && state.user.voice_task_enabled;
  const { pathname } = useLocation();
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [words, setWords] = useState("");
  const recorder = useRecorder(NOTE_MS);
  const recording = recorder.state.kind === "finished" ? recorder.state.recording : null;

  const send = useMutation({
    mutationFn: async () => {
      const id = await sendFeedback(kind ?? "liked", words.trim() || undefined, pathname);
      if (recording) await sendFeedbackVoice(id, recording.audio);
    },
  });

  if (send.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-3xl font-bold">
          {f.thanks}
        </p>
        <BigButton label={copy.settings.done} icon={<Check />} onClick={onDone} />
      </div>
    );
  }

  if (kind === null) {
    return (
      <div className="flex flex-col gap-4">
        <h2 id="settings-title" className="text-3xl font-bold">
          {f.title}
        </h2>
        <p className="text-2xl">{f.question}</p>
        <BigButton label={f.hard} icon={<CircleHelp />} variant="secondary" onClick={() => setKind("hard")} />
        <BigButton label={f.liked} icon={<Smile />} variant="secondary" onClick={() => setKind("liked")} />
        <BigButton label={f.back} icon={<ArrowLeft />} variant="secondary" onClick={onDone} />
      </div>
    );
  }

  const busy = recorder.state.kind === "recording" || recorder.state.kind === "starting";
  return (
    <div className="flex flex-col gap-4">
      <h2 id="settings-title" className="text-3xl font-bold">
        {kind === "hard" ? f.hard : f.liked}
      </h2>
      <label className="flex flex-col gap-2 text-2xl">
        {f.words}
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          rows={2}
          maxLength={2000}
          className="rounded-2xl border-4 border-line-strong bg-surface p-3 text-2xl"
        />
      </label>
      {voiceAllowed &&
        (recording ? (
          <p className="flex items-center gap-2 text-xl text-ink-soft">
            <Check aria-hidden="true" className="size-6 text-success" />
            {f.recorded}
          </p>
        ) : busy ? (
          <BigButton label={f.stop} icon={<Square />} variant="secondary" onClick={recorder.stop} />
        ) : (
          <BigButton label={f.record} icon={<Mic />} variant="secondary" onClick={() => void recorder.start()} />
        ))}
      {send.isError && (
        <p role="alert" className="text-xl">
          {f.retry}
        </p>
      )}
      {!busy && (
        <BigButton label={send.isPending ? f.sending : f.send} icon={<Send />} busy={send.isPending} onClick={() => !send.isPending && send.mutate()} />
      )}
    </div>
  );
}
