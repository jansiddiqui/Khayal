import { Grid3x3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { copy } from "../../copy";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { useFeedback } from "../../ui/feedback";
import { HintButton } from "../HintButton";
import { QuestionRow } from "../QuestionRow";
import { DemoTile, HandDemo } from "../tutorial/HandDemo";
import type { GameDefinition, RoundProps, RoundResult } from "../types";
import { buildSpan, spanConfig, SQUARES } from "./logic";

/** A short settle before playback, so the patient is looking. */
export const SPAN_DELAY_MS = 800;
/** After the calm replay of a missed order, a moment before moving on. */
export const SPAN_REPLAY_PAUSE_MS = 1200;

const t = copy.games.spatialSpan;
type Mode = "watch" | "yourTurn" | "replay";

/**
 * One round = one order of squares. Right when the whole order is repeated. Reaction time = from
 * the end of the latest playback to the last tap. "Show me again" replays it once (a hint). After a
 * wrong tap the right order is replayed gently before the round ends, as in Follow the Colours.
 */
export function SpatialSpanRound({ level, practice = false, onComplete, rng = Math.random }: RoundProps) {
  const { length, litMs, gapMs } = spanConfig(level, practice);
  const order = useMemo(() => buildSpan(length, rng), [length, rng]);
  const [plays, setPlays] = useState(1);
  const [mode, setMode] = useState<Mode>("watch");
  const [lit, setLit] = useState<number | null>(null);
  const [tapped, setTapped] = useState<{ square: number; n: number } | null>(null);
  const [taps, setTaps] = useState(0);
  const { cue } = useFeedback();
  const position = useRef(0);
  const playbackEnd = useRef(0);
  const missed = useRef<RoundResult | null>(null);
  const reported = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const playing = mode !== "yourTurn";
  useEffect(() => {
    if (!playing) return;
    position.current = 0;
    setTaps(0);
    setTapped(null);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = SPAN_DELAY_MS;
    for (const square of order) {
      timers.push(setTimeout(() => setLit(square), at));
      at += litMs;
      timers.push(setTimeout(() => setLit(null), at));
      at += gapMs;
    }
    timers.push(
      setTimeout(
        () => {
          if (mode === "watch") {
            playbackEnd.current = Date.now();
            setMode("yourTurn");
          } else if (!reported.current && missed.current) {
            reported.current = true;
            onCompleteRef.current(missed.current);
          }
        },
        mode === "watch" ? at : at + SPAN_REPLAY_PAUSE_MS,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [playing, mode, order, litMs, gapMs, plays]);

  function tap(square: number) {
    if (mode !== "yourTurn" || reported.current) return;
    setTapped((prev) => ({ square, n: (prev?.n ?? 0) + 1 }));
    cue("tap");
    const result = (correct: boolean): RoundResult => ({
      correct,
      reaction_ms: Date.now() - playbackEnd.current,
      hint_used: plays > 1,
    });
    if (square !== order[position.current]) {
      missed.current = result(false);
      setMode("replay");
      return;
    }
    position.current += 1;
    setTaps(position.current);
    if (position.current === order.length) {
      reported.current = true;
      onComplete(result(true));
    }
  }

  const prompt = mode === "yourTurn" ? t.yourTurn : mode === "replay" ? copy.games.sequenceRecall.replay : t.watch;
  useSpeakOnChange(prompt);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={prompt}>
        <p className="text-2xl" aria-live="polite">
          {prompt}
        </p>
        {mode === "yourTurn" && (
          <p className="mt-1 text-xl font-semibold text-brand-dark" aria-live="polite">
            {copy.games.sequenceRecall.tapsOf(taps, order.length)}
          </p>
        )}
      </QuestionRow>
      <div className="mx-auto grid w-full max-w-[22rem] grid-cols-3 gap-3">
        {Array.from({ length: SQUARES }, (_, square) => {
          const isLit = lit === square;
          return (
            <button
              key={square}
              type="button"
              onClick={() => tap(square)}
              disabled={mode !== "yourTurn"}
              data-lit={isLit}
              aria-label={t.square(square + 1)}
              className={`relative aspect-square min-h-[64px] touch-manipulation overflow-hidden rounded-2xl border-8 transition-transform duration-150 ease-calm active:scale-[0.96] motion-reduce:active:scale-100 ${
                isLit ? "scale-105 border-accent-strong bg-accent shadow-lg" : "border-transparent bg-brand"
              }`}
            >
              {tapped?.square === square && <span key={tapped.n} aria-hidden="true" className="tile-flash pointer-events-none absolute inset-0" />}
              {isLit && <span aria-hidden="true" className="absolute inset-0 m-auto size-6 rounded-full bg-ink" />}
            </button>
          );
        })}
      </div>
      <HintButton used={plays > 1} available={mode === "yourTurn"} onUse={() => {
        setPlays((n) => n + 1);
        setMode("watch");
      }} />
    </div>
  );
}

function SpatialSpanDemo() {
  return (
    <HandDemo label={t.tutorial.join(" ")} taps={[{ x: 17, y: 17 }, { x: 83, y: 50 }]}>
      <div className="grid grid-cols-3 gap-2 p-2">
        {Array.from({ length: 9 }, (_, i) => (
          <DemoTile key={i} className={`aspect-square ${i === 0 ? "border-accent-strong bg-accent" : "border-transparent bg-brand"}`} />
        ))}
      </div>
    </HandDemo>
  );
}

export const spatialSpan: GameDefinition = {
  type: "spatial_span",
  title: t.title,
  intro: t.intro,
  icon: Grid3x3,
  Round: SpatialSpanRound,
  tutorial: { steps: t.tutorial, Demo: SpatialSpanDemo },
};
