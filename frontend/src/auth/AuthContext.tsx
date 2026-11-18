import { useQueryClient } from "@tanstack/react-query";
import { LANGUAGE } from "../copy";
import { isLanguage, saveLanguage, type Language } from "../i18n/language";
import { isCgLanguage, saveCgLanguage } from "../i18n/caregiverLanguage";
import { CG_LANGUAGE } from "../t";
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

  // The patient app shows the language the family chose for this elder (src/copy.ts); caregiver
  // screens show the caregiver's own choice from Account (batch 5b, src/t.ts). A different
  // language is saved and the app reloads, so every screen switches together.
  useEffect(() => {
    if (state.status !== "authenticated") return;
    const user = state.user;
    const patient = user.role === "patient";
    const wanted: Language = patient && isLanguage(user.language) ? user.language : "en";
    const patientChanged = saveLanguage(wanted, LANGUAGE);
    const caregiverChanged = !patient && saveCgLanguage(isCgLanguage(user.language) ? user.language : "en", CG_LANGUAGE);
    if (patientChanged || caregiverChanged) window.location.reload();
  }, [state]);

  // A change the family makes reaches the elder's phone the next time the app comes to the front.
  useEffect(() => {
    if (state.status !== "authenticated" || state.user.role !== "patient") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      apiClient
        .getMe()
        .then((user) => setState((prev) => (prev.status === "authenticated" && prev.user.language !== user.language ? { status: "authenticated", user } : prev)))
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [state]);

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
