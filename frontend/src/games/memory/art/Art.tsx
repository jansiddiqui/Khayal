import type { ReactNode } from "react";

/**
 * Shared frame for the Memory Match card illustrations: a 64×64 grid, flat fills and a
 * 3px dark outline, so every picture reads clearly at 60px (CLAUDE.md section 4).
 */
export const INK = "#1c1a17";
export const STROKE = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" } as const;

export interface ArtProps {
  className?: string;
}

export function Art({ className, children }: ArtProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
