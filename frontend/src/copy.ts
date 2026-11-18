// All user-facing patient text, in the elder's language (Round 2 batch 5).
// The words live in src/i18n/en.ts (the source), hi.ts and ur.ts; this file picks one when the app
// starts, from the language the device stored (src/i18n/language.ts). Changing the language saves
// it and reloads the app, so every screen switches together.
import { en, type Copy } from "./i18n/en";
import { hi } from "./i18n/hi";
import { applyToDocument, saveLanguage, storedLanguage, type Language } from "./i18n/language";
import { languageFromLink } from "./pairLink";
import { withTwins } from "./i18n/speechTwin";
import { ur } from "./i18n/ur";

export type { Copy };

/** The patient app's language for this visit. */
// A pairing link from the family (/pair?code=…&lang=hi) carries the elder's language, so the
// pairing page already speaks it; it is kept for the next start too. Only on a device nobody is
// signed in on: a signed-in account's own language wins (AuthContext).
function signedIn(): boolean {
  try {
    return localStorage.getItem("khayal.token") !== null;
  } catch {
    return false;
  }
}
const fromLink =
  typeof window === "undefined" || signedIn() ? null : languageFromLink(window.location.pathname, window.location.search);
if (fromLink) saveLanguage(fromLink, fromLink);
export const LANGUAGE: Language = fromLink ?? storedLanguage();
applyToDocument(LANGUAGE);

const urdu = LANGUAGE === "ur" ? withTwins(ur, hi) : null;

export const copy: Copy = LANGUAGE === "hi" ? hi : urdu ? urdu.copy : en;

/** For read-aloud on a device without an Urdu voice: the Hindi twin of Urdu text (same spoken language). */
export function hindiTwin(text: string): string {
  return urdu ? urdu.toHindi(text) : text;
}
