import type { ReactNode } from "react";
import { Link } from "react-router";
import { copy } from "../copy";

export const PATIENT_HOME = "/patient";

interface LayoutProps {
  title: string;
  children: ReactNode;
}

/** Accessible patient layout: big Home button always in the same top-left spot. */
export function Layout({ title, children }: LayoutProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-4 sm:px-8">
      <header className="flex items-center gap-4">
        <Link
          to={PATIENT_HOME}
          className="flex min-h-16 items-center gap-3 rounded-2xl border-4 border-ink bg-white px-6 text-2xl font-bold text-ink hover:bg-gray-100"
        >
          <span aria-hidden="true">🏠</span>
          <span>{copy.nav.home}</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-8 py-8">
        <h1 className="text-4xl font-bold leading-tight">{title}</h1>
        {children}
      </main>
    </div>
  );
}
