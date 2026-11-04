import type { ReactNode } from "react";
import { Link } from "react-router";

/** Caregiver UI is a normal, denser dashboard layout. */
export function CaregiverLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-sm">
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link to="/caregiver" className="text-lg font-bold text-brand-dark">
            Khayal · Caregiver
          </Link>
          <Link to="/caregiver" className="text-gray-700 hover:text-ink">
            Dashboard
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  );
}
