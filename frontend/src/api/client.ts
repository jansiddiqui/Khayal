import axios from "axios";

// Vite dev server proxies /api to the FastAPI backend (see vite.config.ts).
export const api = axios.create({ baseURL: "/api" });

const TOKEN_KEY = "khayal.token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage unavailable (private mode); the session just won't persist.
    }
  },
};

api.interceptors.request.use((request) => {
  const token = tokenStore.get();
  if (token) request.headers.set("Authorization", `Bearer ${token}`);
  return request;
});

export type Role = "patient" | "caregiver";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface Patient {
  id: number;
  name: string;
  email: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export interface Health {
  status: "ok";
  app: string;
}

export async function getHealth(): Promise<Health> {
  const { data } = await api.get<Health>("/health");
  return data;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/login", { email, password });
  return data;
}

export async function register(input: RegisterInput): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/register", input);
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export async function listPatients(): Promise<Patient[]> {
  const { data } = await api.get<Patient[]>("/patients");
  return data;
}

export async function linkPatient(patientEmail: string): Promise<Patient> {
  const { data } = await api.post<Patient>("/patients/link", { patient_email: patientEmail });
  return data;
}

export type GameType = "memory_match" | "sequence_recall";

export interface RoundResult {
  correct: boolean;
  reaction_ms: number;
  hint_used: boolean;
}

export interface SessionInput {
  game_type: GameType;
  started_at: string;
  ended_at: string;
  rounds: RoundResult[];
}

export interface GameSession {
  id: number;
  patient_id: number;
  game_type: GameType;
  level_start: number;
  level_end: number;
  started_at: string;
  ended_at: string;
  rounds_played: number;
  rounds_correct: number;
  avg_reaction_ms: number;
  hints_used: number;
}

export type LevelChange = "up" | "down" | "same";

export interface SessionResult {
  session: GameSession;
  new_level: number;
  level_change: LevelChange;
}

export async function getLevel(gameType: GameType): Promise<number> {
  const { data } = await api.get<{ game_type: GameType; level: number }>(`/games/${gameType}/level`);
  return data.level;
}

export async function postSession(input: SessionInput): Promise<SessionResult> {
  const { data } = await api.post<SessionResult>("/sessions", input);
  return data;
}

export async function listSessions(patientId: number): Promise<GameSession[]> {
  const { data } = await api.get<GameSession[]>(`/patients/${patientId}/sessions`);
  return data;
}

/** HTTP status of a failed request, if any. */
export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
