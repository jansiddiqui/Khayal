import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../ui/Button";
import { FeedbackButton } from "./caregiver/FeedbackDialog";
import { calm, DURATION, useLessMotion } from "../ui/motion";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `relative rounded-md px-2 py-1 transition-colors duration-150 ease-calm hover:bg-brand-soft hover:text-ink ${
    isActive ? "font-semibold text-ink after:absolute after:inset-x-2 after:-bottom-[0.85rem] after:h-0.5 after:rounded-full after:bg-brand" : "text-ink-soft"
  }`;

/**
 * Caregiver UI: a calm, denser dashboard in Inter on a quiet near-white canvas (theme.css). The
 * current section is marked in the header; each page settles in with a short fade.
 */
export function CaregiverLayout({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  const { state, logout } = useAuth();
  const less = useLessMotion();
  const { pathname } = useLocation();

  return (
    <div className="caregiver min-h-screen bg-desk text-sm text-ink">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-toast"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/caregiver" className="mr-2 whitespace-nowrap text-lg font-bold text-brand-dark">
            Khayal · Caregiver
          </Link>
          <NavLink to="/caregiver" end className={navLink}>
            Dashboard
          </NavLink>
          <NavLink to="/caregiver/account" className={navLink}>
            Account
          </NavLink>
          {state.status === "authenticated" && state.user.is_admin && (
            <NavLink to="/admin" className={navLink}>
              Admin
            </NavLink>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            <FeedbackButton />
            {state.status === "authenticated" && <span className="whitespace-nowrap text-ink-soft">{state.user.name}</span>}
            <Button size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </nav>
      </header>
      <motion.main
        key={pathname}
        id="content"
        tabIndex={-1}
        initial={less ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={calm(DURATION.base)}
        className="mx-auto max-w-6xl px-4 py-6 outline-none sm:px-6"
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {meta}
        </div>
        {children}
      </motion.main>
    </div>
  );
}
