import { useEffect, useMemo, useRef, useState } from "react";
import { BigButton } from "../../components/BigButton";
import { copy } from "../../copy";
import { HintButton } from "../HintButton";
import { shuffle, type GameDefinition, type RoundProps } from "../types";
import {
  buildWordRound,
  DISTRACTION_MS,
  isRecallCorrect,
  missingFirstLetters,
  STAR_COUNT,
  WORD_SHOW_MS,
  wordCount,
  type WordId,
} from "./logic";

type Step = { kind: "showing"; index: number } | { kind: "stars" } | { kind: "choosing" };

/** Stars sit in some cells of a 4×3 grid; the rest stay empty so they look scattered. */
const STAR_GRID_CELLS = 12;

/**
 * One round: words one at a time, a short star-tapping distraction, then pick the
 * words you saw from a list. Correct when (found − wrong) / shown ≥ 0.8.
 * Reaction time = time from the list appearing to pressing Done.
 * Hint ("Show me again"): the first letter of each word not yet picked.
 */
export function WordRecallRound({ level, onComplete, rng = Math.random }: RoundProps) {
  const round = useMemo(() => buildWordRound(wordCount(level), rng), [level, rng]);
  const starCells = useMemo(
    () => new Set(shuffle([...Array(STAR_GRID_CELLS).keys()], rng).slice(0, STAR_COUNT)),
    [rng],
  );

  const [step, setStep] = useState<Step>({ kind: "showing", index: 0 });
  const [tappedStars, setTappedStars] = useState<ReadonlySet<number>>(new Set());
  const [picked, setPicked] = useState<ReadonlySet<WordId>>(new Set());
  const [hintLetters, setHintLetters] = useState<string[] | null>(null);
  const choosingSince = useRef(0);
  const reported = useRef(false);

  useEffect(() => {
    if (step.kind === "showing") {
      const t = setTimeout(() => {
        const next = step.index + 1;
        setStep(next < round.shown.length ? { kind: "showing", index: next } : { kind: "stars" });
      }, WORD_SHOW_MS);
      return () => clearTimeout(t);
    }
    if (step.kind === "stars") {
      const t = setTimeout(() => {
        choosingSince.current = Date.now();
        setStep({ kind: "choosing" });
      }, DISTRACTION_MS);
      return () => clearTimeout(t);
    }
  }, [step, round.shown.length]);

  function toggle(word: WordId) {
    const next = new Set(picked);
    if (next.has(word)) next.delete(word);
    else next.add(word);
    setPicked(next);
  }

  function done() {
    if (reported.current) return;
    reported.current = true;
    onComplete({
      correct: isRecallCorrect(round.shown, picked),
      reaction_ms: Date.now() - choosingSince.current,
      hint_used: hintLetters !== null,
    });
  }

  if (step.kind === "showing") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-2xl">{copy.games.wordRecall.remember}</p>
        <p className="w-full rounded-2xl border-4 border-brand bg-white py-12 text-center text-5xl font-bold" aria-live="polite">
          {copy.words[round.shown[step.index]!]}
        </p>
      </div>
    );
  }

  if (step.kind === "stars") {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-2xl" aria-live="polite">
          {tappedStars.size === STAR_COUNT ? copy.games.wordRecall.starsDone : copy.games.wordRecall.stars}
        </p>
        <div className="grid grid-cols-4 gap-3">
          {[...Array(STAR_GRID_CELLS).keys()].map((cell) => {
            if (!starCells.has(cell)) return <div key={cell} className="min-h-20" />;
            const n = [...starCells].sort((a, b) => a - b).indexOf(cell) + 1;
            const tapped = tappedStars.has(cell);
            return (
              <button
                key={cell}
                type="button"
                onClick={() => setTappedStars(new Set([...tappedStars, cell]))}
                aria-label={tapped ? copy.games.wordRecall.starTapped(n) : copy.games.wordRecall.star(n)}
                className={
                  "min-h-20 rounded-full border-4 text-4xl transition-colors " +
                  (tapped ? "border-amber-500 bg-amber-100" : "border-gray-400 bg-white hover:bg-amber-50")
                }
              >
                <span aria-hidden="true">{tapped ? "⭐" : "☆"}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-2xl">{copy.games.wordRecall.choose}</p>
      {hintLetters && hintLetters.length > 0 && (
        <p className="rounded-xl border-4 border-amber-500 bg-amber-50 p-4 text-2xl" role="status">
          {copy.games.wordRecall.hintLetters(hintLetters.join(", "))}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {round.options.map((word) => {
          const on = picked.has(word);
          return (
            <button
              key={word}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(word)}
              className={
                "flex min-h-16 items-center justify-center gap-2 rounded-2xl border-4 px-3 text-2xl font-semibold " +
                (on ? "border-calm bg-emerald-50 text-ink" : "border-gray-500 bg-white text-ink hover:bg-gray-50")
              }
            >
              {on && <span aria-hidden="true">✓</span>}
              {copy.words[word]}
            </button>
          );
        })}
      </div>
      <HintButton
        used={hintLetters !== null}
        available
        onUse={() => setHintLetters(missingFirstLetters(round.shown, picked))}
      />
      <BigButton label={copy.games.wordRecall.done} icon="✅" onClick={done} />
    </div>
  );
}

export const wordRecall: GameDefinition = {
  type: "word_recall",
  title: copy.games.wordRecall.title,
  intro: copy.games.wordRecall.intro,
  icon: "📝",
  Round: WordRecallRound,
};
