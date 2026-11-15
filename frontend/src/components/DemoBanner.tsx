import { Hourglass, Info } from "lucide-react";
import { useAppConfigState } from "../api/useAppConfig";
import { copy } from "../copy";

const bar = "flex items-center justify-center gap-2 border-b-2 px-4 py-2 text-center text-xl leading-snug font-semibold text-ink";

/**
 * Shown on every screen of the public demo (KHAYAL_DEMO_MODE=1 on the backend), except game
 * boards in play mode: those must fit a phone without scrolling (CLAUDE.md section 4), and
 * have nothing to type or upload. Layout sets data-play-mode; index.css hides the banner.
 *
 * While the backend has not answered (the free host sleeps when idle), a calm "waking up"
 * notice takes its place, so the banner and the demo button never just go missing.
 */
export function DemoBanner() {
  const { config, waking } = useAppConfigState();
  if (waking) {
    return (
      <div role="status" className={`demo-banner ${bar} border-brand bg-brand-soft`}>
        <Hourglass aria-hidden="true" className="size-5 shrink-0" />
        <span>{copy.demo.waking}</span>
      </div>
    );
  }
  if (config?.demo_mode !== true) return null;
  return (
    <div role="note" className={`demo-banner ${bar} border-accent bg-accent-soft`}>
      <Info aria-hidden="true" className="size-5 shrink-0" />
      <span>{copy.demo.banner}</span>
    </div>
  );
}
