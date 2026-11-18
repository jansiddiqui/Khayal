/**
 * Writes docs/i18n/review.md: every patient string, grouped by screen, as key | English | Hindi |
 * Urdu | status (Round 2 batch 5). Text with blanks ("{name}") comes from calling the function with
 * sample values. Statuses already in the file ("reviewed", or a note) are kept when it is rewritten.
 *
 *   npm run i18n:review
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { en } from "../src/i18n/en";
import { hi } from "../src/i18n/hi";
import { ur } from "../src/i18n/ur";
import { cgEn, cgHi } from "../src/i18n/caregiver/en";

const OUT = fileURLToPath(new URL("../../docs/i18n/review.md", import.meta.url));

/** Sample values for function parameters, by parameter name. */
const NUMBERS: Record<string, number> = {
  n: 2, total: 5, done: 1, price: 45, v: 20, money: 100, paid: 50, change: 55, sum: 85, pa: 30, pb: 25, hour: 9, h: 11, m: 10,
};
const STRINGS: Record<string, string | string[] | boolean> = {
  options: ["{A}", "{B}", "{C}"],
  mark: "circle",
  hhmmss: "13:05:00",
  asWords: false,
  relation: "grandson",
  items: ["{A}", "{B}", "{C}"],
  hhmm: "13:05",
};

function paramNames(fn: (...args: never[]) => unknown): string[] {
  const src = fn.toString();
  const inside = src.slice(src.indexOf("(") + 1, src.indexOf(")"));
  return inside
    .split(",")
    .map((p) => p.trim().split(/[\s:=]/)[0]!)
    .filter(Boolean);
}

function sample(fn: unknown): string {
  if (typeof fn !== "function") return String(fn);
  const f = fn as (...args: unknown[]) => unknown;
  const args = paramNames(f as never).map((p) => (p in NUMBERS ? NUMBERS[p] : p in STRINGS ? STRINGS[p] : `{${p}}`));
  try {
    const out = f(...args);
    return typeof out === "string" ? out : JSON.stringify(out);
  } catch {
    return "(example could not be made)";
  }
}

type Row = { key: string; en: string; hi: string; ur: string };

function walk(prefix: string, e: unknown, h: unknown, u: unknown, rows: Row[]): void {
  if (typeof e === "string" || typeof e === "function") {
    rows.push({ key: prefix, en: sample(e), hi: sample(h), ur: sample(u) });
    return;
  }
  if (Array.isArray(e)) {
    e.forEach((item, i) => walk(`${prefix}[${i}]`, item, (h as unknown[])?.[i], (u as unknown[])?.[i], rows));
    return;
  }
  if (e && typeof e === "object") {
    for (const [k, v] of Object.entries(e)) {
      walk(prefix ? `${prefix}.${k}` : k, v, (h as Record<string, unknown>)?.[k], (u as Record<string, unknown>)?.[k], rows);
    }
  }
}

/** Screens, in the order a patient meets them. A key belongs to the first group whose prefix matches. */
const GROUPS: [string, string[]][] = [
  ["Top bar (every screen) and common", ["appName", "nav.", "common.", "a11y."]],
  ["Settings sheet and feedback", ["settings.", "feedback."]],
  ["Mood question (first time Home opens each day)", ["mood."]],
  ["Home", ["patientHome."]],
  ["Today's reminders", ["reminders."]],
  ["Who is this?", ["whoIsThis."]],
  ["Memories", ["memories."]],
  ["Games list, between rounds, end of a game", ["games.title", "games.intro", "games.doneToday", "games.listFailed", "games.empty", "games.start", "games.roundOf", "games.praise", "games.roundTryAnother", "games.tutorial", "games.tryOne", "games.more", "games.seeOther", "games.other", "games.practiceDone", "games.next", "games.saving", "games.saveFailed", "games.retry", "games.encouragement", "games.endUp", "games.showMeAgain", "games.playAgain", "games.backTo", "games.nextGame", "games.backHome"]],
  ["Game: About Today (Daily Orientation)", ["games.orientation.", "days", "months", "seasons.", "timesOfDay.", "cities", "festivals."]],
  ["Game: Find the Pairs (Memory Match)", ["games.memoryMatch.", "cards."]],
  ["Game: Follow the Colours (Sequence Recall)", ["games.sequenceRecall.", "tiles."]],
  ["Game: Remember the Words (Word Recall, incl. delayed check)", ["games.wordRecall.", "words."]],
  ["Game: Tap When Green (Reaction Tap)", ["games.reactionTap."]],
  ["Game: Join in order (Colour Trails)", ["games.colourTrails."]],
  ["Game: Set the clock (Clock Setting)", ["games.clockSetting.", "clockTime"]],
  ["Game: Market day (Money Handling)", ["games.market.", "market."]],
  ["Game: Tap the squares (Spatial Span)", ["games.spatialSpan."]],
  ["Game: Where did it go? (object location)", ["games.objectLocation.", "objects."]],
  ["Tell me about a picture (voice task)", ["voiceTask."]],
];
/** English on purpose: shown before the elder's language is known, or to family members. */
const ENGLISH_ONLY = ["demo.", "pair.", "login.", "register."];
const SKIP = ["speechLang", "dir", "whoIsThis.relationNames.other"];

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function previousStatuses(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(OUT)) return out;
  for (const line of readFileSync(OUT, "utf8").split("\n")) {
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    // | key | English | Hindi | Urdu | Hindi status | Urdu status |
    if (cells.length >= 8 && cells[1]?.startsWith("`")) out.set(cells[1].replace(/`/g, ""), `${cells[5]}|${cells[6]}`);
    // | key | English | Hindi | Hindi status | (caregiver screens, keys "cg.")
    else if (cells.length === 6 && cells[1]?.startsWith("`cg.")) out.set(cells[1].replace(/`/g, ""), cells[4] ?? "draft");
  }
  return out;
}

const rows: Row[] = [];
walk("", en, hi, ur, rows);
// Clock times: one row per kind of time, in digits and in words.
for (const [h, m] of [[3, 0], [3, 30], [1, 30], [2, 30], [4, 15], [4, 45], [11, 10], [3, 40]] as const) {
  rows.push({ key: `clockTime(${h}:${String(m).padStart(2, "0")})`, en: en.clockTime(h, m), hi: hi.clockTime(h, m), ur: ur.clockTime(h, m) });
  if (h === 3 && m === 40) rows.push({ key: "clockTime(3:40, words)", en: en.clockTime(h, m, true), hi: hi.clockTime(h, m, true), ur: ur.clockTime(h, m, true) });
}

const statuses = previousStatuses();
const used = new Set<string>();
const lines: string[] = [
  "# Hindi and Urdu patient text: review",
  "",
  "**Status: draft — needs native-speaker review.** Written in everyday spoken Hindi and Urdu (\"दवाई\" / \"دوائی\", not",
  "\"औषधि\"), digits stay 0-9. Generated by `npm run i18n:review` (frontend/scripts/i18n-review.ts) from",
  "`frontend/src/i18n/en.ts`, `hi.ts` and `ur.ts`.",
  "",
  "How to review: change the text in `hi.ts` / `ur.ts`, then set the status cell here to `reviewed` (or write a",
  "short note). Re-running the script keeps the status cells. Text in `{curly brackets}` is filled in by the app",
  "(a name, a time, a price). Lines with a number in the key (`praise[2]`) are one of several variants.",
  "",
];
let total = 0;
for (const [title, prefixes] of GROUPS) {
  const group = rows.filter(
    (r) => !used.has(r.key) && !SKIP.some((s) => r.key === s || r.key.startsWith(s)) && prefixes.some((p) => r.key === p || r.key.startsWith(p)),
  );
  if (!group.length) continue;
  lines.push(`## ${title}`, "", "| key | English | Hindi | Urdu | Hindi status | Urdu status |", "|---|---|---|---|---|---|");
  for (const r of group) {
    used.add(r.key);
    const [hs = "draft", us = "draft"] = (statuses.get(r.key) ?? "draft|draft").split("|");
    lines.push(`| \`${r.key}\` | ${esc(r.en)} | ${esc(r.hi)} | <span dir="rtl">${esc(r.ur)}</span> | ${hs} | ${us} |`);
    total++;
  }
  lines.push("");
}
const leftover = rows.filter(
  (r) => !used.has(r.key) && !SKIP.some((s) => r.key === s || r.key.startsWith(s)) && !ENGLISH_ONLY.some((p) => r.key.startsWith(p)),
);
if (leftover.length) {
  lines.push("## Other", "", "| key | English | Hindi | Urdu | Hindi status | Urdu status |", "|---|---|---|---|---|---|");
  for (const r of leftover) lines.push(`| \`${r.key}\` | ${esc(r.en)} | ${esc(r.hi)} | <span dir="rtl">${esc(r.ur)}</span> | draft | draft |`);
  total += leftover.length;
  lines.push("");
}
// Caregiver screens (Round 2 batch 5b): English and Hindi only.
const CG_GROUPS: [string, string][] = [
  ["common", "Header and words used everywhere"],
  ["dashboard", "Dashboard, adding an elder, today at a glance, feedback"],
  ["elderPage", "Elder page: summary, alerts, status, mood strip"],
  ["elderPanels", "Elder page: charts, insights, timeline, weekly card, settings, privacy, pairing"],
  ["reminders", "Reminders"],
  ["family", "Family photos"],
  ["memoryBook", "Memory book"],
  ["report", "Doctor report"],
  ["account", "Account: screen language"],
  ["server", "Written by the server (next actions, insights, timeline, alerts)"],
];
const cgRows: Row[] = [];
walk("", cgEn, cgHi, cgHi, cgRows);
lines.push(
  "# Hindi caregiver screens: review",
  "",
  "**Status: draft — needs native-speaker review.** Round 2 batch 5b. Everyday spoken Hindi for family members",
  "(loanwords families use stay: रिमाइंडर, अलर्ट, सेशन, फ़ोटो); the style and glossary are at the top of",
  "`frontend/src/i18n/caregiver/sections/common.ts`. Change the text in that folder, then set the status here.",
  "Account (apart from its language choice), admin and sign-in stay English for now.",
  "",
);
let cgTotal = 0;
for (const [section, title] of CG_GROUPS) {
  const group = cgRows.filter((r) => r.key.startsWith(`${section}.`));
  if (!group.length) continue;
  lines.push(`## Caregiver: ${title}`, "", "| key | English | Hindi | Hindi status |", "|---|---|---|---|");
  for (const r of group) {
    const key = `cg.${r.key}`;
    lines.push(`| \`${key}\` | ${esc(r.en)} | ${esc(r.hi)} | ${statuses.get(key) ?? "draft"} |`);
    cgTotal++;
  }
  lines.push("");
}
lines.push(
  "## English on purpose",
  "",
  "Pairing a phone, the demo, sign-in and sign-up stay English: the elder's language isn't known yet on the pairing",
  `screen, and the others are for family members. Keys: ${ENGLISH_ONLY.map((p) => `\`${p}*\``).join(", ")}.`,
  "",
  `${total} patient strings and ${cgTotal} caregiver strings to review.`,
  "",
);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`Wrote ${OUT} (${total} patient strings, ${cgTotal} caregiver strings).`);
