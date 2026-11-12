import { House, Volume2, VolumeX } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { copy } from "../copy";
import { useReadAloud } from "../readAloud/ReadAloudContext";

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
  children: ReactNode;
}

const topBarButton =
  // Icon sits above the words on phones so both top-bar buttons fit on one row.
  "flex min-h-16 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl border-4 border-ink bg-surface " +
  "px-3 py-1 text-xl leading-tight font-bold text-ink hover:bg-sunken sm:flex-row sm:gap-3 sm:px-5 sm:text-2xl";

/**
 * Accessible patient layout. The top bar (Home + Read aloud) is identical on every
 * patient screen and does not count toward the 3-button limit (CLAUDE.md section 4).
 */
export function Layout({ title, spokenIntro, spoken, compact = false, children }: LayoutProps) {
  const { enabled, toggle, speak } = useReadAloud();

  useEffect(() => {
    speak(spoken ?? (spokenIntro ? `${title}. ${spokenIntro}` : title));
  }, [speak, title, spokenIntro, spoken]);

  return (
    <div className={`mx-auto flex max-w-3xl flex-col px-4 py-4 sm:px-8 ${compact ? "h-dvh" : "min-h-screen"}`}>
      <header className="grid grid-cols-[auto_1fr] gap-3 sm:flex sm:gap-4" aria-label="Top bar">
        <Link to={PATIENT_HOME} className={topBarButton}>
          <House aria-hidden="true" className="size-7 shrink-0" />
          <span>{copy.nav.home}</span>
        </Link>
        <button type="button" onClick={toggle} aria-pressed={enabled} className={topBarButton}>
          {enabled ? (
            <Volume2 aria-hidden="true" className="size-7 shrink-0" />
          ) : (
            <VolumeX aria-hidden="true" className="size-7 shrink-0" />
          )}
          <span>{enabled ? copy.nav.readAloudOn : copy.nav.readAloudOff}</span>
        </button>
      </header>
      <main className={compact ? "flex min-h-0 flex-1 flex-col gap-3 pt-3" : "flex flex-1 flex-col gap-8 py-8"}>
        <h1 className={compact ? "sr-only" : "text-4xl font-bold leading-tight"}>{title}</h1>
        {children}
      </main>
    </div>
  );
}
