import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getAppConfig, type AppConfig } from "./client";

/** The free backend sleeps when idle; keep asking every few seconds until it answers. */
export const CONFIG_RETRY_MS = 5000;
/** Waiting longer than this for the first answer counts as "waking up" too. */
export const CONFIG_SLOW_MS = 3000;

export interface AppConfigState {
  /** The backend's public settings; undefined until it has answered. */
  config: AppConfig | undefined;
  /** True while the backend has not answered yet after a failure or a slow wait (it is probably waking up). */
  waking: boolean;
}

/** The backend's public settings (demo mode, recording limit), retried until the server answers. */
export function useAppConfigState(): AppConfigState {
  const query = useQuery({
    queryKey: ["appConfig"],
    queryFn: getAppConfig,
    staleTime: Infinity,
    retry: true,
    retryDelay: CONFIG_RETRY_MS,
  });
  const loaded = query.data !== undefined;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setSlow(true), CONFIG_SLOW_MS);
    return () => clearTimeout(timer);
  }, [loaded]);
  return { config: query.data, waking: !loaded && (query.failureCount > 0 || slow) };
}

/** Just the settings: undefined while the backend has not answered. */
export function useAppConfig(): AppConfig | undefined {
  return useAppConfigState().config;
}
