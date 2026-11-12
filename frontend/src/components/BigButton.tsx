import type { ReactNode } from "react";
import { Link } from "react-router";

type Variant = "primary" | "secondary";
type Size = "normal" | "compact";

const base =
  "flex w-full items-center justify-center gap-3 rounded-2xl font-semibold " +
  "transition-colors focus-visible:outline-4 sm:w-auto sm:min-w-72";

/** Compact is for game screens in play mode: still at least 64px tall (CLAUDE.md section 4). */
const sizes: Record<Size, string> = {
  normal: "min-h-16 px-6 py-4 text-2xl",
  compact: "min-h-[64px] px-4 py-2 text-xl",
};

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border-4 border-brand bg-white text-brand-dark hover:bg-blue-50",
};

interface CommonProps {
  /** Words are mandatory; icons never appear alone (CLAUDE.md section 4). */
  label: string;
  icon?: ReactNode;
  variant?: Variant;
  size?: Size;
  /** Small second line under the label, e.g. "✓ Done today". Part of the accessible name. */
  note?: string;
}

type BigButtonProps = CommonProps &
  ({ to: string; onClick?: never; type?: never } | { to?: never; onClick?: () => void; type?: "button" | "submit" });

export function BigButton({ label, icon, variant = "primary", size = "normal", note, ...rest }: BigButtonProps) {
  const className = `${base} ${sizes[size]} ${variants[variant]}`;
  const content = (
    <>
      {icon && (
        <span aria-hidden="true" className="flex shrink-0 [&>svg]:size-[1.2em]">
          {icon}
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
      <Link to={rest.to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type={rest.type ?? "button"} onClick={rest.onClick} className={className}>
      {content}
    </button>
  );
}
