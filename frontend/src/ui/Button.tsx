import { Check } from "lucide-react";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { liftOnHover, pressable } from "./motion";
import { Spinner } from "./Spinner";

/** How long the success tick stays before the button reads as usual again. */
export const SUCCESS_SHOW_MS = 2500;

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "danger-quiet";
export type ButtonSize = "sm" | "md";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap " +
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-none " +
  pressable;

const variants: Record<ButtonVariant, string> = {
  primary: `bg-brand text-white shadow-lift hover:bg-brand-dark ${liftOnHover}`,
  secondary: `border border-line-strong bg-surface text-ink hover:border-brand hover:bg-brand-soft ${liftOnHover}`,
  quiet: "text-brand-dark hover:bg-brand-soft",
  danger: `bg-danger text-white shadow-lift hover:brightness-90 ${liftOnHover}`,
  "danger-quiet": "text-danger hover:bg-danger-soft",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Busy: a spinner replaces the icon, the button keeps its size and can't be pressed again. */
  loading?: boolean;
  /** Just finished an important action: a tick and these words, e.g. "Saved", for a moment. */
  successLabel?: string | false;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * The caregiver-side button (and the base for small patient-side controls). Hover lifts and
 * shades it, a press sinks it, focus shows the saffron ring (index.css), loading shows a spinner
 * inside without changing its size, and `successLabel` shows a tick for a moment after an
 * important action.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, successLabel, icon, children, className = "", disabled, type = "button", ...rest },
  ref,
) {
  // The tick shows for SUCCESS_SHOW_MS each time `successLabel` turns on, then the usual words return.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!successLabel) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), SUCCESS_SHOW_MS);
    return () => clearTimeout(t);
  }, [successLabel]);
  const showSuccess = flash && Boolean(successLabel) && !loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {/* The words always take their space, so the button never changes size between states. */}
      <span className={`inline-flex items-center gap-2 ${loading ? "invisible" : ""}`}>
        {showSuccess ? (
          <>
            <Check aria-hidden="true" className="size-[1.1em] shrink-0" />
            <span>{successLabel}</span>
          </>
        ) : (
          <>
            {icon && (
              <span aria-hidden="true" className="flex shrink-0 [&>svg]:size-[1.1em]">
                {icon}
              </span>
            )}
            <span>{children}</span>
          </>
        )}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </button>
  );
});
