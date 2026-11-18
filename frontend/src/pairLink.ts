/**
 * The pairing link (pair-entry): /pair?code=123456&lang=hi. Opening it on the elder's phone fills
 * the code in (one big Start), in the elder's app language. The code inside is the same one-time
 * 6-digit code as before: valid 10 minutes, one use, the same rate limits.
 */
import { isLanguage, type Language } from "./i18n/language";

export function pairLink(origin: string, code: string, language?: string): string {
  const params = new URLSearchParams({ code });
  if (language && isLanguage(language) && language !== "en") params.set("lang", language);
  return `${origin}/pair?${params.toString()}`;
}

/** A 6-digit code from a pairing link's ?code=, or "" when there is none (or it isn't 6 digits). */
export function codeFromLink(search: string): string {
  const code = new URLSearchParams(search).get("code") ?? "";
  return /^\d{6}$/.test(code) ? code : "";
}

/** The elder's language from a pairing link (?lang=), so the pairing page speaks it before sign-in. */
export function languageFromLink(pathname: string, search: string): Language | null {
  if (pathname !== "/pair") return null;
  const lang = new URLSearchParams(search).get("lang");
  return isLanguage(lang) ? lang : null;
}
