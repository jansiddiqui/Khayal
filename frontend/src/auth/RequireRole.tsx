import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Role } from "../api/client";
import { useAppConfigState } from "../api/useAppConfig";
import { copy } from "../copy";
import { Welcome, WelcomeWaiting } from "../pages/Welcome";
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
 * `/` sends people to their home. A device that is not signed in starts at "Pair a device",
 * except in the public demo, where visitors get a welcome page (try the demo, or pair).
 */
export function RootRedirect() {
  const { state } = useAuth();
  const { config, waking } = useAppConfigState();
  if (state.status === "loading") return <p className="p-8 text-2xl">{copy.common.loading}</p>;
  if (state.status === "authenticated") return <Navigate to={homePathFor(state.user)} replace />;
  if (config) return config.demo_mode ? <Welcome /> : <Navigate to="/pair" replace />;
  return waking ? <WelcomeWaiting /> : <p className="p-8 text-2xl">{copy.common.loading}</p>;
}
