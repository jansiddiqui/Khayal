import { Check } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { postSession, type RoundResult } from "../../api/client";
import { copy } from "../../copy";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { useFeedback } from "../../ui/feedback";
import { pressable } from "../../ui/motion";
import { QuestionRow } from "../QuestionRow";
import { shuffle } from "../types";
import { clearDelayed, type PendingRecall } from "./delayed";
import type { WordId } from "./logic";

const t = copy.games.wordRecall;

/**
 * "Earlier we saw some words. Which of these did you see?" (D4). Same pick list as the round
 * (at most 12 words). Each word shown earlier is one round (right = picked); words picked that
 * weren't shown are false alarms, stored as `errors` on the first round. Saved as its own game,
 * word_recall_delayed; nothing is shown about how it went, so it never feels like a test.
 */
export function DelayedRecall({ pending, onDone }: { pending: PendingRecall; onDone: () => void }) {
  const options = useMemo(() => shuffle(pending.options, Math.random), [pending.options]);
  const [picked, setPicked] = useState<ReadonlySet<WordId>>(new Set());
  const startedAt = useRef(new Date());
  const { cue } = useFeedback();
  useSpeakOnChange(copy.common.spokenChoices([t.delayedAsk, ...options.map((w) => copy.words[w])]));

  function done() {
    const ms = Date.now() - startedAt.current.getTime();
    const falseAlarms = [...picked].filter((w) => !pending.shown.includes(w)).length;
    const rounds: RoundResult[] = pending.shown.map((w, i) => ({
      correct: picked.has(w),
      reaction_ms: ms,
      hint_used: false,
      errors: i === 0 ? falseAlarms : null,
    }));
    clearDelayed();
    void postSession({
      game_type: "word_recall_delayed",
      started_at: startedAt.current.toISOString(),
      ended_at: new Date().toISOString(),
      rounds,
      completed: true,
    }).catch(() => undefined);
    onDone();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={copy.common.spokenChoices([t.delayedAsk, ...options.map((w) => copy.words[w])])}>
        <p className="text-2xl font-semibold">{t.delayedAsk}</p>
      </QuestionRow>
      <div
        className="grid min-h-0 flex-1 grid-cols-2 gap-[6px]"
        style={{ gridTemplateRows: `repeat(${Math.ceil(options.length / 2)}, minmax(64px, 5rem))` }}
      >
        {options.map((word) => {
          const on = picked.has(word);
          return (
            <button
              key={word}
              type="button"
              aria-pressed={on}
              onClick={() => {
                cue("tap");
                const next = new Set(picked);
                if (on) next.delete(word);
                else next.add(word);
                setPicked(next);
              }}
              className={`flex min-h-[64px] items-center justify-center gap-1 rounded-2xl border-4 px-1 text-2xl font-semibold ${pressable} ${
                on ? "border-calm bg-calm-soft text-ink" : "border-line-strong bg-surface text-ink hover:bg-sunken"
              }`}
            >
              {on && <span aria-hidden="true">✓</span>}
              {copy.words[word]}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={done}
        className={`flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl border-4 border-brand bg-brand px-4 text-2xl font-bold text-white ${pressable}`}
      >
        <Check aria-hidden="true" className="size-7" />
        {t.done}
      </button>
    </div>
  );
}
