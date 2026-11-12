import { useEffect, useMemo, useRef, useState } from "react";
import { BigButton } from "../../components/BigButton";
import { copy } from "../../copy";
import { HintButton } from "../HintButton";
import type { GameDefinition, RoundProps } from "../types";
import { EyeOff, LayoutGrid } from "lucide-react";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { QuestionRow } from "../QuestionRow";
import { CARD_ART } from "../memory/art";
import { boardColumns, buildDeck, isBoardCorrect, memoryMatchConfig } from "./logic";

/** Pause before a non-matching pair turns back over. */
export const MISMATCH_SHOW_MS = 1200;

/**
 * One round = one full board. Correct when mistakes <= pairs.
 * The cards stay face up until the patient taps "I've looked — hide the cards" (no
 * hidden timer); the time spent looking, including any "Show me again", is `study_ms`.
 * Reaction time = average time per pair found, measured after the first look.
 * Hint ("Show me again"): every card is shown again until the patient hides them.
 */
export function MemoryMatchRound({ level, onComplete, rng = Math.random }: RoundProps) {
  const { pairs } = memoryMatchConfig(level);
  const deck = useMemo(() => buildDeck(pairs, rng), [pairs, rng]);

  const [revealing, setRevealing] = useState(true);
  const [open, setOpen] = useState<number[]>([]); // indexes currently face up (max 2)
  const [matched, setMatched] = useState<ReadonlySet<number>>(new Set());
  const [hintUsed, setHintUsed] = useState(false);
  const mistakes = useRef(0);
  const revealStart = useRef(Date.now());
  const studyMs = useRef(0);
  const playStart = useRef<number | null>(null);
  const reported = useRef(false);

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
        reaction_ms: Math.round((Date.now() - (playStart.current ?? Date.now())) / pairs),
        hint_used: hintUsed,
        study_ms: Math.round(studyMs.current),
      });
    }
  }, [matched, deck.length, pairs, hintUsed, onComplete]);

  function hideCards() {
    studyMs.current += Date.now() - revealStart.current;
    playStart.current ??= Date.now();
    setRevealing(false);
  }

  function flip(index: number) {
    if (revealing || open.length >= 2 || open.includes(index) || matched.has(index)) return;
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

  function showAgain() {
    setHintUsed(true);
    setOpen([]);
    revealStart.current = Date.now();
    setRevealing(true);
  }

  const prompt = revealing ? copy.games.memoryMatch.lookCarefully : copy.games.memoryMatch.findPairs;
  useSpeakOnChange(prompt);

  const columns = boardColumns(deck.length);
  const rows = Math.ceil(deck.length / columns);
  // A 20px word does not fit a 4-column card on a phone, and words never go below 20px
  // (CLAUDE.md section 4): big boards show the picture alone; the word stays the card's name.
  const showWords = columns < 4;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={prompt}>
        <p className="text-2xl" aria-live="polite">
          {revealing ? copy.games.memoryMatch.lookCarefully : copy.games.memoryMatch.findPairs}
        </p>
      </QuestionRow>
      {/* The board takes the space that is left, so every card is on screen without scrolling. */}
      <div
        className="grid min-h-0 flex-1 gap-2"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(64px, 1fr))`,
          maxHeight: `${rows * 9}rem`,
        }}
      >
        {deck.map((card, index) => {
          const faceUp = revealing || open.includes(index) || matched.has(index);
          const label = copy.cards[card.face];
          const Picture = CARD_ART[card.face];
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => flip(index)}
              disabled={matched.has(index)}
              aria-label={faceUp ? label : copy.games.memoryMatch.faceDown(index + 1)}
              style={{ containerType: "size" }}
              className={
                "flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-2xl border-4 p-1 text-center transition-colors " +
                (matched.has(index)
                  ? "border-calm bg-calm-soft"
                  : faceUp
                    ? "border-brand bg-surface"
                    : "border-brand-dark bg-brand hover:bg-brand-dark")
              }
            >
              {faceUp ? (
                <>
                  {/* The picture shrinks with the card; the word stays at the 20px minimum. */}
                  <Picture className={showWords ? "h-[58cqh] max-h-[4.5rem] w-auto" : "h-[78cqh] max-h-24 w-auto max-w-[85cqw]"} />
                  {showWords && <span className="mt-1 text-base font-semibold leading-tight text-ink">{label}</span>}
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
      {/* Same height in every state, so the cards never move between looking and playing. */}
      <div className="flex h-[5rem] shrink-0 flex-col [&>*]:h-full">
        {revealing ? (
          <BigButton label={copy.games.memoryMatch.hideCards} icon={<EyeOff aria-hidden="true" />} size="compact" onClick={hideCards} />
        ) : (
          <HintButton used={hintUsed} available onUse={showAgain} />
        )}
      </div>
    </div>
  );
}

export const memoryMatch: GameDefinition = {
  type: "memory_match",
  title: copy.games.memoryMatch.title,
  intro: copy.games.memoryMatch.intro,
  icon: LayoutGrid,
  Round: MemoryMatchRound,
};
