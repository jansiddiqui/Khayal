import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Role } from "../api/client";
import { copy } from "../copy";

// The public landing page is its own chunk: signed-in people never download it.
const Landing = lazy(() => import("../pages/landing/Landing"));
import { homePathFor, useAuth } from "./AuthContext";

/** Only render children for a signed-in user with `role`; otherwise send them where they belong. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return <p className="p-8 text-2xl">{copy.common.loading}</p>;
  }
  if (state.status === "anonymous") {
    return <Navigate to={role === "patient" ? "/pair" : "/login"} replace state={{ from: location.pathname }} />;
  }
  if (state.user.role !== role) {
    return <Navigate to={homePathFor(state.user)} replace />;
  }
  return <>{children}</>;
}

/**
 * `/` sends signed-in people to their home. Everyone else gets the public landing page
 * (CLAUDE.md section 11); a patient's device is paired from there ("Enter the 6-digit code").
 */
export function RootRedirect() {
  const { state } = useAuth();
  if (state.status === "loading") return <p className="p-8 text-2xl">{copy.common.loading}</p>;
  if (state.status === "authenticated") return <Navigate to={homePathFor(state.user)} replace />;
  return (
    <Suspense fallback={<p className="p-8 text-2xl">{copy.common.loading}</p>}>
      <Landing />
    </Suspense>
  );
}
