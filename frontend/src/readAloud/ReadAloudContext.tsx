import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { copy } from "../copy";

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
}

const ReadAloudContext = createContext<ReadAloudValue | null>(null);

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

export function ReadAloudProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(loadEnabled);

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
      if ((!enabled && !options?.force) || !s) {
        options?.onEnd?.();
        return;
      }
      s.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9; // a little slower than default
      utterance.lang = copy.speechLang;
      if (options?.onEnd) {
        utterance.onend = options.onEnd;
        utterance.onerror = options.onEnd;
      }
      s.speak(utterance);
    },
    [enabled],
  );

  const cancel = useCallback(() => synth()?.cancel(), []);

  const value = useMemo(() => ({ enabled, toggle, speak, cancel }), [enabled, toggle, speak, cancel]);
  return <ReadAloudContext.Provider value={value}>{children}</ReadAloudContext.Provider>;
}

/** Outside a provider (e.g. a game round rendered on its own in a test) nothing is spoken. */
const SILENT: ReadAloudValue = {
  enabled: false,
  toggle: () => undefined,
  speak: (_text, options) => options?.onEnd?.(),
  cancel: () => undefined,
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
