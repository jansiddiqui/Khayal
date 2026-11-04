import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Role } from "../api/client";
import { copy } from "../copy";
import { homePathFor, useAuth } from "./AuthContext";

/** Only render children for a signed-in user with `role`; otherwise send them where they belong. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return <p className="p-8 text-2xl">{copy.common.loading}</p>;
  }
  if (state.status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (state.user.role !== role) {
    return <Navigate to={homePathFor(state.user)} replace />;
  }
  return <>{children}</>;
}

/** `/` sends people to their home, or to sign in. */
export function RootRedirect() {
  const { state } = useAuth();
  if (state.status === "loading") return <p className="p-8 text-2xl">{copy.common.loading}</p>;
  if (state.status === "anonymous") return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(state.user)} replace />;
}
