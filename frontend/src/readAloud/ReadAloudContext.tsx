import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { copy, hindiTwin, LANGUAGE } from "../copy";
import { chooseVoice, type VoiceChoice } from "./voices";

const STORAGE_KEY = "khayal.readAloud";

interface ReadAloudValue {
  enabled: boolean;
  toggle: () => void;
  /**
   * Speak `text` with the browser's speechSynthesis, if read-aloud is on and supported.
   * `force` speaks even when read-aloud is off (first-time game tutorials, research.md 3.4, and
   * "Read it to me" in the memory book). `onEnd` runs when the speech ends or can't start.
   */
  speak: (text: string, options?: { force?: boolean; onEnd?: () => void }) => void;
  /** Stop speaking now. */
  cancel: () => void;
  /** The voice found for the app's language (reported to the family, Round 2 batch 5). */
  voice: VoiceChoice;
}

const ReadAloudContext = createContext<ReadAloudValue | null>(null);

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** The device's voices; some browsers (and test stubs) have no voice list. */
function voicesOf(s: SpeechSynthesis | null): SpeechSynthesisVoice[] {
  return s && typeof s.getVoices === "function" ? s.getVoices() : [];
}

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

export function ReadAloudProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(loadEnabled);
  // The voice for the app's language; Chrome fills the voice list a moment after start-up.
  const [choice, setChoice] = useState<VoiceChoice>(() => chooseVoice(LANGUAGE, voicesOf(synth())));
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const update = () => setChoice(chooseVoice(LANGUAGE, voicesOf(s)));
    update();
    s.addEventListener?.("voiceschanged", update);
    return () => s.removeEventListener?.("voiceschanged", update);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch {
        // Not persisted; the toggle still works for this visit.
      }
      if (!next) synth()?.cancel();
      return next;
    });
  }, []);

  const speak = useCallback(
    (text: string, options?: { force?: boolean; onEnd?: () => void }) => {
      const s = synth();
      // No voice for Hindi or Urdu on this device: nothing is read (the family is told, Settings).
      if ((!enabled && !options?.force) || !s || choice.using === "none") {
        options?.onEnd?.();
        return;
      }
      s.cancel();
      // Urdu read by a Hindi voice: speak the Hindi twin of the same words.
      const spoken = LANGUAGE === "ur" && choice.using === "hi" ? hindiTwin(text) : text;
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.rate = 0.9; // a little slower than default
      utterance.lang = choice.voice?.lang ?? copy.speechLang;
      if (choice.voice) utterance.voice = choice.voice;
      if (options?.onEnd) {
        utterance.onend = options.onEnd;
        utterance.onerror = options.onEnd;
      }
      s.speak(utterance);
    },
    [enabled, choice],
  );

  const cancel = useCallback(() => synth()?.cancel(), []);

  const value = useMemo(() => ({ enabled, toggle, speak, cancel, voice: choice }), [enabled, toggle, speak, cancel, choice]);
  return <ReadAloudContext.Provider value={value}>{children}</ReadAloudContext.Provider>;
}

/** Outside a provider (e.g. a game round rendered on its own in a test) nothing is spoken. */
const SILENT: ReadAloudValue = {
  enabled: false,
  toggle: () => undefined,
  speak: (_text, options) => options?.onEnd?.(),
  cancel: () => undefined,
  voice: { voice: null, using: "en", lang: "en-IN" },
};

export function useReadAloud(): ReadAloudValue {
  return useContext(ReadAloudContext) ?? SILENT;
}

/** Speak `text` whenever it changes (and read-aloud is on). Empty text says nothing. */
export function useSpeakOnChange(text: string): void {
  const { speak } = useReadAloud();
  useEffect(() => {
    if (text) speak(text);
  }, [text, speak]);
}
