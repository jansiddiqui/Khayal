import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFeedback } from "../ui/feedback";
import { pressable } from "../ui/motion";

/** How long a chosen answer stays highlighted before the kind reply appears. */
export const ANSWER_HOLD_MS = 650;

export interface Choice<T> {
  value: T;
  correct: boolean;
}

/**
 * One answer per question: the first tap is kept and highlighted (a calm glow when right, a small
 * gentle nudge otherwise), with a light vibration or soft sound if switched on, and only then
 * does the round report. Further taps are ignored, so a double-tap can't answer twice.
 */
export function useChoice<T>(onDecide: (choice: Choice<T>) => void) {
  const { cue } = useFeedback();
  const [chosen, setChosen] = useState<Choice<T> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decided = useRef(false);
  const latest = useRef(onDecide);
  latest.current = onDecide;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const choose = useCallback(
    (value: T, correct: boolean) => {
      if (decided.current) return;
      decided.current = true;
      const choice = { value, correct };
      setChosen(choice);
      cue(correct ? "success" : "gentle");
      // The same hold under reduced motion: less movement, never less time to see the answer.
      timer.current = setTimeout(() => latest.current(choice), ANSWER_HOLD_MS);
    },
    [cue],
  );

  return { chosen, choose };
}

type AnswerState = "idle" | "right" | "chosen" | "dim";

export function answerState<T>(chosen: Choice<T> | null, value: T): AnswerState {
  if (!chosen) return "idle";
  if (chosen.value !== value) return "dim";
  return chosen.correct ? "right" : "chosen";
}

/**
 * A big answer button for games (a game piece: it does not count toward the 3-button rule).
 * At least 64px tall, words always shown, press feedback on touch.
 */
export function AnswerButton({ label, state, onClick }: { label: string; state: AnswerState; onClick: () => void }) {
  const look =
    state === "right"
      ? "calm-glow border-calm bg-calm-soft text-ink"
      : state === "chosen"
        ? "gentle-nudge border-brand bg-brand-soft text-brand-dark"
        : state === "dim"
          ? "border-line-strong bg-surface text-ink-soft opacity-60"
          : "border-brand bg-surface text-brand-dark hover:bg-brand-soft active:bg-brand-soft";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state === "right" || state === "chosen" || undefined}
      disabled={state === "dim"}
      className={`flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl border-4 px-4 py-2 text-xl font-semibold shadow-lift sm:w-auto sm:min-w-72 ${look} ${pressable}`}
    >
      {state === "right" && <Check aria-hidden="true" className="size-7 shrink-0 text-calm" />}
      <span>{label}</span>
    </button>
  );
}
