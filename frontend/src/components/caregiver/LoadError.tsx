import { RotateCcw } from "lucide-react";

/** A caregiver-side load failure: what failed, and a way to try again. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-danger">
      {message}
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 font-medium text-brand-dark underline underline-offset-2"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        Try again
      </button>
    </p>
  );
}
