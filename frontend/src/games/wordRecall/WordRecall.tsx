import { ArrowRight, BookOpen, Check, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BigButton } from "../../components/BigButton";
import { copy } from "../../copy";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { HintButton } from "../HintButton";
import { shuffle, type GameDefinition, type RoundProps } from "../types";
import {
  buildWordRound,
  isRecallCorrect,
  missingFirstLetters,
  STAR_COUNT,
  STARS_DONE_PAUSE_MS,
  wordCount,
  type WordId,
} from "./logic";

type Step = { kind: "showing"; index: number } | { kind: "stars" } | { kind: "choosing" };

/** Stars sit in some cells of a 3×3 grid; the rest stay empty so they look scattered. */
const STAR_GRID_CELLS = 9;

/**
 * One round: words one at a time (the patient taps "Next word"), a short star-tapping
 * distraction that ends once all 5 stars are tapped, then pick the words you saw from
 * a list. Correct when (found − wrong) / shown ≥ 0.8.
 * study_ms = time from the first word appearing to leaving the last word.
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
  const shownSince = useRef(Date.now());
  const studyMs = useRef(0);
  const choosingSince = useRef(0);
  const reported = useRef(false);

  const starsDone = tappedStars.size === STAR_COUNT;
  useEffect(() => {
    if (step.kind !== "stars" || !starsDone) return;
    const t = setTimeout(() => {
      choosingSince.current = Date.now();
      setStep({ kind: "choosing" });
    }, STARS_DONE_PAUSE_MS);
    return () => clearTimeout(t);
  }, [step.kind, starsDone]);

  function nextWord() {
    if (step.kind !== "showing") return;
    const next = step.index + 1;
    if (next < round.shown.length) {
      setStep({ kind: "showing", index: next });
    } else {
      studyMs.current = Date.now() - shownSince.current;
      setStep({ kind: "stars" });
    }
  }

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
      study_ms: Math.round(studyMs.current),
    });
  }

  useSpeakOnChange(
    step.kind === "showing"
      ? `${copy.games.wordRecall.remember}: ${copy.words[round.shown[step.index]!]}`
      : step.kind === "stars"
        ? starsDone
          ? copy.games.wordRecall.starsDone
          : copy.games.wordRecall.stars
        : `${copy.games.wordRecall.choose} ${copy.common.spokenChoices(round.options.map((w) => copy.words[w]))}`,
  );

  if (step.kind === "showing") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <p className="text-2xl">{copy.games.wordRecall.remember}</p>
        <p
          className="flex min-h-[10rem] items-center justify-center rounded-2xl border-4 border-brand bg-white text-center text-5xl font-bold"
          aria-live="polite"
        >
          {copy.words[round.shown[step.index]!]}
        </p>
        <BigButton label={copy.games.wordRecall.nextWord} icon={<ArrowRight />} size="compact" onClick={nextWord} />
      </div>
    );
  }

  if (step.kind === "stars") {
    const order = [...starCells].sort((a, b) => a - b);
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <p className="text-2xl" aria-live="polite">
          {starsDone ? copy.games.wordRecall.starsDone : copy.games.wordRecall.stars}
        </p>
        <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3">
          {[...Array(STAR_GRID_CELLS).keys()].map((cell) => {
            if (!starCells.has(cell)) return <div key={cell} aria-hidden="true" />;
            const n = order.indexOf(cell) + 1;
            const tapped = tappedStars.has(cell);
            return (
              <button
                key={cell}
                type="button"
                onClick={() => setTappedStars(new Set([...tappedStars, cell]))}
                aria-label={tapped ? copy.games.wordRecall.starTapped(n) : copy.games.wordRecall.star(n)}
                className={
                  "aspect-square min-h-[64px] rounded-full border-4 text-4xl transition-colors " +
                  (tapped ? "border-amber-500 bg-amber-100" : "border-gray-500 bg-white hover:bg-amber-50")
                }
              >
                <Star
                  aria-hidden="true"
                  className={`mx-auto size-10 ${tapped ? "fill-amber-400 text-amber-700" : "text-ink"}`}
                />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // At most 12 words (6 rows of 2) fit with Done on a phone; more would need 3 narrower columns.
  const wide = round.options.length > 12;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-xl">{copy.games.wordRecall.choose}</p>
      {/* Up to 12 words, each at least 64px tall, so the whole list and Done fit on a phone screen. */}
      <div
        className={`grid min-h-0 flex-1 gap-[6px] ${wide ? "grid-cols-3" : "grid-cols-2"}`}
        style={{ gridTemplateRows: `repeat(${Math.ceil(round.options.length / (wide ? 3 : 2))}, minmax(64px, 5rem))` }}
      >
        {round.options.map((word) => {
          const on = picked.has(word);
          return (
            <button
              key={word}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(word)}
              className={
                "flex min-h-[64px] items-center justify-center gap-1 rounded-2xl border-4 px-1 font-semibold " +
                (wide ? "text-base " : "text-2xl ") +
                (on ? "border-calm bg-emerald-50 text-ink" : "border-gray-500 bg-white text-ink hover:bg-gray-50")
              }
            >
              {on && <span aria-hidden="true">✓</span>}
              {copy.words[word]}
            </button>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        {/* The hint letters appear where the hint button was, so nothing else moves. */}
        {hintLetters && hintLetters.length > 0 && (
          <p className="rounded-xl border-4 border-amber-500 bg-amber-50 px-3 py-1 text-xl leading-tight" role="status">
            {copy.games.wordRecall.hintLetters(hintLetters.join(", "))}
          </p>
        )}
        <HintButton
          used={hintLetters !== null}
          available
          onUse={() => setHintLetters(missingFirstLetters(round.shown, picked))}
        />
        <BigButton label={copy.games.wordRecall.done} icon={<Check />} size="compact" onClick={done} />
      </div>
    </div>
  );
}

export const wordRecall: GameDefinition = {
  type: "word_recall",
  title: copy.games.wordRecall.title,
  intro: copy.games.wordRecall.intro,
  icon: BookOpen,
  Round: WordRecallRound,
};
