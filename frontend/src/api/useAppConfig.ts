import { useQuery } from "@tanstack/react-query";
import { getAppConfig, type AppConfig } from "./client";

/** The backend's public settings, fetched once per visit. Undefined while loading or if unreachable. */
export function useAppConfig(): AppConfig | undefined {
  const query = useQuery({ queryKey: ["appConfig"], queryFn: getAppConfig, staleTime: Infinity, retry: 1 });
  return query.data;
}
