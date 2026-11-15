import { Info } from "lucide-react";
import { useAppConfig } from "../api/useAppConfig";
import { copy } from "../copy";

/**
 * Shown on every screen of the public demo (KHAYAL_DEMO_MODE=1 on the backend), except game
 * boards in play mode: those must fit a phone without scrolling (CLAUDE.md section 4), and
 * have nothing to type or upload. Layout sets data-play-mode; index.css hides the banner.
 */
export function DemoBanner() {
  const config = useAppConfig();
  if (config?.demo_mode !== true) return null;
  return (
    <div
      role="note"
      className="demo-banner flex items-center justify-center gap-2 border-b-2 border-accent bg-accent-soft px-4 py-2 text-center text-xl leading-snug font-semibold text-ink"
    >
      <Info aria-hidden="true" className="size-5 shrink-0" />
      <span>{copy.demo.banner}</span>
    </div>
  );
}
