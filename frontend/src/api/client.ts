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
 * A server time as a Date. Postgres sends an offset; SQLite (local development and the demo) sends
 * UTC without one, which a browser would otherwise read as local time (5.5 hours off in India).
 */
export function serverDate(iso: string): Date {
  return new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(iso) ? iso : `${iso}Z`);
}

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
  /** Patients only: festivals the family celebrates (About Today's festival question); null = off. */
  festivals?: string[] | null;
  /** Patients only: the caregiver's consent for the weekly voice task. */
  voice_task_enabled: boolean;
  /** When the voice task was turned on; null while it is off. */
  voice_consent_at: string | null;
  /** Patients only: the app language a caregiver chose ("en", "hi", "ur"; Round 2 batch 5). */
  language?: string;
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
  /** The 4 levelled games tracked for decline (CLAUDE.md section 7, "Core set"). */
  core_games: GameType[];
  core_is_default: boolean;
  /** Festivals the family celebrates; null or empty = the festival question is off. */
  festivals?: string[] | null;
  voice_task_enabled: boolean;
  voice_consent_at: string | null;
  photos_enabled: boolean;
  has_photo: boolean;
  /** The elder's app language and what read-aloud found on their device (Round 2 batch 5). */
  language?: string;
  voice_check?: VoiceCheck | null;
  /** Games outside the core set the family hid from "More games". */
  hidden_games?: GameType[] | null;
}

export interface VoiceCheck {
  lang: string;
  voice: string | null;
  /** The language the chosen voice speaks; "none" = this device can't read the language aloud. */
  using: "en" | "hi" | "ur" | "none";
  checked_at: string;
}

/** The elder's device reports which read-aloud voice it found (Round 2 batch 5). */
export async function reportVoiceCheck(check: Omit<VoiceCheck, "checked_at">): Promise<void> {
  await api.post("/me/voice-check", check);
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
  /** The app clock's offset from UTC in minutes (IST = 330): reminder dates are days on this clock. */
  utc_offset_minutes?: number;
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
  /** When they last used Khayal (device activity or a finished game); null if never. */
  last_active_at?: string | null;
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
  kind: "processing" | "elder_on_behalf" | "photos" | "voice" | "research";
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

/** Opt in to, or withdraw, family photos, voice recordings or research use. Withdrawing photos or
 * voice deletes that data; withdrawing research leaves the elder out of later research exports. */
export async function setElderConsent(patientId: number, kind: "photos" | "voice" | "research", granted: boolean): Promise<{ patient: Patient; deleted: number }> {
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
  users: async (filter: AdminUserFilter = {}) => {
    const params: Record<string, string> = {};
    if (filter.q?.trim()) params.q = filter.q.trim();
    if (filter.role) params.role = filter.role;
    if (filter.kind) params.kind = filter.kind;
    return (await api.get<AdminUser[]>("/admin/users", { params })).data;
  },
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
  overview: async () => (await api.get<PilotOverview>("/admin/overview")).data,
  health: async () => (await api.get<SystemHealth>("/admin/health")).data,
  feedback: async (status?: FeedbackStatus) =>
    (await api.get<AdminFeedback[]>("/admin/feedback", { params: status ? { status } : {} })).data,
  setFeedbackStatus: async (id: number, status: FeedbackStatus) =>
    (await api.post<AdminFeedback>(`/admin/feedback/${id}/status`, { status })).data,
  feedbackVoiceUrl: async (id: number) => {
    const { data } = await api.get<Blob>(`/admin/feedback/${id}/voice`, { responseType: "blob" });
    return URL.createObjectURL(data);
  },
  log: async (action?: string) => (await api.get<AdminLogEntry[]>("/admin/log", { params: action ? { action } : {} })).data,
  /** Anonymised research export (zip): families with an active research consent only. */
  researchExport: async (): Promise<{ blob: Blob; fileName: string }> => {
    const response = await api.get<Blob>("/admin/research-export", { responseType: "blob" });
    const disposition = String(response.headers["content-disposition"] ?? "");
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "khayal-research.zip";
    return { blob: response.data, fileName };
  },
};

export interface AdminUserFilter {
  q?: string;
  role?: Role;
  kind?: "real" | "demo";
}

export interface PilotOverview {
  families: number;
  active_7: number;
  active_30: number;
  caregivers: number;
  sessions_per_day: { date: string; count: number }[];
  funnel: { requested: number; approved: number; invited: number; signed_up: number; paired: number; active: number };
  retention_7: { days: number; eligible: number; retained: number };
  retention_30: { days: number; eligible: number; retained: number };
}

export interface SystemHealth {
  started_at: string;
  uptime_seconds: number;
  last_start_at: string | null;
  last_tick_at: string | null;
  last_housekeeping_at: string | null;
  database: string;
  db_bytes: number | null;
  db_limit_bytes: number;
  db_warning: boolean;
  last_backup_at: string | null;
  last_backup_by: string | null;
  days_since_backup: number | null;
  backup_warning: boolean;
}

export type FeedbackKind = "hard" | "liked" | "other";
export type FeedbackStatus = "new" | "read" | "resolved";

export interface AdminFeedback {
  id: number;
  role: Role;
  kind: FeedbackKind;
  text: string | null;
  page: string | null;
  has_voice: boolean;
  status: FeedbackStatus;
  created_at: string;
  sender: string | null;
}

export interface AdminLogEntry {
  id: number;
  admin_email: string;
  at: string;
  action: string;
  detail: string;
}

/** "Send feedback" (caregivers from the header, patients from the Settings sheet). Returns its id. */
export async function sendFeedback(kind: FeedbackKind, text?: string, page?: string): Promise<number> {
  const { data } = await api.post<{ id: number }>("/feedback", { kind, text: text || undefined, page });
  return data.id;
}

/** A patient's voice note for feedback they just sent (needs the voice opt-in). */
export async function sendFeedbackVoice(id: number, audio: Blob): Promise<void> {
  await api.post(`/feedback/${id}/voice`, audio, { headers: { "Content-Type": audio.type.split(";")[0] || "audio/webm" } });
}

export type GameType = "memory_match" | "sequence_recall" | "word_recall" | "daily_orientation" | "reaction_tap"
  | "colour_trails"
  | "clock_setting"
  | "money_handling"
  | "spatial_span"
  | "object_location"
  | "word_recall_delayed";

export interface RoundResult {
  correct: boolean;
  /** null when the round has no meaningful reaction time (e.g. a red circle correctly left alone). */
  reaction_ms: number | null;
  hint_used: boolean;
  /** How long the patient looked before playing (Memory Match preview, Word Recall words); null otherwise. */
  study_ms?: number | null;
  /**
   * Games v2 (docs/games/research.md D1): wrong placements or taps, the clock's error bits
   * (1 = hour, 2 = minute) or delayed-recall false alarms. Not part of the score.
   */
  errors?: number | null;
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

export interface LevelInfo {
  level: number;
  /** Show the first-time tutorial and a practice round before playing. */
  tutorial: boolean;
}

export async function getLevel(gameType: GameType): Promise<LevelInfo> {
  const { data } = await api.get<{ game_type: GameType; level: number; tutorial?: boolean }>(`/games/${gameType}/level`);
  return { level: data.level, tutorial: data.tutorial ?? false };
}

/** The patient finished the first-time tutorial and practice round for this game. */
export async function markTutorialSeen(gameType: GameType): Promise<void> {
  await api.post(`/games/${gameType}/tutorial-seen`);
}

/** Caregiver: "Show the tutorial again" the next time the patient opens this game. */
export async function resetTutorial(patientId: number, gameType: GameType): Promise<void> {
  await api.post(`/patients/${patientId}/tutorials/${gameType}/reset`);
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

/** "More games": up to 3 levelled games outside the core set, least recently played first. */
export async function getMoreGames(): Promise<TodaysGames["games"]> {
  const { data } = await api.get<TodaysGames["games"]>("/me/games/more");
  return data;
}

/** "See other games": every game outside the core set that the family didn't hide. */
export async function getAllMoreGames(): Promise<TodaysGames["games"]> {
  const { data } = await api.get<TodaysGames["games"]>("/me/games/more/all");
  return data;
}

export interface CatalogGame {
  game_type: GameType;
  /** The domain it mainly tests, e.g. "Verbal memory". */
  domain: string;
}

/** The levelled games and their domains (for the caregiver's core-set picker). */
export async function getGameCatalog(): Promise<CatalogGame[]> {
  const { data } = await api.get<CatalogGame[]>("/games/catalog");
  return data;
}

export interface PatientChanges {
  city?: string | null;
  pinned_games?: GameType[] | null;
  /** Exactly 4 different levelled games; null = the default core set. */
  core_games?: GameType[] | null;
  festivals?: string[] | null;
  voice_task_enabled?: boolean;
  /** The elder's app language (Round 2 batch 5). */
  language?: "en" | "hi" | "ur";
  /** Games outside the core set hidden from "More games"; [] or null = none. */
  hidden_games?: GameType[] | null;
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
export type ReminderStatus = "done" | "missed" | "pending" | "unsure";
/**
 * Where a reminder stands for the patient now (CLAUDE.md section 6, "Overdue reminders"):
 * upcoming (before its time), due (within its on-time window: "It's time for this"), overdue
 * (after it: only "Is it done?"), done, or unsure (answered "No / not sure").
 */
export type ReminderPhase = "upcoming" | "due" | "overdue" | "done" | "unsure";

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
  phase: ReminderPhase;
  /** Done after its on-time window ("confirmed later"). */
  late?: boolean;
  confirmed_at?: string | null;
}

export interface Reminder {
  id: number;
  patient_id: number;
  title: string;
  type: ReminderType;
  time_of_day: TimeOfDay;
  repeat: ReminderRepeat;
  /** 0 = Monday ... 6 = Sunday (all 7 for "daily", none for "once"). */
  days_of_week: number[];
  /** "YYYY-MM-DD" on the app clock: the day of a one-time reminder. */
  on_date: string | null;
  /** First and last day of a repeating reminder (inclusive); no end = until stopped. */
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  /** Its one day or its end date has passed: listed under "Past reminders". */
  past: boolean;
  /** Today's status, or null when not scheduled today. */
  today_status: ReminderStatus | null;
  /** Who marked today's occurrence done, if anyone. */
  today_marked_by: "patient" | "caregiver" | null;
  /** Done today but confirmed only after its on-time window, and when it was confirmed or answered. */
  today_late?: boolean;
  today_logged_at?: string | null;
  /** Medicine only: how long it still says "It's time for this" (null = the standard hour). */
  late_window_minutes?: number | null;
}

/** "once": on `on_date`. "daily": every day. "weekly_days": on `days_of_week`. */
export type ReminderRepeat = "once" | "daily" | "weekly_days";

export interface ReminderInput {
  title: string;
  type: ReminderType;
  time_of_day: string;
  repeat: ReminderRepeat;
  days_of_week: number[];
  on_date: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  /** Medicine only: the safe late window in minutes, or null for the standard hour. */
  late_window_minutes?: number | null;
}

export async function getTodayReminders(): Promise<TodayReminder[]> {
  const { data } = await api.get<TodayReminder[]>("/me/reminders/today");
  return data;
}

export async function markReminderDone(reminderId: number): Promise<Reminder> {
  const { data } = await api.post<Reminder>(`/reminders/${reminderId}/log`, { status: "done" });
  return data;
}

/** The patient's "No / not sure" after a reminder's time: the family is told at once. */
export async function markReminderUnsure(reminderId: number): Promise<Reminder> {
  const { data } = await api.post<Reminder>(`/reminders/${reminderId}/log`, { status: "unsure" });
  return data;
}

/** Over the last `days` days; `rate` counts only reminders the patient marked done themself. */
export interface Adherence {
  days: number;
  done_by_patient: number;
  done_by_caregiver: number;
  missed: number;
  /** Done but confirmed later (already counted as done), and "not sure" answers. */
  done_late?: number;
  unsure?: number;
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

export type AlertType = "decline" | "missed_reminders" | "speech_risk" | "reminder_unsure";
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

/** Acknowledge a group of alerts, or (no ids) every new alert for the patient. */
export async function acknowledgeAlerts(patientId: number, ids?: number[]): Promise<number> {
  const { data } = await api.post<{ acknowledged: number }>(`/patients/${patientId}/alerts/ack`, ids ? { ids } : {});
  return data.acknowledged;
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

// --- caregiver views (Round 2 batch 2) ----------------------------------------------------

export type Tone = "good" | "neutral" | "attention";
export type NextActionKind = "check_dose" | "missed_dose" | "alerts" | "pair" | "add_reminders" | "inactive" | "all_good";

export interface Glance {
  patient_id: number;
  name: string;
  cognitive_status: IndexStatus;
  games_done: number;
  games_total: number;
  medicines: { taken: number; missed: number; unsure: number; to_come: number };
  alerts_open: number;
  last_active_at: string | null;
  next_action: { kind: NextActionKind; text: string };
}

export interface Insight {
  key: string;
  tone: Tone;
  text: string;
  detail: string;
}

export interface DoseWeek {
  taken: number;
  taken_late: number;
  missed: number;
  unsure: number;
}

export interface WeekStats {
  start: string;
  end: string;
  days_played: number;
  sessions: number;
  completed: number;
  accuracy: number | null;
  doses: DoseWeek;
  reminders_done: number;
  reminders_total: number;
  alerts: number;
  recordings: number;
  mood: { good: number; okay: number; not_so_good: number; skipped: number };
}

export interface Weekly {
  this_week: WeekStats;
  last_week: WeekStats;
}

export type TimelineKind = "session" | "reminder" | "alert" | "recording" | "settings" | "mood";

export interface TimelineEvent {
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  tone: Tone;
  game_type: GameType | null;
}

export interface ReportGame {
  game_type: GameType;
  sessions: number;
  first_half: number | null;
  second_half: number | null;
  z: number | null;
  status: IndexStatus;
  sessions_to_baseline: number;
  points: { day: string; composite: number }[];
}

export interface DoctorReport {
  patient_id: number;
  name: string;
  start: string;
  end: string;
  days: number;
  generated_at: string;
  cognitive_index: number | null;
  cognitive_status: IndexStatus;
  games: ReportGame[];
  doses: DoseWeek;
  reminders_done: number;
  reminders_total: number;
  alerts: Alert[];
  recordings: number;
  days_played: number;
  mood: { good: number; okay: number; not_so_good: number; skipped: number };
  mood_days: { date: string; mood: "good" | "okay" | "not_so_good" | null }[];
}

export async function getGlance(): Promise<Glance[]> {
  const { data } = await api.get<Glance[]>("/caregiver/glance");
  return data;
}

export async function getInsights(patientId: number): Promise<Insight[]> {
  const { data } = await api.get<Insight[]>(`/patients/${patientId}/insights`);
  return data;
}

export async function getWeekly(patientId: number): Promise<Weekly> {
  const { data } = await api.get<Weekly>(`/patients/${patientId}/weekly`);
  return data;
}

export async function getTimeline(patientId: number, days: number, kinds: readonly TimelineKind[]): Promise<TimelineEvent[]> {
  const params = new URLSearchParams({ days: String(days) });
  for (const k of kinds) params.append("kinds", k);
  const { data } = await api.get<TimelineEvent[]>(`/patients/${patientId}/timeline?${params.toString()}`);
  return data;
}

export async function getReport(patientId: number, days: number): Promise<DoctorReport> {
  const { data } = await api.get<DoctorReport>(`/patients/${patientId}/report`, { params: { days } });
  return data;
}


// --- mood and memory book (Round 2 batch 4) -----------------------------------------------

export type Mood = "good" | "okay" | "not_so_good";

export interface MoodToday {
  asked: boolean;
  mood: Mood | null;
}

export interface MoodDay {
  date: string;
  mood: Mood | null;
}

export interface MoodCounts {
  good: number;
  okay: number;
  not_so_good: number;
  skipped: number;
}

export async function getMoodToday(): Promise<MoodToday> {
  return (await api.get<MoodToday>("/me/mood/today")).data;
}

/** Today's answer; null = Skip. */
export async function answerMood(mood: Mood | null): Promise<MoodToday> {
  return (await api.post<MoodToday>("/me/mood", { mood })).data;
}

export async function getMoodHistory(patientId: number, days = 30): Promise<MoodDay[]> {
  return (await api.get<MoodDay[]>(`/patients/${patientId}/mood`, { params: { days } })).data;
}

export interface Memory {
  id: number;
  patient_id: number;
  title: string;
  story: string;
  photos: FamilyPhoto[];
  voice_url: string | null;
  voice_ms: number | null;
  created_at: string;
  updated_at: string;
}

export async function listMemories(patientId: number): Promise<Memory[]> {
  return (await api.get<Memory[]>(`/patients/${patientId}/memories`)).data;
}

export async function createMemory(patientId: number, title: string, story: string): Promise<Memory> {
  return (await api.post<Memory>(`/patients/${patientId}/memories`, { title, story })).data;
}

export async function updateMemory(patientId: number, id: number, title: string, story: string): Promise<Memory> {
  return (await api.put<Memory>(`/patients/${patientId}/memories/${id}`, { title, story })).data;
}

export async function deleteMemory(patientId: number, id: number): Promise<void> {
  await api.delete(`/patients/${patientId}/memories/${id}`);
}

export async function addMemoryPhoto(patientId: number, id: number, photo: Blob): Promise<Memory> {
  const body = await shrinkPhoto(photo);
  return (await api.post<Memory>(`/patients/${patientId}/memories/${id}/photos`, body, { headers: { "Content-Type": body.type || "image/jpeg" } })).data;
}

export async function removeMemoryPhoto(patientId: number, id: number, photoId: string): Promise<Memory> {
  return (await api.delete<Memory>(`/patients/${patientId}/memories/${id}/photos/${photoId}`)).data;
}

export async function setMemoryVoice(patientId: number, id: number, audio: Blob, durationMs: number): Promise<Memory> {
  return (
    await api.post<Memory>(`/patients/${patientId}/memories/${id}/voice`, audio, {
      params: { duration_ms: Math.max(1, Math.round(durationMs)) },
      headers: { "Content-Type": audio.type.split(";")[0] || "audio/webm" },
    })
  ).data;
}

export async function removeMemoryVoice(patientId: number, id: number): Promise<Memory> {
  return (await api.delete<Memory>(`/patients/${patientId}/memories/${id}/voice`)).data;
}
