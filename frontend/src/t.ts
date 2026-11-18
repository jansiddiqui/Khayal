// All caregiver-screen text, in the caregiver's own language (Round 2 batch 5b). The words live in
// src/i18n/caregiver/sections/*.ts (English `en` is the source, Hindi `hi` has the same shape); this
// file picks one when the app starts, from the language saved on this device
// (src/i18n/caregiverLanguage.ts). Changing it in Account saves it and reloads the app.
//
// Use: `t.dashboard.title`, `t.common.status.stable`, `t.reminders.dueAt(time)`; dates and times
// with `LOCALE`; text written by the server with `serverText(text, text_i18n)`.
import axios from "axios";
import { errorDetail, UploadTimeoutError, type GameType, type ServerMsg } from "./api/client";
import { cgEn, cgHi, type CgCopy } from "./i18n/caregiver/en";
import { storedCgLanguage, type CgLanguage } from "./i18n/caregiverLanguage";

export type { CgCopy };

/** The caregiver screens' language for this visit. */
export const CG_LANGUAGE: CgLanguage = storedCgLanguage();

export const t: CgCopy = CG_LANGUAGE === "hi" ? cgHi : cgEn;

/** Locale for Intl dates, times and numbers on caregiver screens (digits stay 0-9 in hi-IN). */
export const LOCALE = CG_LANGUAGE === "hi" ? "hi-IN" : "en-IN";

/** A clock time: "4:46 pm" in English, "शाम 4:46" in Hindi (the same words as the elder's screens). */
export function timeText(d: Date): string {
  if (CG_LANGUAGE === "en") return d.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
  return t.common.clock(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
}

/** A date with its time ("15 Nov, 8:00 pm" / "15 नव॰, रात 8:00"); `year` adds the year. */
export function dateTimeText(d: Date, year = false): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) };
  if (CG_LANGUAGE === "en") return d.toLocaleString(LOCALE, { ...opts, hour: "numeric", minute: "2-digit" });
  return `${d.toLocaleDateString(LOCALE, opts)}, ${timeText(d)}`;
}

/** <html lang> on caregiver screens (the patient app sets its own in src/copy.ts). */
export function applyCaregiverDocument(): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = CG_LANGUAGE;
  document.documentElement.dir = "ltr";
}

/** The game's caregiver name in this language. */
export function gameName(game: GameType): string {
  return t.common.games[game];
}

/** A template: one text, or a singular and a plural chosen by the `n` value. */
export type Template = string | { one: string; other: string };

const RELATIONS = t.common.relations as Record<string, string>;

/** How each kind of value is shown, by its name in the template (the server sends raw values). */
function formatParam(name: string, value: string | number | string[]): string {
  const one = (v: string): string => {
    if (name.startsWith("game")) return (t.common.games as Record<string, string>)[v] ?? v;
    if (name.startsWith("day")) return new Date(`${v}T00:00:00`).toLocaleDateString(LOCALE, { weekday: "long" });
    switch (name) {
      case "time":
        return t.common.clock(v);
      case "date":
        return new Date(`${v}T00:00:00`).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
      case "relation": {
        const key = Object.keys(RELATIONS).find((r) => r.toLowerCase() === v.toLowerCase());
        return key ? RELATIONS[key]! : v;
      }
      case "mood":
        return (t.common.mood as Record<string, string>)[v] ?? v;
      case "severity":
        return (t.common.severity as Record<string, string>)[v] ?? v;
      case "consent":
        return (t.common.consents as Record<string, string>)[v] ?? v;
      case "language":
        return (t.common.languages as Record<string, string>)[v] ?? v;
      default:
        return v;
    }
  };
  return Array.isArray(value) ? t.common.list(value.map(one)) : one(String(value));
}

/** Fill a template's {blanks}; a template the dictionary doesn't have gives null. */
export function renderMsg(msg: ServerMsg): string | null {
  const template = (t.server as Record<string, Template | undefined>)[msg.key];
  if (template === undefined) return null;
  const text = typeof template === "string" ? template : Number(msg.params.n) === 1 ? template.one : template.other;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in msg.params ? formatParam(name, msg.params[name]!) : whole,
  );
}

/**
 * Text the server wrote (alert messages, next actions, insights, timeline lines). In English, or
 * when a message is unknown (older text, a new server), the server's own English text is shown.
 */
export function serverText(text: string, msgs: readonly ServerMsg[] | null | undefined): string {
  if (CG_LANGUAGE === "en" || !msgs || msgs.length === 0) return text;
  const parts = msgs.map(renderMsg);
  return parts.every((p): p is string => p !== null) ? parts.join(" ") : text;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A reason the server gave (`detail`), in the caregiver's language when it is a known one. */
export function serverReason(reason: string): string {
  for (const [english, shown] of Object.entries(t.common.serverErrors)) {
    const found = new RegExp(`^${escape(english).replace(escape("{n}"), "(\\d+)")}$`).exec(reason);
    if (found) return shown.replace("{n}", found[1] ?? "");
  }
  return reason;
}

/** The server's reason for a failed request, translated when known; undefined when it gave none. */
export function serverDetail(error: unknown): string | undefined {
  const detail = errorDetail(error);
  return detail === undefined ? undefined : serverReason(detail);
}

/** What went wrong with a request, for people to read and report (the caregiver version of
 * api/client describeRequestError): the status and the server's reason, a timeout, or no answer. */
export function describeError(error: unknown): string {
  if (error instanceof UploadTimeoutError) return t.common.errors.timeout(Math.round(error.ms / 1000));
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return t.common.errors.withStatus(error.response.status, serverDetail(error) ?? (error.response.statusText || error.message));
    }
    return t.common.errors.noAnswer(error.message);
  }
  return error instanceof Error ? error.message : t.common.errors.unknown;
}

