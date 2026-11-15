import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as apiClient from "../api/client";
import type { DemoStart, RegisterInput, TokenResponse, User } from "../api/client";

type AuthState = { status: "loading" } | { status: "anonymous" } | { status: "authenticated"; user: User };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  /** Use a fresh token from the server (after a password change or reset). */
  adopt: (response: TokenResponse) => User;
  /** Sign this device in as a patient with a caregiver's pairing code. */
  pair: (code: string) => Promise<User>;
  /** Public demo: make a fresh demo caregiver, sign in as them, and return the pairing code. */
  startDemo: () => Promise<DemoStart>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(() =>
    apiClient.tokenStore.get() ? { status: "loading" } : { status: "anonymous" },
  );

  useEffect(() => {
    if (state.status !== "loading") return;
    let cancelled = false;
    apiClient
      .getMe()
      .then((user) => !cancelled && setState({ status: "authenticated", user }))
      .catch(() => {
        apiClient.tokenStore.set(null);
        if (!cancelled) setState({ status: "anonymous" });
      });
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  const accept = useCallback((response: TokenResponse): User => {
    apiClient.tokenStore.set(response.access_token);
    setState({ status: "authenticated", user: response.user });
    return response.user;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (email, password) => accept(await apiClient.login(email, password)),
      register: async (input) => accept(await apiClient.register(input)),
      adopt: accept,
      pair: async (code) => accept(await apiClient.pairDevice(code)),
      startDemo: async () => {
        const started = await apiClient.startDemo();
        accept(started);
        return started;
      },
      logout: () => {
        apiClient.tokenStore.set(null);
        queryClient.clear();
        setState({ status: "anonymous" });
      },
    }),
    [state, accept, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function homePathFor(user: User): string {
  return user.role === "patient" ? "/patient" : "/caregiver";
}
