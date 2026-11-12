import { useEffect, useMemo, useRef, useState } from "react";
import { copy } from "../../copy";
import { HintButton } from "../HintButton";
import type { GameDefinition, RoundProps, RoundResult } from "../types";
import { buildSequence, sequenceConfig, TILES, type TileId } from "./logic";

/** Short settle time before playback starts, so the patient is looking. */
export const PLAYBACK_DELAY_MS = 800;
/** After the calm replay of a missed sequence, a moment before moving on. */
export const REPLAY_END_PAUSE_MS = 1200;

type Mode = "watch" | "yourTurn" | "replay";

/**
 * One round = one sequence. Correct when the whole sequence is repeated in order.
 * Reaction time = from the end of the latest playback to the last tap.
 * Hint ("Show me again"): the sequence plays once more and the patient starts over.
 * After a wrong tap the right order is replayed gently ("Here's how it went") before
 * the round ends, so the patient sees the answer instead of a sudden stop.
 */
export function SequenceRecallRound({ level, onComplete, rng = Math.random }: RoundProps) {
  const { length, litMs, gapMs } = sequenceConfig(level);
  const sequence = useMemo(() => buildSequence(length, rng), [length, rng]);

  const [plays, setPlays] = useState(1);
  const [mode, setMode] = useState<Mode>("watch");
  const [lit, setLit] = useState<TileId | null>(null);
  const position = useRef(0);
  const playbackEnd = useRef(0);
  const missed = useRef<RoundResult | null>(null);
  const reported = useRef(false);
  // The parent passes a new callback on each render; playback must not restart because of it.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Play the sequence: on first view, for the hint, and as the replay after a miss.
  const playing = mode !== "yourTurn";
  useEffect(() => {
    if (!playing) return;
    position.current = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = PLAYBACK_DELAY_MS;
    for (const tile of sequence) {
      timers.push(setTimeout(() => setLit(tile), t));
      t += litMs;
      timers.push(setTimeout(() => setLit(null), t));
      t += gapMs;
    }
    if (mode === "watch") {
      timers.push(
        setTimeout(() => {
          playbackEnd.current = Date.now();
          setMode("yourTurn");
        }, t),
      );
    } else {
      timers.push(
        setTimeout(() => {
          if (reported.current || !missed.current) return;
          reported.current = true;
          onCompleteRef.current(missed.current);
        }, t + REPLAY_END_PAUSE_MS),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [playing, mode, sequence, litMs, gapMs, plays]);

  function tap(tile: TileId) {
    if (mode !== "yourTurn" || reported.current) return;
    const result = (correct: boolean): RoundResult => ({
      correct,
      reaction_ms: Date.now() - playbackEnd.current,
      hint_used: plays > 1,
    });
    if (tile !== sequence[position.current]) {
      missed.current = result(false);
      setMode("replay");
      return;
    }
    position.current += 1;
    if (position.current === sequence.length) {
      reported.current = true;
      onComplete(result(true));
    }
  }

  function showAgain() {
    setPlays((n) => n + 1);
    setMode("watch");
  }

  const prompt =
    mode === "yourTurn"
      ? copy.games.sequenceRecall.yourTurn
      : mode === "replay"
        ? copy.games.sequenceRecall.replay
        : copy.games.sequenceRecall.watch;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-2xl" aria-live="polite">
        {prompt}
      </p>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3" style={{ maxHeight: "22rem" }}>
        {TILES.map((tile) => {
          const isLit = lit === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => tap(tile.id)}
              disabled={mode !== "yourTurn"}
              data-lit={isLit}
              className={
                "min-h-[64px] rounded-2xl border-8 text-2xl font-bold transition-transform duration-150 " +
                (isLit ? `${tile.lit} scale-105 shadow-lg` : `${tile.idle} border-transparent`)
              }
            >
              {isLit && <span aria-hidden="true">● </span>}
              {copy.tiles[tile.id]}
            </button>
          );
        })}
      </div>
      <HintButton used={plays > 1} available={mode === "yourTurn"} onUse={showAgain} />
    </div>
  );
}

export const sequenceRecall: GameDefinition = {
  type: "sequence_recall",
  title: copy.games.sequenceRecall.title,
  intro: copy.games.sequenceRecall.intro,
  icon: "🟦",
  Round: SequenceRecallRound,
};
