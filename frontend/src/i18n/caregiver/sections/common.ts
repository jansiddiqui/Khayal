// Caregiver words used on many screens (Round 2 batch 5b): the header, status words, game names,
// relations, buttons. English is the source; Hindi has the same shape (type check).
//
// Hindi style for every caregiver section (keep it consistent):
// - everyday spoken Hindi, polite "आप" with "-एँ" verbs ("सेव करें", "देखें"); not Sanskritised
//   words ("दवाई" not "औषधि", "फ़ोन" not "दूरभाष"). Common English loanwords stay when families use
//   them: रिमाइंडर, अलर्ट, सेशन, लेवल, सेटिंग्स, डैशबोर्ड, रिपोर्ट, फ़ोटो, ऐप, कोड.
// - nukta where it is spoken: ज़्यादा, फ़ोटो, ख़याल, बाक़ी.
// - digits stay 0-9; dates and times come from Intl with "hi-IN" (src/t.ts LOCALE) or clock() below.
// - names, titles and notes the family typed are shown as typed.
// - glossary: elder = (their name, or) "बुज़ुर्ग"; caregiver/family = "परिवार"; dose = "खुराक";
//   medicine = "दवाई"; alert = "अलर्ट"; acknowledge = "देख लिया"; core games = "मुख्य खेल";
//   memory book = "यादों की किताब"; doctor report = "डॉक्टर के लिए रिपोर्ट"; pair a device =
//   "फ़ोन जोड़ें"; voice task = "आवाज़ वाला काम"; mood = "मन"; timeline = "घटनाक्रम".
import type { GameType } from "../../../api/client";

const games: Record<GameType, string> = {
  memory_match: "Memory Match",
  sequence_recall: "Sequence Recall",
  word_recall: "Word Recall",
  daily_orientation: "About Today",
  reaction_tap: "Reaction Tap",
  word_recall_delayed: "Delayed Word Recall",
  object_location: "Paired Associates (object location)",
  spatial_span: "Spatial Span",
  money_handling: "Money Handling",
  clock_setting: "Clock Setting",
  colour_trails: "Colour Trails",
};

/** "13:05" or "13:05:00" -> "1:05 PM". */
function clockEn(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "13:05" -> "दोपहर 1:05" (time of day in words, as on the elder's Hindi screens). */
function clockHi(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const part = h < 5 ? "रात" : h < 12 ? "सुबह" : h < 16 ? "दोपहर" : h < 20 ? "शाम" : "रात";
  return `${part} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`;
}

export const en = {
  appName: "Khayal",
  layout: {
    brand: "Khayal · Caregiver",
    skip: "Skip to content",
    mainNav: "Main",
    dashboard: "Dashboard",
    account: "Account",
    admin: "Admin",
    signOut: "Sign out",
  },
  actions: {
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    cancel: "Cancel",
    delete: "Delete",
    remove: "Remove",
    edit: "Edit",
    add: "Add",
    close: "Close",
    back: "Back",
    retry: "Try again",
    undo: "Undo",
    undone: "Undone. It's back.",
    closeMessage: "Close message",
    yes: "Yes",
    no: "No",
    loading: "Loading…",
    show: "Show",
    hide: "Hide",
  },
  errors: {
    loadFailed: "This didn't load. Check the connection and try again.",
    saveFailed: "That didn't save. Please try again.",
  },
  /** Index and per-game status on one scale (CLAUDE.md section 6). */
  status: {
    stable: "Stable",
    watch: "Watch",
    declining: "Declining",
    insufficient: "Learning",
    thisGame: (word: string) => `This game: ${word}`,
    overall: (word: string) => `Overall: ${word}`,
  },
  severity: { info: "Info", warning: "Warning", critical: "Critical" },
  /** Clinical game names on caregiver screens. */
  games,
  relations: {
    Son: "Son",
    Daughter: "Daughter",
    Grandson: "Grandson",
    Granddaughter: "Granddaughter",
    Wife: "Wife",
    Husband: "Husband",
    Friend: "Friend",
    Other: "Other",
  },
  reminderTypes: { medicine: "Medicine", meal: "Meal", appointment: "Appointment", other: "Other" },
  mood: { good: "Good", okay: "Okay", not_so_good: "Not so good", skipped: "Skipped" },
  consents: { photos: "Family photos", voice: "Voice task", elder_on_behalf: "Using Khayal", research: "Research" },
  languages: { en: "English", hi: "हिन्दी", ur: "اردو" },
  /** Lists of names: "A, B and C". */
  list: (items: readonly string[]) =>
    items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`,
  /** Clock time from "HH:MM". */
  clock: clockEn,
};

export const hi: typeof en = {
  appName: "ख़याल",
  layout: {
    brand: "ख़याल · परिवार",
    skip: "सीधे पेज पर जाएँ",
    mainNav: "मुख्य",
    dashboard: "डैशबोर्ड",
    account: "खाता",
    admin: "एडमिन",
    signOut: "साइन आउट",
  },
  actions: {
    save: "सेव करें",
    saving: "सेव हो रहा है…",
    saved: "सेव हो गया।",
    cancel: "रद्द करें",
    delete: "हटाएँ",
    remove: "हटाएँ",
    edit: "बदलें",
    add: "जोड़ें",
    close: "बंद करें",
    back: "वापस",
    retry: "फिर से कोशिश करें",
    undo: "वापस लें",
    undone: "वापस ले लिया। सब पहले जैसा है।",
    closeMessage: "संदेश बंद करें",
    yes: "हाँ",
    no: "नहीं",
    loading: "लोड हो रहा है…",
    show: "दिखाएँ",
    hide: "छिपाएँ",
  },
  errors: {
    loadFailed: "यह खुल नहीं पाया। इंटरनेट देखकर फिर से कोशिश करें।",
    saveFailed: "यह सेव नहीं हुआ। फिर से कोशिश करें।",
  },
  status: {
    stable: "स्थिर",
    watch: "नज़र रखें",
    declining: "गिरावट",
    insufficient: "अभी सीख रहे हैं",
    thisGame: (word: string) => `यह खेल: ${word}`,
    overall: (word: string) => `कुल मिलाकर: ${word}`,
  },
  severity: { info: "जानकारी", warning: "चेतावनी", critical: "गंभीर" },
  games: {
    memory_match: "जोड़ी मिलान",
    sequence_recall: "रंगों का क्रम",
    word_recall: "शब्द याद करना",
    daily_orientation: "आज के बारे में",
    reaction_tap: "हरा होने पर दबाना",
    word_recall_delayed: "शब्द बाद में याद करना",
    object_location: "चीज़ की जगह याद करना",
    spatial_span: "खानों का क्रम",
    money_handling: "पैसों का हिसाब",
    clock_setting: "घड़ी मिलाना",
    colour_trails: "क्रम से जोड़ना",
  },
  relations: {
    Son: "बेटा",
    Daughter: "बेटी",
    Grandson: "पोता",
    Granddaughter: "पोती",
    Wife: "पत्नी",
    Husband: "पति",
    Friend: "दोस्त",
    Other: "अन्य",
  },
  reminderTypes: { medicine: "दवाई", meal: "खाना", appointment: "अपॉइंटमेंट", other: "अन्य" },
  mood: { good: "अच्छा", okay: "ठीक-ठाक", not_so_good: "ज़्यादा अच्छा नहीं", skipped: "छोड़ दिया" },
  consents: { photos: "परिवार की फ़ोटो", voice: "आवाज़ वाला काम", elder_on_behalf: "ख़याल का इस्तेमाल", research: "रिसर्च" },
  languages: { en: "English", hi: "हिन्दी", ur: "اردو" },
  list: (items: readonly string[]) =>
    items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} और ${items[items.length - 1]}`,
  clock: clockHi,
};
