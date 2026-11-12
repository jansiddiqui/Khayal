import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border-2 border-line bg-surface p-6 shadow-sm">{children}</div>;
}
