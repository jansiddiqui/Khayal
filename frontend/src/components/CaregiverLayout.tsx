import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";

/** Caregiver UI: a calm, denser dashboard in Inter on a quiet near-white canvas (theme.css). */
export function CaregiverLayout({ title, children }: { title: string; children: ReactNode }) {
  const { state, logout } = useAuth();

  return (
    <div className="caregiver min-h-screen bg-desk text-sm text-ink">
      <header className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/caregiver" className="whitespace-nowrap text-lg font-bold text-brand-dark">
            Khayal · Caregiver
          </Link>
          <Link to="/caregiver" className="text-ink-soft hover:text-ink">
            Dashboard
          </Link>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {state.status === "authenticated" && <span className="whitespace-nowrap text-ink-soft">{state.user.name}</span>}
            <button type="button" onClick={logout} className="whitespace-nowrap rounded-md border border-line-strong px-3 py-1 hover:bg-sunken">
              Sign out
            </button>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  );
}
