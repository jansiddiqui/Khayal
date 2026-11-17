import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useFeedback } from "../ui/feedback";
import { pressable } from "../ui/motion";
import { Spinner } from "../ui/Spinner";

type Variant = "primary" | "secondary";
type Size = "normal" | "compact" | "home";

const base =
  "relative flex w-full items-center justify-center gap-3 rounded-2xl font-semibold shadow-lift " +
  "focus-visible:outline-4 disabled:cursor-default sm:w-auto sm:min-w-72 " +
  pressable;

/** Compact is for game screens in play mode: still at least 64px tall (CLAUDE.md section 4). */
const sizes: Record<Size, string> = {
  normal: "min-h-16 px-6 py-4 text-2xl",
  compact: "min-h-[64px] px-4 py-2 text-xl",
  /** Patient Home: three buttons and the reminder card fit a 375 × 667 phone. */
  home: "min-h-[72px] px-4 py-2 text-[1.4rem] leading-tight",
};

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark active:bg-brand-dark",
  secondary: "border-4 border-brand bg-surface text-brand-dark hover:bg-brand-soft active:bg-brand-soft",
};

interface CommonProps {
  /** Words are mandatory; icons never appear alone (CLAUDE.md section 4). */
  label: string;
  icon?: ReactNode;
  variant?: Variant;
  size?: Size;
  /** Small second line under the label, e.g. "✓ Done today". Part of the accessible name. */
  note?: string;
  /** Saving: a spinner replaces the icon, the words stay, and it can't be pressed twice. */
  busy?: boolean;
  /** Just done: a tick replaces the icon. */
  done?: boolean;
}

type BigButtonProps = CommonProps &
  ({ to: string; onClick?: never; type?: never } | { to?: never; onClick?: () => void; type?: "button" | "submit" });

/**
 * The patient's big button. It sinks a little under the finger (press feedback that works on
 * touch, not only hover), with an optional light vibration or soft sound (settings sheet).
 */
export function BigButton({ label, icon, variant = "primary", size = "normal", note, busy = false, done = false, ...rest }: BigButtonProps) {
  const { cue } = useFeedback();
  const className = `${base} ${sizes[size]} ${variants[variant]}`;
  const mark = busy ? <Spinner /> : done ? <Check /> : icon;
  const content = (
    <>
      {mark && (
        <span aria-hidden="true" className="flex shrink-0 [&>svg]:size-[1.2em]">
          {mark}
        </span>
      )}
      {note ? (
        <span className="flex flex-col items-center leading-tight">
          <span>{label}</span>
          <span className="mt-1 text-xl font-medium">{note}</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
    </>
  );

  if (rest.to !== undefined) {
    return (
      <Link to={rest.to} className={className} onPointerDown={() => cue("tap")}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type={rest.type ?? "button"}
      onClick={busy ? undefined : rest.onClick}
      onPointerDown={() => cue("tap")}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      className={className}
    >
      {content}
    </button>
  );
}
