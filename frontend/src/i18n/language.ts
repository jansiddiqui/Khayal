/**
 * Which language the patient app shows (Round 2 batch 5). A caregiver sets it per elder; the
 * elder's device stores it here and the whole app picks its text once at start-up (src/copy.ts).
 * A change saves the new language and reloads the app, so every screen switches together.
 */

export type Language = "en" | "hi" | "ur";
export const LANGUAGES: readonly Language[] = ["en", "hi", "ur"];

const STORAGE_KEY = "khayal.lang";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

export function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : "en";
  } catch {
    return "en";
  }
}

/** Save `next` for the next start; true when it differs from the language running now. */
export function saveLanguage(next: Language, running: Language): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not saved: this visit keeps the language it started with.
  }
  return next !== running;
}

/** <html lang> and dir: Urdu is right to left; caregiver screens stay English (ltr). */
export function applyToDocument(language: Language): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language === "en" ? "en" : language;
  document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
}
