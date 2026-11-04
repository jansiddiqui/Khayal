import axios from "axios";

// Vite dev server proxies /api to the FastAPI backend (see vite.config.ts).
export const api = axios.create({ baseURL: "/api" });

export interface Health {
  status: "ok";
  app: string;
}

export async function getHealth(): Promise<Health> {
  const { data } = await api.get<Health>("/health");
  return data;
}
