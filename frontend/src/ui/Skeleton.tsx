import type { ReactNode } from "react";

/**
 * Waiting placeholders shaped like what is coming, so nothing jumps when it arrives (index.css
 * `.skeleton`). Hidden from screen readers; the surrounding region says it is busy.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block rounded-lg ${className}`} />;
}

/** A few lines of text-shaped placeholders. */
export function SkeletonLines({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton block h-[1em] rounded" style={{ width: `${92 - ((i * 23) % 40)}%` }} />
      ))}
    </span>
  );
}

/** A labelled busy region: screen readers hear `label`, sighted people see the placeholders. */
export function Busy({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
