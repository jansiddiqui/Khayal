import { useId, type InputHTMLAttributes } from "react";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  label: string;
}

/** Large labelled input, comfortable for elderly users. */
export function TextField({ label, ...inputProps }: TextFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xl font-semibold">
        {label}
      </label>
      <input
        id={id}
        className="min-h-16 rounded-xl border-4 border-line-strong bg-surface px-4 text-2xl focus:border-brand"
        {...inputProps}
      />
    </div>
  );
}
