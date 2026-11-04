import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "secondary";

const base =
  "flex w-full min-h-16 items-center justify-center gap-3 rounded-2xl px-6 py-4 text-2xl font-semibold " +
  "transition-colors focus-visible:outline-4 sm:w-auto sm:min-w-72";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border-4 border-brand bg-white text-brand-dark hover:bg-blue-50",
};

interface CommonProps {
  /** Words are mandatory; icons never appear alone (CLAUDE.md section 4). */
  label: string;
  icon?: ReactNode;
  variant?: Variant;
}

type BigButtonProps = CommonProps &
  ({ to: string; onClick?: never; type?: never } | { to?: never; onClick?: () => void; type?: "button" | "submit" });

export function BigButton({ label, icon, variant = "primary", ...rest }: BigButtonProps) {
  const className = `${base} ${variants[variant]}`;
  const content = (
    <>
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{label}</span>
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
