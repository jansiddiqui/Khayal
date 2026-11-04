import { useEffect, useMemo, useRef, useState } from "react";
import { copy } from "../../copy";
import { HintButton } from "../HintButton";
import type { GameDefinition, RoundProps } from "../types";
import { buildSequence, sequenceConfig, TILES, type TileId } from "./logic";

/** Short settle time before playback starts, so the patient is looking. */
export const PLAYBACK_DELAY_MS = 800;

/**
 * One round = one sequence. Correct when the whole sequence is repeated in order.
 * Reaction time = from the end of the latest playback to the last tap.
 * Hint ("Show me again"): the sequence plays once more and the patient starts over.
 */
export function SequenceRecallRound({ level, onComplete, rng = Math.random }: RoundProps) {
  const { length, litMs, gapMs } = sequenceConfig(level);
  const sequence = useMemo(() => buildSequence(length, rng), [length, rng]);

  const [plays, setPlays] = useState(1);
  const [lit, setLit] = useState<TileId | null>(null);
  const [yourTurn, setYourTurn] = useState(false);
  const position = useRef(0);
  const playbackEnd = useRef(0);
  const reported = useRef(false);

  useEffect(() => {
    setYourTurn(false);
    position.current = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = PLAYBACK_DELAY_MS;
    for (const tile of sequence) {
      timers.push(setTimeout(() => setLit(tile), t));
      t += litMs;
      timers.push(setTimeout(() => setLit(null), t));
      t += gapMs;
    }
    timers.push(
      setTimeout(() => {
        playbackEnd.current = Date.now();
        setYourTurn(true);
      }, t),
    );
    return () => timers.forEach(clearTimeout);
  }, [sequence, litMs, gapMs, plays]);

  function tap(tile: TileId) {
    if (!yourTurn || reported.current) return;
    const finish = (correct: boolean) => {
      reported.current = true;
      onComplete({ correct, reaction_ms: Date.now() - playbackEnd.current, hint_used: plays > 1 });
    };
    if (tile !== sequence[position.current]) {
      finish(false);
      return;
    }
    position.current += 1;
    if (position.current === sequence.length) finish(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-2xl" aria-live="polite">
        {yourTurn ? copy.games.sequenceRecall.yourTurn : copy.games.sequenceRecall.watch}
      </p>
      <div className="grid grid-cols-2 gap-4">
        {TILES.map((tile) => {
          const isLit = lit === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => tap(tile.id)}
              disabled={!yourTurn}
              data-lit={isLit}
              className={
                "min-h-32 rounded-2xl border-8 text-2xl font-bold transition-all duration-150 " +
                (isLit ? `${tile.lit} scale-105 border-ink` : `${tile.idle} border-transparent`) +
                (!yourTurn && !isLit ? " opacity-70" : "")
              }
            >
              {copy.tiles[tile.id]}
            </button>
          );
        })}
      </div>
      <HintButton used={plays > 1} available={yourTurn} onUse={() => setPlays((n) => n + 1)} />
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
