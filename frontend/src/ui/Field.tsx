import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

/** Caregiver form controls: a clear focus, a hover hint, and an error only after leaving a field. */
export const controlClass =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink transition-[border-color,box-shadow] duration-150 ease-calm " +
  "placeholder:text-ink-muted hover:border-teal-600 focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft)] " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[0_0_0_3px_var(--color-danger-soft)]";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Show the error even before the field was left (after a submit attempt). */
  forceError?: boolean;
  className?: string;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean; onBlur: () => void }) => ReactNode;
}

/** Label above, hint below, and a helpful error that appears once the person moves on. */
export function FieldShell({ label, hint, error, forceError = false, className = "", children }: FieldShellProps) {
  const id = useId();
  const [left, setLeft] = useState(false);
  const showError = Boolean(error) && (left || forceError);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = showError ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="font-medium text-ink-soft">
        {label}
      </label>
      {children({ id, describedBy, invalid: showError, onBlur: () => setLeft(true) })}
      {showError && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  forceError?: boolean;
  wrapperClassName?: string;
};

export function TextInput({ label, hint, error, forceError, wrapperClassName, className = "", onBlur, ...rest }: TextInputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} forceError={forceError} className={wrapperClassName}>
      {({ id, describedBy, invalid, onBlur: markLeft }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onBlur={(event) => {
            markLeft();
            onBlur?.(event);
          }}
          className={`${controlClass} ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

type SelectInputProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  hint?: ReactNode;
  wrapperClassName?: string;
  children: ReactNode;
};

export function SelectInput({ label, hint, wrapperClassName, className = "", children, ...rest }: SelectInputProps) {
  return (
    <FieldShell label={label} hint={hint} className={wrapperClassName}>
      {({ id, describedBy }) => (
        <select id={id} aria-describedby={describedBy} className={`${controlClass} ${className}`} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}
