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

export type IndexStatus = "insufficient" | "stable" | "watch" | "declining";
export type DeclineStatus = "insufficient" | "stable" | "warning" | "critical";

/** A linked patient with the overall cognitive index for the dashboard list. */
export interface PatientSummary extends Patient {
  cognitive_index: number | null;
  cognitive_status: IndexStatus;
}

export async function listPatients(): Promise<PatientSummary[]> {
  const { data } = await api.get<PatientSummary[]>("/patients");
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
  /** How long the patient looked before playing (Memory Match preview, Word Recall words); null otherwise. */
  study_ms?: number | null;
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
  /** Who marked today's occurrence done, if anyone. */
  today_marked_by: "patient" | "caregiver" | null;
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

/** Over the last `days` days; `rate` counts only reminders the patient marked done themself. */
export interface Adherence {
  days: number;
  done_by_patient: number;
  done_by_caregiver: number;
  missed: number;
  rate: number | null;
}

export async function getAdherence(patientId: number, days = 7): Promise<Adherence> {
  const { data } = await api.get<Adherence>(`/patients/${patientId}/reminders/adherence`, { params: { days } });
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

export interface FamilyPhoto {
  id: string;
  /** Path under /api; fetch it with `fetchPhotoBlob` (needs the login token). */
  url: string;
}

export interface FamilyMember {
  id: number;
  patient_id: number;
  name: string;
  relation: string;
  note: string | null;
  photos: FamilyPhoto[];
}

export interface FamilyMemberInput {
  name: string;
  relation: string;
  note: string | null;
}

export async function listFamily(patientId: number): Promise<FamilyMember[]> {
  const { data } = await api.get<FamilyMember[]>(`/patients/${patientId}/family`);
  return data;
}

export async function createFamilyMember(patientId: number, input: FamilyMemberInput): Promise<FamilyMember> {
  const { data } = await api.post<FamilyMember>(`/patients/${patientId}/family`, input);
  return data;
}

export async function updateFamilyMember(patientId: number, memberId: number, input: FamilyMemberInput): Promise<FamilyMember> {
  const { data } = await api.put<FamilyMember>(`/patients/${patientId}/family/${memberId}`, input);
  return data;
}

export async function deleteFamilyMember(patientId: number, memberId: number): Promise<void> {
  await api.delete(`/patients/${patientId}/family/${memberId}`);
}

/** Sends the image file itself as the request body. */
export async function uploadFamilyPhoto(patientId: number, memberId: number, file: File): Promise<FamilyMember> {
  const { data } = await api.post<FamilyMember>(`/patients/${patientId}/family/${memberId}/photos`, file, {
    headers: { "Content-Type": file.type },
  });
  return data;
}

export async function deleteFamilyPhoto(patientId: number, memberId: number, photoId: string): Promise<FamilyMember> {
  const { data } = await api.delete<FamilyMember>(`/patients/${patientId}/family/${memberId}/photos/${photoId}`);
  return data;
}

/** Private photos are never public URLs, so they are fetched with the token and shown as blobs. */
export async function fetchPhotoBlob(url: string): Promise<Blob> {
  const { data } = await api.get<Blob>(url, { responseType: "blob" });
  return data;
}

export interface TrendPoint {
  session_id: number;
  started_at: string;
  composite: number;
  rolling_mean: number | null;
  z: number | null;
}

export interface GameTrend {
  game_type: GameType;
  status: DeclineStatus;
  z: number | null;
  score: number | null;
  baseline_mean: number | null;
  baseline_std: number | null;
  sessions: number;
  /** Completed sessions before z exists: 5 warm-up + 10 baseline. */
  sessions_needed: number;
  /** z before clipping to [−4, 4]. */
  z_raw: number | null;
  explanation: string;
  points: TrendPoint[];
}

export interface Trend {
  cognitive_index: number | null;
  cognitive_status: IndexStatus;
  index_history: { date: string; index: number }[];
  games: GameTrend[];
}

export async function getTrend(patientId: number): Promise<Trend> {
  const { data } = await api.get<Trend>(`/patients/${patientId}/trend`);
  return data;
}

/** Secondary signals over the last `days` days (shown, no alerts yet). */
export interface Signals {
  days: number;
  sessions: number;
  stopped_early_rate: number | null;
  hint_rate: number | null;
  adherence: Adherence;
}

export async function getSignals(patientId: number): Promise<Signals> {
  const { data } = await api.get<Signals>(`/patients/${patientId}/signals`);
  return data;
}

/** HTTP status of a failed request, if any. */
export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/** The server's `detail` message of a failed request, if it sent one. */
export function errorDetail(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const detail: unknown = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === "string" ? detail : undefined;
}
