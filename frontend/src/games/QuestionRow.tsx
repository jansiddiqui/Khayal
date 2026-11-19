import { Volume2 } from "lucide-react";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { copy } from "../copy";
import { useReadAloud } from "../readAloud/ReadAloudContext";

/** A secondary button with its icon above the words: 64px tall, narrow enough to share a row. */
export function StackedButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[64px] shrink-0 flex-col items-center justify-center rounded-2xl border-4 border-brand bg-surface px-2 py-0.5 text-base font-bold leading-tight text-brand-dark hover:bg-brand-soft"
    >
      <span aria-hidden="true" className="[&>svg]:size-5">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

/**
 * Set by a game session (GameSession.tsx): "Say it again" goes on the "Round X of 5" row
 * (game-header-timeline) instead of beside each question. A round's question hands its spoken
 * text up through this; without it (the practice round) the button stays beside the question.
 */
export const SayItAgainSlot = createContext<((text: string) => void) | null>(null);

/**
 * "Say it again": when Read aloud is on, repeats the question (and its choices) on request,
 * for anyone who missed the first reading. Inside a session it shows on the round row; on its
 * own it is at least 64px tall, icon above the words, beside the prompt.
 */
export function SayItAgain({ text }: { text: string }) {
  const slot = useContext(SayItAgainSlot);
  useEffect(() => {
    if (!slot) return;
    slot(text);
    return () => slot("");
  }, [slot, text]);
  const { enabled, speak } = useReadAloud();
  if (slot || !enabled || !text) return null;
  return <StackedButton icon={<Volume2 />} label={copy.nav.sayItAgain} onClick={() => speak(text)} />;
}

/** The round row's "Say it again": 64px tall, icon beside the word, 20px text (the section 4 minimum; the root size is 20px). */
export function RoundSayItAgain({ text }: { text: string }) {
  const { enabled, speak } = useReadAloud();
  if (!enabled || !text) return null;
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      className="inline-flex min-h-[64px] shrink-0 items-center gap-1 rounded-2xl border-4 border-brand bg-surface px-2 text-base font-bold leading-tight text-brand-dark hover:bg-brand-soft"
    >
      <Volume2 aria-hidden="true" className="size-5 shrink-0" />
      <span className="whitespace-nowrap">{copy.nav.sayItAgain}</span>
    </button>
  );
}

/** A game's question or instruction with "Say it again" beside it (only when Read aloud is on). */
export function QuestionRow({ spoken, children }: { spoken: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">{children}</div>
      <SayItAgain text={spoken} />
    </div>
  );
}
