import axios, { AxiosError, type AxiosResponse } from "axios";
import { shrinkPhoto } from "./photoResize";

/**
 * Where the backend lives. In development the Vite dev server proxies /api to FastAPI
 * (vite.config.ts), so VITE_API_URL stays unset. A deployed frontend sets it at build time
 * to the backend's address, e.g. https://khayal-api.example.app (with or without /api).
 */
export function apiBase(url: string | undefined = import.meta.env.VITE_API_URL): string {
  const origin = (url ?? "").trim().replace(/\/+$/, "");
  if (!origin) return "/api";
  return origin.endsWith("/api") ? origin : `${origin}/api`;
}

export const API_BASE = apiBase();

/**
 * A production build without VITE_API_URL sends API calls to the frontend's own address,
 * where the host answers with index.html. Say so loudly in the console. Returns whether the
 * setting looks right.
 */
export function checkApiUrl(
  env: { PROD: boolean; VITE_API_URL?: string } = import.meta.env,
  log: (message: string) => void = console.error,
): boolean {
  if (!env.PROD || (env.VITE_API_URL ?? "").trim() !== "") return true;
  log(
    "Khayal: VITE_API_URL was empty when this frontend was built, so API calls go to this site's own address " +
      "and get the web page instead of the backend. Set VITE_API_URL (marked build-time) to the backend's address, " +
      "e.g. https://khayal-api.example.app, and redeploy the frontend. See docs/DEPLOY-VOROA.md.",
  );
  return false;
}

checkApiUrl();

export const api = axios.create({ baseURL: API_BASE });

/**
 * Every JSON API response must really be JSON. If the frontend calls the wrong address (for
 * example a build without VITE_API_URL), the host answers 200 with index.html; treat that as a
 * failed request, so screens show their error or "waking up" state instead of misreading it.
 * Blob downloads (photos, recordings) and empty answers (204) are not checked.
 */
export function isJsonResponse(response: AxiosResponse): boolean {
  const expectsJson = response.config.responseType === undefined || response.config.responseType === "json";
  const empty = response.status === 204 || response.data === "" || response.data === undefined || response.data === null;
  if (!expectsJson || empty) return true;
  const type = String(response.headers["content-type"] ?? "").toLowerCase();
  return type.includes("application/json") || type.includes("+json");
}

api.interceptors.response.use((response) => {
  if (isJsonResponse(response)) return response;
  // No `response` on the error, so callers never mistake it for a real answer with a status.
  throw new AxiosError(
    `Expected JSON from ${response.config.url ?? "the API"} but got ${String(response.headers["content-type"] ?? "no content type")}`,
    "ERR_NOT_JSON",
    response.config,
    response.request,
  );
});

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
  /** Caregivers only: elders added by a caregiver have no email (they pair a device instead). */
  email: string | null;
  role: Role;
  created_at: string;
  /** Patients only: home city used by Daily Orientation. */
  city: string | null;
  /** Patients only: games a caregiver fixed in slots 2-3 of today's games. */
  pinned_games: GameType[] | null;
  /** Patients only: the caregiver's consent for the weekly voice task. */
  voice_task_enabled: boolean;
  /** When the voice task was turned on; null while it is off. */
  voice_consent_at: string | null;
  /** Public demo only: when this account and its data are deleted. */
  demo_expires_at?: string | null;
  /** Patients only: family photos (and the elder's own photo) are opted in. */
  photos_enabled?: boolean;
  has_photo?: boolean;
  /** Caregivers only: may open the admin page. */
  is_admin?: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface Patient {
  id: number;
  name: string;
  city: string | null;
  pinned_games: GameType[] | null;
  voice_task_enabled: boolean;
  voice_consent_at: string | null;
  photos_enabled: boolean;
  has_photo: boolean;
}

/** Caregiver sign-up: with an invite link or a family share link (admins need none). */
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  invite_token?: string;
  /** Agreement to the privacy policy and terms; recorded with the policy version. */
  consent: true;
}

/** Passwords need at least this many characters (the backend checks it too). */
export const PASSWORD_MIN = 10;

export interface InviteCheck {
  kind: "signup" | "share";
  elder_name: string | null;
  expires_at: string;
}

export async function checkInvite(token: string): Promise<InviteCheck> {
  const { data } = await api.get<InviteCheck>(`/auth/invite/${encodeURIComponent(token)}`);
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/password", { current_password: currentPassword, new_password: newPassword });
  return data;
}

export async function resetPassword(token: string, newPassword: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/reset", { token, new_password: newPassword });
  return data;
}

/** A secret link's token (shown once); the page builds the full address. */
export interface SecretLink {
  id: number;
  token: string;
  expires_at: string;
}

export type LinkState = "open" | "used" | "revoked" | "expired";

/** The full address of an invite, share or reset link on this site. */
export function linkUrl(kind: "join" | "share" | "reset", token: string): string {
  return `${window.location.origin}/${kind}/${token}`;
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

/** A patient's device signs in with the caregiver's 6-digit code (stays signed in for 90 days). */
export async function pairDevice(code: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/pair", { code });
  return data;
}

export interface PairingCode {
  code: string;
  expires_at: string;
}

export async function createPairingCode(patientId: number): Promise<PairingCode> {
  const { data } = await api.post<PairingCode>(`/patients/${patientId}/pairing-code`);
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

/** Public settings from the backend: demo mode and the voice task's length. */
export interface AppConfig {
  demo_mode: boolean;
  recording_limit_seconds: number;
  demo_account_days: number;
  /** Where people can write to the team; null when not configured. */
  contact_email?: string | null;
}

export async function getAppConfig(): Promise<AppConfig> {
  // A short timeout: a sleeping server is retried (useAppConfig) instead of hanging the screen.
  const { data } = await api.get<AppConfig>("/config", { timeout: 10_000 });
  return data;
}

/** "Request an invite" on the landing page (public, rate-limited). */
export type InviteRole = "family" | "doctor" | "care_home";

export interface InviteRequestInput {
  name: string;
  email: string;
  role: InviteRole;
  city: string;
  message?: string;
  consent: true;
  /** Hidden honeypot: people leave it empty. */
  website?: string;
}

export async function requestInvite(input: InviteRequestInput): Promise<void> {
  await api.post("/invites", input);
}

/** "Try the demo": a fresh caregiver (signed in) with private demo patients. */
export interface DemoStart extends TokenResponse {
  patient_id: number;
  patient_name: string;
  pairing: PairingCode;
}

export async function startDemo(): Promise<DemoStart> {
  const { data } = await api.post<DemoStart>("/demo/start");
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

/** Adding the elder a caregiver looks after: no email needed, with the consents given in the same form. */
export interface AddElderInput {
  name: string;
  city?: string;
  is_family_or_guardian: true;
  basis: "elder_agreed" | "legal_authority";
  photos: boolean;
  voice: boolean;
}

export async function addElder(input: AddElderInput): Promise<Patient> {
  const { data } = await api.post<Patient>("/patients", input);
  return data;
}

/** The elder's own photo, made small in the browser first (photoResize.ts). */
export async function uploadElderPhoto(patientId: number, file: File): Promise<Patient> {
  const photo = await shrinkPhoto(file);
  const { data } = await api.post<Patient>(`/patients/${patientId}/photo`, photo, { headers: { "Content-Type": photo.type } });
  return data;
}

export async function deleteElderPhoto(patientId: number): Promise<Patient> {
  const { data } = await api.delete<Patient>(`/patients/${patientId}/photo`);
  return data;
}

export interface ConsentRecord {
  id: number;
  kind: "processing" | "elder_on_behalf" | "photos" | "voice";
  basis: string | null;
  policy_version: string;
  granted_at: string;
  withdrawn_at: string | null;
  patient_id: number | null;
}

export async function listElderConsents(patientId: number): Promise<ConsentRecord[]> {
  const { data } = await api.get<ConsentRecord[]>(`/patients/${patientId}/consents`);
  return data;
}

/** Opt in to, or withdraw, family photos or voice recordings. Withdrawing deletes that data. */
export async function setElderConsent(patientId: number, kind: "photos" | "voice", granted: boolean): Promise<{ patient: Patient; deleted: number }> {
  const { data } = await api.post<{ patient: Patient; deleted: number }>(`/patients/${patientId}/consents`, { kind, granted });
  return data;
}

export interface Device {
  id: number;
  device_label: string;
  created_at: string;
  last_seen_at: string;
}

export async function listDevices(patientId: number): Promise<Device[]> {
  const { data } = await api.get<Device[]>(`/patients/${patientId}/devices`);
  return data;
}

export async function revokeDevice(patientId: number, deviceId: number): Promise<void> {
  await api.post(`/patients/${patientId}/devices/${deviceId}/revoke`);
}

export async function signOutAllDevices(patientId: number): Promise<void> {
  await api.post(`/patients/${patientId}/devices/sign-out-all`);
}

export interface Share {
  id: number;
  created_at: string;
  expires_at: string;
  state: LinkState;
}

export async function createShare(patientId: number): Promise<SecretLink> {
  const { data } = await api.post<SecretLink>(`/patients/${patientId}/shares`);
  return data;
}

export async function listShares(patientId: number): Promise<Share[]> {
  const { data } = await api.get<Share[]>(`/patients/${patientId}/shares`);
  return data;
}

export async function revokeShare(patientId: number, shareId: number): Promise<void> {
  await api.post(`/patients/${patientId}/shares/${shareId}/revoke`);
}

export async function acceptShare(token: string): Promise<Patient> {
  const { data } = await api.post<Patient>("/shares/accept", { token });
  return data;
}

// --- my account ---

export async function myConsents(): Promise<ConsentRecord[]> {
  const { data } = await api.get<ConsentRecord[]>("/me/consents");
  return data;
}

export async function exportMyData(): Promise<Blob> {
  const { data } = await api.get<Blob>("/me/export", { responseType: "blob" });
  return data;
}

export async function deleteMyAccount(password: string): Promise<{ removed: number }> {
  const { data } = await api.post<{ removed: number }>("/me/delete", { confirm: "DELETE", password });
  return data;
}

// --- admin ---

export interface AdminInviteRequest {
  id: number;
  name: string;
  email: string;
  role: "family" | "doctor" | "care_home";
  city: string;
  message: string | null;
  status: "new" | "invited" | "declined";
  created_at: string;
}

export interface AdminInvite {
  id: number;
  note: string;
  created_at: string;
  expires_at: string;
  state: LinkState;
  used_by_email: string | null;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string | null;
  role: Role;
  created_at: string;
  is_admin: boolean;
  is_demo: boolean;
  elders: number;
}

export const admin = {
  requests: async () => (await api.get<AdminInviteRequest[]>("/admin/invite-requests")).data,
  approve: async (id: number) => (await api.post<SecretLink>(`/admin/invite-requests/${id}/approve`)).data,
  reject: async (id: number) => {
    await api.post(`/admin/invite-requests/${id}/reject`);
  },
  invites: async () => (await api.get<AdminInvite[]>("/admin/invites")).data,
  invite: async (note: string) => (await api.post<SecretLink>("/admin/invites", { note })).data,
  revokeInvite: async (id: number) => {
    await api.post(`/admin/invites/${id}/revoke`);
  },
  users: async () => (await api.get<AdminUser[]>("/admin/users")).data,
  resetLink: async (userId: number) => (await api.post<SecretLink>(`/admin/users/${userId}/reset-link`)).data,
  demoCount: async () => (await api.get<{ count: number }>("/admin/demo-accounts")).data.count,
  removeDemo: async (confirmCount: number) =>
    (await api.post<{ removed: number }>("/admin/demo-accounts/remove", { confirm_count: confirmCount })).data.removed,
  /** The full backup zip (every table plus every photo and recording), with the server's file name. */
  backup: async (): Promise<{ blob: Blob; fileName: string }> => {
    const response = await api.get<Blob>("/admin/backup", { responseType: "blob" });
    const disposition = String(response.headers["content-disposition"] ?? "");
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `khayal-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    return { blob: response.data, fileName };
  },
};

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
  void fetch(`${API_BASE}/sessions`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  }).catch(() => undefined);
}

/** The weekly "Tell me about a picture" task; replaces slot 3 of today's games when due. */
export const VOICE_TASK = "voice_task";

export interface TodaysGames {
  games: { game_type: GameType | typeof VOICE_TASK; done_today: boolean }[];
  pinned: boolean;
}

export async function getTodaysGames(): Promise<TodaysGames> {
  const { data } = await api.get<TodaysGames>("/me/games/today");
  return data;
}

export interface PatientChanges {
  city?: string | null;
  pinned_games?: GameType[] | null;
  voice_task_enabled?: boolean;
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

/** Uploads give up after this long, so a request that never gets an answer cannot hang the screen. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** An upload that got no answer within UPLOAD_TIMEOUT_MS (the request was cancelled). */
export class UploadTimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`No answer from the server after ${Math.round(ms / 1000)} seconds.`);
    this.name = "UploadTimeoutError";
  }
}

/**
 * Sends the image itself as the request body (resize it first with `shrinkPhoto`); cancelled after
 * UPLOAD_TIMEOUT_MS. `onProgress` gets the share of the file sent so far, from 0 to 1.
 */
export async function uploadFamilyPhoto(
  patientId: number,
  memberId: number,
  photo: Blob,
  onProgress?: (fraction: number) => void,
): Promise<FamilyMember> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPLOAD_TIMEOUT_MS);
  try {
    const { data } = await api.post<FamilyMember>(`/patients/${patientId}/family/${memberId}/photos`, photo, {
      headers: { "Content-Type": photo.type },
      signal: controller.signal,
      onUploadProgress: (event) => {
        const total = event.total ?? photo.size;
        if (onProgress && total > 0) onProgress(Math.min(1, event.loaded / total));
      },
    });
    return data;
  } catch (error) {
    if (timedOut) throw new UploadTimeoutError(UPLOAD_TIMEOUT_MS);
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
  /** Alert status (warning/critical thresholds). */
  status: DeclineStatus;
  /** The shared display scale, the same as the overall index. */
  trend_status: IndexStatus;
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

/**
 * What went wrong with a request, for people to read and report: the HTTP status and the server's
 * message ("Error 413: Photos must be 5 MB or smaller."), a timeout, or why there was no answer.
 */
export function describeRequestError(error: unknown): string {
  if (error instanceof UploadTimeoutError) return error.message;
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const message = errorDetail(error) ?? (error.response.statusText || error.message);
      return `Error ${error.response.status}: ${message}`;
    }
    return `No answer from the server (${error.message}).`;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** The server's `detail` message of a failed request, if it sent one. */
export function errorDetail(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const detail: unknown = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === "string" ? detail : undefined;
}

/** A voice-task recording. transcript and risk_score stay null until a real model exists. */
export interface SpeechSample {
  id: number;
  recorded_at: string;
  duration_ms: number;
  transcript: string | null;
  risk_score: number | null;
  model_version: string;
  /** Path under /api; fetch it with `fetchAudioBlob` (needs the login token). */
  audio_url: string;
}

/** The recording is the request body itself, with its own Content-Type (no multipart form). */
export async function uploadRecording(audio: Blob, durationMs: number): Promise<SpeechSample> {
  const { data } = await api.post<SpeechSample>("/speech", audio, {
    params: { duration_ms: Math.max(1, Math.round(durationMs)) },
    headers: { "Content-Type": audio.type || "audio/webm" },
  });
  return data;
}

export async function listRecordings(patientId: number): Promise<SpeechSample[]> {
  const { data } = await api.get<SpeechSample[]>(`/patients/${patientId}/speech`);
  return data;
}

/** Private recordings are never public URLs, so they are fetched with the token and played as blobs. */
export async function fetchAudioBlob(url: string): Promise<Blob> {
  const { data } = await api.get<Blob>(url, { responseType: "blob" });
  return data;
}
