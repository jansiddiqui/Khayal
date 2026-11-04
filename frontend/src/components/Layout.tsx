import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { copy } from "../copy";
import { useReadAloud } from "../readAloud/ReadAloudContext";

export const PATIENT_HOME = "/patient";

interface LayoutProps {
  title: string;
  /** Extra text read aloud after the title when read-aloud is on. */
  spokenIntro?: string;
  children: ReactNode;
}

const topBarButton =
  // Icon sits above the words on phones so both top-bar buttons fit on one row.
  "flex min-h-16 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl border-4 border-ink bg-white " +
  "px-3 py-1 text-xl leading-tight font-bold text-ink hover:bg-gray-100 sm:flex-row sm:gap-3 sm:px-5 sm:text-2xl";

/**
 * Accessible patient layout. The top bar (Home + Read aloud) is identical on every
 * patient screen and does not count toward the 3-button limit (CLAUDE.md section 4).
 */
export function Layout({ title, spokenIntro, children }: LayoutProps) {
  const { enabled, toggle, speak } = useReadAloud();

  useEffect(() => {
    speak(spokenIntro ? `${title}. ${spokenIntro}` : title);
  }, [speak, title, spokenIntro]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-4 sm:px-8">
      <header className="grid grid-cols-[auto_1fr] gap-3 sm:flex sm:gap-4" aria-label="Top bar">
        <Link to={PATIENT_HOME} className={topBarButton}>
          <span aria-hidden="true">🏠</span>
          <span>{copy.nav.home}</span>
        </Link>
        <button type="button" onClick={toggle} aria-pressed={enabled} className={topBarButton}>
          <span aria-hidden="true">{enabled ? "🔊" : "🔈"}</span>
          <span>{enabled ? copy.nav.readAloudOn : copy.nav.readAloudOff}</span>
        </button>
      </header>
      <main className="flex flex-1 flex-col gap-8 py-8">
        <h1 className="text-4xl font-bold leading-tight">{title}</h1>
        {children}
      </main>
    </div>
  );
}
