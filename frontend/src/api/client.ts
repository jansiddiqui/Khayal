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
  /** Patients only: home city used by Daily Orientation. */
  city: string | null;
  /** Patients only: games a caregiver fixed in slots 2-3 of today's games. */
  pinned_games: GameType[] | null;
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
  city: string | null;
  pinned_games: GameType[] | null;
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

export type GameType = "memory_match" | "sequence_recall" | "word_recall" | "daily_orientation" | "reaction_tap";

export interface RoundResult {
  correct: boolean;
  /** null when the round has no meaningful reaction time (e.g. a red circle correctly left alone). */
  reaction_ms: number | null;
  hint_used: boolean;
}

export interface SessionInput {
  game_type: GameType;
  started_at: string;
  ended_at: string;
  rounds: RoundResult[];
  /** false when the patient left before the last round. */
  completed: boolean;
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
  avg_reaction_ms: number | null;
  hints_used: number;
  completed: boolean;
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

/**
 * Save a session while the page is being closed. `keepalive` lets the request outlive
 * the page; axios cannot do that.
 */
export function postSessionOnPageHide(input: SessionInput): void {
  const token = tokenStore.get();
  void fetch("/api/sessions", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  }).catch(() => undefined);
}

export interface TodaysGames {
  games: { game_type: GameType; done_today: boolean }[];
  pinned: boolean;
}

export async function getTodaysGames(): Promise<TodaysGames> {
  const { data } = await api.get<TodaysGames>("/me/games/today");
  return data;
}

export interface PatientChanges {
  city?: string | null;
  pinned_games?: GameType[] | null;
}

export async function updatePatient(patientId: number, changes: PatientChanges): Promise<Patient> {
  const { data } = await api.patch<Patient>(`/patients/${patientId}`, changes);
  return data;
}

export async function listSessions(patientId: number): Promise<GameSession[]> {
  const { data } = await api.get<GameSession[]>(`/patients/${patientId}/sessions`);
  return data;
}

export type ReminderType = "medicine" | "meal" | "appointment" | "other";
export type ReminderStatus = "done" | "missed" | "pending";

/** "HH:MM:SS" local wall-clock time from the server. */
export type TimeOfDay = string;

export interface TodayReminder {
  id: number;
  title: string;
  type: ReminderType;
  time_of_day: TimeOfDay;
  status: ReminderStatus;
  /** True once its time has come. */
  due: boolean;
}

export interface Reminder {
  id: number;
  patient_id: number;
  title: string;
  type: ReminderType;
  time_of_day: TimeOfDay;
  /** 0 = Monday ... 6 = Sunday */
  days_of_week: number[];
  active: boolean;
  /** Today's status, or null when not scheduled today. */
  today_status: ReminderStatus | null;
}

export interface ReminderInput {
  title: string;
  type: ReminderType;
  time_of_day: string;
  days_of_week: number[];
  active: boolean;
}

export async function getTodayReminders(): Promise<TodayReminder[]> {
  const { data } = await api.get<TodayReminder[]>("/me/reminders/today");
  return data;
}

export async function markReminderDone(reminderId: number): Promise<Reminder> {
  const { data } = await api.post<Reminder>(`/reminders/${reminderId}/log`, { status: "done" });
  return data;
}

export async function listReminders(patientId: number): Promise<Reminder[]> {
  const { data } = await api.get<Reminder[]>(`/patients/${patientId}/reminders`);
  return data;
}

export async function createReminder(patientId: number, input: ReminderInput): Promise<Reminder> {
  const { data } = await api.post<Reminder>(`/patients/${patientId}/reminders`, input);
  return data;
}

export async function updateReminder(patientId: number, reminderId: number, input: ReminderInput): Promise<Reminder> {
  const { data } = await api.put<Reminder>(`/patients/${patientId}/reminders/${reminderId}`, input);
  return data;
}

export async function deleteReminder(patientId: number, reminderId: number): Promise<void> {
  await api.delete(`/patients/${patientId}/reminders/${reminderId}`);
}

export type AlertType = "decline" | "missed_reminders" | "speech_risk";
export type Severity = "info" | "warning" | "critical";

export interface Alert {
  id: number;
  patient_id: number;
  type: AlertType;
  message: string;
  severity: Severity;
  created_at: string;
  acknowledged: boolean;
}

export async function listAlerts(patientId: number): Promise<Alert[]> {
  const { data } = await api.get<Alert[]>(`/patients/${patientId}/alerts`);
  return data;
}

export async function acknowledgeAlert(alertId: number): Promise<Alert> {
  const { data } = await api.post<Alert>(`/alerts/${alertId}/ack`);
  return data;
}

/** HTTP status of a failed request, if any. */
export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
