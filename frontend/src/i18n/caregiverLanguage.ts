/**
 * Which language the caregiver screens show (Round 2 batch 5b). Each caregiver picks their own in
 * Account; it is saved on their account (User.language) and on this device, separately from every
 * elder's app language (./language.ts, key "khayal.lang"). The caregiver words are picked once at
 * start-up (src/t.ts); a change saves the new language and reloads the app.
 */

export type CgLanguage = "en" | "hi";
export const CG_LANGUAGES: readonly CgLanguage[] = ["en", "hi"];

const STORAGE_KEY = "khayal.cgLang";

export function isCgLanguage(value: unknown): value is CgLanguage {
  return typeof value === "string" && (CG_LANGUAGES as readonly string[]).includes(value);
}

export function storedCgLanguage(): CgLanguage {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isCgLanguage(value) ? value : "en";
  } catch {
    return "en";
  }
}

/** Save `next` for the next start; true when it differs from the language running now. */
export function saveCgLanguage(next: CgLanguage, running: CgLanguage): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not saved: this visit keeps the language it started with.
  }
  return next !== running;
}
