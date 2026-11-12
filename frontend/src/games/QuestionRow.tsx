import { Volume2 } from "lucide-react";
import type { ReactNode } from "react";
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
 * "Say it again": when Read aloud is on, repeats the question (and its choices) on request,
 * for anyone who missed the first reading. At least 64px tall, icon above the words, so it
 * sits beside a prompt without pushing the game off a phone screen.
 */
export function SayItAgain({ text }: { text: string }) {
  const { enabled, speak } = useReadAloud();
  if (!enabled || !text) return null;
  return <StackedButton icon={<Volume2 />} label={copy.nav.sayItAgain} onClick={() => speak(text)} />;
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
