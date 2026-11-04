import { useEffect, useMemo, useRef, useState } from "react";
import { copy } from "../../copy";
import type { GameDefinition, RoundProps } from "../types";
import { buildDeck, emojiFor, isBoardCorrect, memoryMatchConfig } from "./logic";

/** Pause before a non-matching pair turns back over. */
export const MISMATCH_SHOW_MS = 1200;

/**
 * One round = one full board. Correct when mistakes <= pairs.
 * Reaction time = average time per pair found, measured after the preview.
 */
export function MemoryMatchRound({ level, onComplete, rng = Math.random }: RoundProps) {
  const { pairs, previewMs } = memoryMatchConfig(level);
  const deck = useMemo(() => buildDeck(pairs, rng), [pairs, rng]);

  const [previewing, setPreviewing] = useState(true);
  const [open, setOpen] = useState<number[]>([]); // indexes currently face up (max 2)
  const [matched, setMatched] = useState<ReadonlySet<number>>(new Set());
  const mistakes = useRef(0);
  const playStart = useRef(0);
  const reported = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setPreviewing(false);
      playStart.current = Date.now();
    }, previewMs);
    return () => clearTimeout(t);
  }, [previewMs]);

  // Turn a non-matching pair back over after a short, calm pause.
  useEffect(() => {
    if (open.length !== 2) return;
    const t = setTimeout(() => setOpen([]), MISMATCH_SHOW_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (matched.size === deck.length && !reported.current) {
      reported.current = true;
      onComplete({
        correct: isBoardCorrect(mistakes.current, pairs),
        reaction_ms: Math.round((Date.now() - playStart.current) / pairs),
        hint_used: false,
      });
    }
  }, [matched, deck.length, pairs, onComplete]);

  function flip(index: number) {
    if (previewing || open.length >= 2 || open.includes(index) || matched.has(index)) return;
    const next = [...open, index];
    if (next.length === 2) {
      const [a, b] = next as [number, number];
      if (deck[a]!.face === deck[b]!.face) {
        setMatched(new Set([...matched, a, b]));
        setOpen([]);
        return;
      }
      mistakes.current += 1;
    }
    setOpen(next);
  }

  const columns = deck.length <= 4 ? "grid-cols-2" : deck.length <= 12 ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-4 sm:grid-cols-5";

  return (
    <div className="flex flex-col gap-6">
      <p className="text-2xl" aria-live="polite">
        {previewing ? copy.games.memoryMatch.lookCarefully : copy.games.memoryMatch.findPairs}
      </p>
      <div className={`grid ${columns} gap-3`}>
        {deck.map((card, index) => {
          const faceUp = previewing || open.includes(index) || matched.has(index);
          const label = copy.cards[card.face];
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => flip(index)}
              disabled={matched.has(index)}
              aria-label={faceUp ? label : copy.games.memoryMatch.faceDown(index + 1)}
              className={
                "flex min-h-24 flex-col items-center justify-center rounded-2xl border-4 p-2 text-center transition-colors " +
                (matched.has(index)
                  ? "border-calm bg-emerald-50"
                  : faceUp
                    ? "border-brand bg-white"
                    : "border-brand-dark bg-brand hover:bg-brand-dark")
              }
            >
              {faceUp ? (
                <>
                  <span aria-hidden="true" className="text-4xl leading-none">
                    {emojiFor(card.face)}
                  </span>
                  <span className="mt-1 text-base font-semibold leading-tight text-ink">{label}</span>
                </>
              ) : (
                <span aria-hidden="true" className="text-3xl text-white">
                  ?
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const memoryMatch: GameDefinition = {
  type: "memory_match",
  title: copy.games.memoryMatch.title,
  intro: copy.games.memoryMatch.intro,
  icon: "🃏",
  Round: MemoryMatchRound,
};
