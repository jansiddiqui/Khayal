import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * A friendly empty state with one clear next action (caregiver screens). The icon is drawn from
 * lucide and always sits with words.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-strong/60 bg-desk px-4 py-5">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <span aria-hidden="true" className="flex text-brand [&>svg]:size-5">
          {icon}
        </span>
        {title}
      </p>
      {children && <div className="max-w-prose text-ink-soft">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * What failed and a way to try again (caregiver screens). While the retry is running the button
 * shows a spinner, so the second press is never needed.
 */
export function ErrorState({ message, onRetry, retrying = false }: { message: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-danger">
      <span>{message}</span>
      <Button size="sm" variant="secondary" icon={<RotateCcw />} loading={retrying} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
