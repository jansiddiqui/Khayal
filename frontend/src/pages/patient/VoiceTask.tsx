import { ArrowRight, House, Mic, RotateCcw, Square } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useEffect } from "react";
import { getTodaysGames, uploadRecording, VOICE_TASK } from "../../api/client";
import { BigButton } from "../../components/BigButton";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";
import { findGame } from "../../games";
import { QuestionRow } from "../../games/QuestionRow";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { KitchenScene } from "../../voice/KitchenScene";
import { useRecorder, type Recording } from "../../voice/useRecorder";

const v = copy.voiceTask;

/**
 * The weekly voice task (CLAUDE.md section 7): describe a busy picture out loud.
 * One big Start button, then Stop with a simple sound-level bar. No countdown; it stops by
 * itself after 3 minutes. Every ending is kind: "Thank you, that was lovely."
 */
export function VoiceTask() {
  const recorder = useRecorder();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (r: Recording) => uploadRecording(r.audio, r.durationMs),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["todaysGames"] }),
  });
  const { state } = recorder;
  const recording = state.kind === "finished" ? state.recording : null;

  // Save as soon as the recording ends (Stop or the 3-minute auto-stop).
  const { mutate } = save;
  useEffect(() => {
    if (recording) mutate(recording);
  }, [recording, mutate]);

  const today = useQuery({ queryKey: ["todaysGames"], queryFn: getTodaysGames, enabled: save.isSuccess });
  const nextGame = today.data?.games
    .filter((g) => !g.done_today)
    .map((g) => (g.game_type === VOICE_TASK ? undefined : findGame(g.game_type)))
    .find((g) => g !== undefined);

  const notOn = save.isError && isAxiosError(save.error) && save.error.response?.status === 403;
  const message = save.isSuccess
    ? v.thanks
    : notOn
      ? v.notOn
      : save.isError
        ? v.saveFailed
        : state.kind === "denied"
          ? v.micProblem
          : recording || save.isPending
            ? v.saving
            : v.instruction;
  useSpeakOnChange(message === v.instruction ? "" : message);

  const home = <BigButton to="/patient" label={copy.games.backHome} icon={<House />} size="compact" />;

  return (
    <Layout title={v.title} spokenIntro={v.instruction} compact>
      {/* The picture keeps its shape and shrinks on short screens, so the button never leaves the screen. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <KitchenScene className="aspect-[4/3] h-auto min-h-0 w-full shrink rounded-2xl border-4 border-ink bg-surface" />
        <div className="flex shrink-0 flex-col gap-3" role="status">
          <QuestionRow spoken={message}>
            <p className="text-2xl font-semibold leading-snug">{message}</p>
          </QuestionRow>
          {state.kind === "recording" && <SoundLevel level={recorder.level} />}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-3">
        {save.isSuccess ? (
          nextGame ? (
            <BigButton
              to={`/patient/games/${nextGame.type}`}
              label={copy.games.nextGame}
              note={nextGame.title}
              icon={<ArrowRight />}
              size="compact"
            />
          ) : (
            home
          )
        ) : notOn || state.kind === "denied" ? (
          home
        ) : save.isError && recording ? (
          <>
            <BigButton label={v.tryAgain} icon={<RotateCcw />} size="compact" onClick={() => save.mutate(recording)} />
            {home}
          </>
        ) : state.kind === "recording" ? (
          <BigButton label={v.stop} icon={<Square />} size="compact" onClick={recorder.stop} />
        ) : state.kind === "idle" || state.kind === "starting" ? (
          <BigButton label={v.start} icon={<Mic />} size="compact" onClick={() => void recorder.start()} />
        ) : null}
      </div>
    </Layout>
  );
}

/** A plain bar that moves with the voice, so the patient can see the microphone hears them. */
function SoundLevel({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-3">
      <Mic aria-hidden="true" className="size-7 shrink-0 text-brand-dark" />
      <span className="text-xl font-semibold whitespace-nowrap">{v.listening}</span>
      <div
        className="h-6 flex-1 overflow-hidden rounded-full border-2 border-ink bg-sunken"
        role="meter"
        aria-label={v.soundLevel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
      >
        <div className="h-full rounded-full bg-calm transition-[width] duration-100" style={{ width: `${Math.max(4, level * 100)}%` }} />
      </div>
    </div>
  );
}
