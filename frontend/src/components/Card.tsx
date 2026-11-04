import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border-2 border-gray-300 bg-white p-6 shadow-sm">{children}</div>;
}
