// All user-facing patient text, in the elder's language (Round 2 batch 5).
// The words live in src/i18n/en.ts (the source), hi.ts and ur.ts; this file picks one when the app
// starts, from the language the device stored (src/i18n/language.ts). Changing the language saves
// it and reloads the app, so every screen switches together.
import { en, type Copy } from "./i18n/en";
import { hi } from "./i18n/hi";
import { applyToDocument, storedLanguage, type Language } from "./i18n/language";
import { withTwins } from "./i18n/speechTwin";
import { ur } from "./i18n/ur";

export type { Copy };

/** The patient app's language for this visit. */
export const LANGUAGE: Language = storedLanguage();
applyToDocument(LANGUAGE);

const urdu = LANGUAGE === "ur" ? withTwins(ur, hi) : null;

export const copy: Copy = LANGUAGE === "hi" ? hi : urdu ? urdu.copy : en;

/** For read-aloud on a device without an Urdu voice: the Hindi twin of Urdu text (same spoken language). */
export function hindiTwin(text: string): string {
  return urdu ? urdu.toHindi(text) : text;
}
