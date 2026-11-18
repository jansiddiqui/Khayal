import { House, Settings, Volume2, VolumeX } from "lucide-react";
import { useReportVoice } from "../readAloud/useReportVoice";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { copy } from "../copy";
import { useReadAloud } from "../readAloud/ReadAloudContext";
import { useFeedback } from "../ui/feedback";
import { calm, DURATION, pressable, useLessMotion } from "../ui/motion";
import { SettingsSheet } from "./SettingsSheet";

export const PATIENT_HOME = "/patient";

interface LayoutProps {
  title: string;
  /** Extra text read aloud after the title when read-aloud is on. */
  spokenIntro?: string;
  /** Read this instead of the title (and intro) when the screen opens. */
  spoken?: string;
  /**
   * Play mode: the screen is exactly one viewport tall, the heading is kept for screen
   * readers only, and the content fills the rest, so game boards and their buttons fit
   * without scrolling (CLAUDE.md section 4).
   */
  compact?: boolean;
  /** Tighter spacing (patient Home), so everything fits a small phone. */
  snug?: boolean;
  children: ReactNode;
}

const topBarButton =
  // Icon above the words on phones, so all three top-bar buttons fit one row at 375px.
  "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border-4 border-ink bg-surface text-center whitespace-nowrap " +
  "px-1.5 py-0.5 text-xl leading-tight font-bold text-ink shadow-lift hover:bg-sunken active:bg-sunken " +
  "sm:flex-row sm:gap-3 sm:px-5 sm:text-2xl " +
  pressable;

/**
 * Accessible patient layout. The top bar (Home, Read aloud and Settings) is identical on every
 * patient screen and does not count toward the 3-button limit (CLAUDE.md section 4). Each screen
 * arrives with a short fade and rise, so the patient never feels "teleported"; nothing waits
 * for it, and under reduced motion it only fades.
 */
export function Layout({ title, spokenIntro, spoken, compact = false, snug = false, children }: LayoutProps) {
  const { enabled, toggle, speak } = useReadAloud();
  useReportVoice();
  const { cue } = useFeedback();
  const less = useLessMotion();
  const { pathname } = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [homeNudge, setHomeNudge] = useState(0);

  useEffect(() => {
    speak(spoken ?? (spokenIntro ? `${title}. ${spokenIntro}` : title));
  }, [speak, title, spokenIntro, spoken]);

  // Play mode needs the whole screen, so the public demo's banner steps aside (index.css).
  useEffect(() => {
    if (!compact) return;
    document.documentElement.setAttribute("data-play-mode", "");
    return () => document.documentElement.removeAttribute("data-play-mode");
  }, [compact]);

  const onHome = pathname === PATIENT_HOME;

  return (
    <div data-patient-layout className={`mx-auto flex max-w-3xl flex-col px-4 py-4 sm:px-8 ${compact ? "h-dvh" : "min-h-screen"}`}>
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 sm:flex sm:gap-4" aria-label={copy.a11y.topBar}>
        <Link
          to={PATIENT_HOME}
          className={topBarButton}
          onPointerDown={() => cue("tap")}
          onClick={(event) => {
            // Already home: say so by settling the page back to the top and nodding the greeting.
            if (!onHome) return;
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: less ? "auto" : "smooth" });
            setHomeNudge((n) => n + 1);
            heading.current?.focus({ preventScroll: true });
          }}
          aria-current={onHome ? "page" : undefined}
        >
          <House aria-hidden="true" className="size-6 shrink-0 sm:size-7" />
          <span>{copy.nav.home}</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            toggle();
            cue("tap");
          }}
          aria-pressed={enabled}
          className={topBarButton}
        >
          {enabled ? (
            <Volume2 aria-hidden="true" className="size-6 shrink-0 sm:size-7" />
          ) : (
            <VolumeX aria-hidden="true" className="size-6 shrink-0 sm:size-7" />
          )}
          {/* Two short lines on a phone ("Read aloud:" / "Off"), one line on wider screens. */}
          <span className="flex flex-wrap justify-center gap-x-[0.3em]">
            <span>{copy.nav.readAloud}</span> <span>{enabled ? copy.nav.on : copy.nav.off}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            cue("tap");
            setSettingsOpen(true);
          }}
          aria-haspopup="dialog"
          aria-label={copy.nav.moreSettings}
          className={topBarButton}
        >
          <Settings aria-hidden="true" className="size-6 shrink-0 sm:size-7" />
          {/* "More" fits beside Home and Read aloud on a 375px phone; "Settings" from 800px. */}
          <span className="sm:hidden">{copy.nav.more}</span>
          <span className="hidden sm:inline">{copy.nav.settings}</span>
        </button>
      </header>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <motion.main
        key={pathname}
        initial={less ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={calm(DURATION.page)}
        className={
          compact ? "flex min-h-0 flex-1 flex-col gap-3 pt-3" : snug ? "flex flex-1 flex-col gap-3 py-3" : "flex flex-1 flex-col gap-8 py-8"
        }
      >
        <motion.h1
          ref={heading}
          tabIndex={-1}
          key={homeNudge}
          initial={homeNudge && !less ? { scale: 0.97, opacity: 0.6 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={calm(DURATION.base)}
          className={compact ? "sr-only" : "origin-left text-4xl font-bold leading-tight outline-none"}
        >
          {title}
        </motion.h1>
        {children}
      </motion.main>
    </div>
  );
}
