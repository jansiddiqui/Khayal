import { describe, expect, it } from "vitest";
import review from "../../../docs/i18n/review.md?raw";
import { voiceStatus } from "../components/caregiver/LanguageForm";
import { chooseVoice } from "../readAloud/voices";
import { en, type Copy } from "./en";
import { hi } from "./hi";
import { saveLanguage, storedLanguage } from "./language";
import { withTwins } from "./speechTwin";
import { ur } from "./ur";

/** Every string (and every function's sample output) under `value`, with its key. */
function leaves(value: unknown, prefix = ""): [string, unknown][] {
  if (typeof value === "string" || typeof value === "function") return [[prefix, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${prefix}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  return [];
}

const ENGLISH_ON_PURPOSE = /^(demo|pair|login|register)\./;
/** Not text: the direction, and the "Other" relation (no words added for it). */
const NOT_TEXT = new Set(["dir", "speechLang", "whoIsThis.relations.other"]);

describe.each([
  ["Hindi", hi],
  ["Urdu", ur],
])("%s copy", (_name, copy: Copy) => {
  it("has every English key, and every string is filled in", () => {
    const keys = (c: Copy) => leaves(c).map(([k]) => k);
    expect(keys(copy)).toEqual(keys(en));
    for (const [key, value] of leaves(copy)) {
      if (typeof value === "string" && !NOT_TEXT.has(key)) expect(value.trim(), key).not.toBe("");
    }
  });

  it("is translated (apart from the screens that stay English on purpose)", () => {
    const same = leaves(copy).filter(
      ([key, value]) => typeof value === "string" && !ENGLISH_ON_PURPOSE.test(key) && !NOT_TEXT.has(key) && value === leaves(en).find(([k]) => k === key)?.[1] && /[a-z]{3,}/i.test(value),
    );
    expect(same.map(([k]) => k)).toEqual([]);
  });

  it("keeps the same game answers: one word per id, no duplicates", () => {
    expect(new Set(Object.values(copy.words)).size).toBe(Object.keys(copy.words).length);
    expect(new Set(copy.days).size).toBe(7);
    expect(new Set(copy.months).size).toBe(12);
  });
});

describe("clock times", () => {
  it("say the time the way people say it in Hindi and Urdu", () => {
    expect([hi.clockTime(3, 0), hi.clockTime(1, 30), hi.clockTime(2, 30), hi.clockTime(3, 30), hi.clockTime(4, 15), hi.clockTime(4, 45)]).toEqual([
      "3 बजे", "डेढ़ बजे", "ढाई बजे", "साढ़े 3 बजे", "सवा 4 बजे", "पौने 5 बजे",
    ]);
    expect(hi.clockTime(11, 10)).toBe("11 बजकर 10 मिनट");
    expect(hi.clockTime(12, 40, true)).toBe("एक बजने में बीस मिनट");
    expect([ur.clockTime(1, 30), ur.clockTime(4, 45), ur.clockTime(11, 10)]).toEqual(["ڈیڑھ بجے", "پونے 5 بجے", "11 بج کر 10 منٹ"]);
    expect(en.clockTime(3, 40, true)).toBe("twenty to four");
  });
});

describe("Urdu read with a Hindi voice", () => {
  it("speaks the Hindi twin of plain strings, function results and sentences joined by the app", () => {
    const { copy, toHindi } = withTwins(ur, hi);
    expect(toHindi(copy.mood.question)).toBe(hi.mood.question);
    expect(toHindi(copy.games.roundOf(2, 5))).toBe(hi.games.roundOf(2, 5));
    // Choices built from Urdu day names come out all in Hindi.
    expect(toHindi(copy.common.spokenChoices([copy.days[1]!, copy.days[2]!, copy.days[3]!]))).toBe("सोमवार, मंगलवार, या बुधवार?");
    // "title. intro", as the Layout speaks it.
    expect(toHindi(`${copy.whoIsThis.title}. ${copy.whoIsThis.intro}`)).toBe(`${hi.whoIsThis.title} ${hi.whoIsThis.intro}`);
    // Names and other text the family typed are spoken as they are.
    expect(toHindi("Kamala")).toBe("Kamala");
  });
});

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

describe("voice choice", () => {
  const windows = [voice("Microsoft Ravi", "en-IN"), voice("Microsoft David", "en-US")];
  it("uses an Urdu voice, else a Hindi one, else none", () => {
    expect(chooseVoice("ur", [...windows, voice("Google اردو", "ur-PK")]).using).toBe("ur");
    expect(chooseVoice("ur", [...windows, voice("Google हिन्दी", "hi-IN")])).toMatchObject({ using: "hi", lang: "hi-IN" });
    expect(chooseVoice("ur", windows).using).toBe("none");
    expect(chooseVoice("hi", windows).using).toBe("none");
    expect(chooseVoice("en", windows).voice?.name).toBe("Microsoft Ravi");
  });

  it("tells the family what the elder's phone found", () => {
    expect(voiceStatus("Kamala", "ur", null)).toMatch(/checks its read-aloud voices the next time/);
    expect(voiceStatus("Kamala", "ur", { lang: "ur", voice: "Google हिन्दी", using: "hi", checked_at: "" })).toMatch(
      /no Urdu voice, so Urdu is read aloud with a Hindi voice \(Google हिन्दी\)/,
    );
    expect(voiceStatus("Kamala", "hi", { lang: "hi", voice: null, using: "none", checked_at: "" })).toMatch(/no Hindi voice, so Read aloud stays silent/);
    // A report about the old language doesn't count after a change.
    expect(voiceStatus("Kamala", "hi", { lang: "ur", voice: null, using: "none", checked_at: "" })).toMatch(/next time the app opens/);
  });
});

describe("language on this device", () => {
  it("defaults to English and says when a saved language needs a reload", () => {
    localStorage.removeItem("khayal.lang");
    expect(storedLanguage()).toBe("en");
    expect(saveLanguage("hi", "en")).toBe(true);
    expect(storedLanguage()).toBe("hi");
    expect(saveLanguage("hi", "hi")).toBe(false);
    localStorage.removeItem("khayal.lang");
  });
});

describe("review file (docs/i18n/review.md)", () => {
  it("lists every translated string for Jan to review", () => {
    const missing = leaves(en)
      .map(([key]) => key)
      .filter((key) => !ENGLISH_ON_PURPOSE.test(key) && !["speechLang", "dir"].includes(key) && !key.startsWith("whoIsThis.relations."))
      .filter((key) => !review.includes(`\`${key}\``));
    expect(missing, "run npm run i18n:review").toEqual([]);
    expect(review).toContain("draft — needs native-speaker review");
  });
});
