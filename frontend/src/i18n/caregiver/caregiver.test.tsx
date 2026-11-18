import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import review from "../../../../docs/i18n/review.md?raw";
import type { Glance } from "../../api/client";
import { cgEn, cgHi } from "./en";

/** Every string (and function) under `value`, with its key. */
function leaves(value: unknown, prefix = ""): [string, unknown][] {
  if (typeof value === "string" || typeof value === "function") return [[prefix, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${prefix}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  return [];
}

/** Text that is the same in both languages on purpose: language names, symbols, loanwords in Latin script. */
const SAME_ON_PURPOSE = /^(common\.languages\.|elderPanels\.language\.(names|options)\.|server\.insight\.z_item|server\.tl\.level_change)/;

describe("caregiver Hindi (Round 2 batch 5b)", () => {
  it("has every English key, filled in and translated", () => {
    const keys = (c: unknown) => leaves(c).map(([k]) => k);
    expect(keys(cgHi)).toEqual(keys(cgEn));
    const english = new Map(leaves(cgEn));
    const untranslated = leaves(cgHi).filter(
      ([key, value]) =>
        typeof value === "string" && !SAME_ON_PURPOSE.test(key) && value === english.get(key) && /[a-z]{3,}/i.test(value),
    );
    expect(untranslated.map(([k]) => k)).toEqual([]);
    for (const [key, value] of leaves(cgHi)) if (typeof value === "string") expect(value.trim(), key).not.toBe("");
  });

  it("is listed in the review file", () => {
    const missing = leaves(cgEn)
      .map(([k]) => `cg.${k}`)
      .filter((key) => !review.includes(`\`${key}\``));
    expect(missing, "run npm run i18n:review").toEqual([]);
    expect(review).toContain("# Hindi caregiver screens: review");
  });
});

describe("with Hindi chosen", () => {
  afterEach(() => {
    localStorage.removeItem("khayal.cgLang");
    vi.resetModules();
  });

  async function hindi() {
    localStorage.setItem("khayal.cgLang", "hi");
    vi.resetModules();
    return import("../../t");
  }

  it("shows server text in Hindi, with game names, times and plurals filled in", async () => {
    const { serverText, CG_LANGUAGE, LOCALE } = await hindi();
    expect(CG_LANGUAGE).toBe("hi");
    expect(LOCALE).toBe("hi-IN");
    expect(serverText("x", [{ key: "next.check_dose", params: { time: "09:00", title: "BP tablet", name: "Kamala" } }])).toBe(
      "Kamala से सुबह 9:00 वाली BP tablet के बारे में पूछ लें",
    );
    expect(serverText("x", [{ key: "next.alerts", params: { n: 1 } }])).toBe("1 नया अलर्ट देखें");
    expect(serverText("x", [{ key: "next.alerts", params: { n: 3 } }])).toBe("3 नए अलर्ट देखें");
    expect(serverText("x", [{ key: "event.core_games", params: { games: ["word_recall", "money_handling"] } }])).toBe(
      "मुख्य खेल बदले: शब्द याद करना और पैसों का हिसाब",
    );
    expect(serverText("x", [{ key: "event.family_added", params: { name: "Rahul", relation: "Grandson" } }])).toBe(
      "परिवार में जोड़ा: Rahul (पोता)",
    );
    // Two decline sentences become two Hindi sentences.
    const two = serverText("x", [
      { key: "decline.dropped", params: { game: "memory_match", base: "0.62", recent: "0.41", window: 5, z: "= −2.7" } },
      { key: "decline.dropped", params: { game: "word_recall", base: "0.50", recent: "0.38", window: 5, z: "≤ −4.0" } },
    ]);
    expect(two).toBe(
      "जोड़ी मिलान का औसत पिछले 5 सेशन में 0.62 से घटकर 0.41 हो गया (z = −2.7)। शब्द याद करना का औसत पिछले 5 सेशन में 0.50 से घटकर 0.38 हो गया (z ≤ −4.0)।",
    );
  });

  it("falls back to the server's English for text it doesn't know", async () => {
    const { serverText } = await hindi();
    expect(serverText("Typed by hand", null)).toBe("Typed by hand");
    expect(serverText("Newer server text", [{ key: "next.something_new", params: {} }])).toBe("Newer server text");
  });

  it("renders a glance card in Hindi", async () => {
    const { GlanceCard } = await hindi().then(() => import("../../components/caregiver/GlanceCard"));
    const { renderWithProviders } = await import("../../test/renderWithProviders");
    const card: Glance = {
      patient_id: 2, name: "Kamala", cognitive_status: "watch", games_done: 1, games_total: 3,
      medicines: { taken: 1, missed: 0, unsure: 0, to_come: 1 }, alerts_open: 0, last_active_at: null,
      next_action: { kind: "pair", text: "Pair Kamala's phone or tablet", text_i18n: [{ key: "next.pair", params: { name: "Kamala" } }] },
    };
    renderWithProviders(<GlanceCard glance={card} />);
    expect(await screen.findByText("Kamala का फ़ोन या टैबलेट जोड़ें")).toBeInTheDocument();
    expect(screen.getByText(/नज़र रखें/)).toBeInTheDocument();
  });

  it("everyday English stays the default", async () => {
    vi.resetModules();
    const { CG_LANGUAGE, serverText } = await import("../../t");
    expect(CG_LANGUAGE).toBe("en");
    expect(serverText("Pair Kamala's phone or tablet", [{ key: "next.pair", params: { name: "Kamala" } }])).toBe(
      "Pair Kamala's phone or tablet",
    );
  });
});
