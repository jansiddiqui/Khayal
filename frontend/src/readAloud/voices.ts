/**
 * Which read-aloud voice to use for the patient app's language (Round 2 batch 5).
 *
 * - English: an Indian English voice if there is one, else any English voice (the old behaviour).
 * - Hindi: a hi-IN voice (Windows "Microsoft Kalpana/Hemant" after adding Hindi speech; Chrome's
 *   "Google हिन्दी"; Android's Google text-to-speech Hindi). Without one, Hindi can't be read aloud.
 * - Urdu: an ur-IN / ur-PK voice if the device has one. Otherwise a Hindi voice reads the Hindi
 *   twin of the Urdu text (src/i18n/speechTwin.ts): the same spoken language, a script the voice can read.
 *
 * Voices load asynchronously in Chrome, so callers ask again after "voiceschanged".
 */
import type { Language } from "../i18n/language";

export interface VoiceChoice {
  voice: SpeechSynthesisVoice | null;
  /** The language that voice speaks; "none" when nothing suitable was found. */
  using: Language | "none";
  /** BCP-47 tag to put on the utterance. */
  lang: string;
}

const starts = (voice: SpeechSynthesisVoice, prefix: string) => voice.lang.toLowerCase().replace("_", "-").startsWith(prefix);

function best(voices: readonly SpeechSynthesisVoice[], exact: string, prefix: string): SpeechSynthesisVoice | null {
  return (
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === exact) ??
    voices.find((v) => starts(v, prefix)) ??
    null
  );
}

export function chooseVoice(language: Language, voices: readonly SpeechSynthesisVoice[]): VoiceChoice {
  if (language === "ur") {
    const urdu = best(voices, "ur-in", "ur");
    if (urdu) return { voice: urdu, using: "ur", lang: urdu.lang };
    const hindi = best(voices, "hi-in", "hi");
    if (hindi) return { voice: hindi, using: "hi", lang: hindi.lang };
    return { voice: null, using: "none", lang: "ur-IN" };
  }
  if (language === "hi") {
    const hindi = best(voices, "hi-in", "hi");
    return hindi ? { voice: hindi, using: "hi", lang: hindi.lang } : { voice: null, using: "none", lang: "hi-IN" };
  }
  const english = best(voices, "en-in", "en");
  // With no voice list at all (some browsers), the default voice still speaks English.
  return { voice: english, using: "en", lang: english?.lang ?? "en-IN" };
}
