import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "khayal.readAloud";

interface ReadAloudValue {
  enabled: boolean;
  toggle: () => void;
  /** Speak `text` with the browser's speechSynthesis, if read-aloud is on and supported. */
  speak: (text: string) => void;
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
    (text: string) => {
      const s = synth();
      if (!enabled || !s) return;
      s.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9; // a little slower than default
      s.speak(utterance);
    },
    [enabled],
  );

  const value = useMemo(() => ({ enabled, toggle, speak }), [enabled, toggle, speak]);
  return <ReadAloudContext.Provider value={value}>{children}</ReadAloudContext.Provider>;
}

export function useReadAloud(): ReadAloudValue {
  const ctx = useContext(ReadAloudContext);
  if (!ctx) throw new Error("useReadAloud must be used inside <ReadAloudProvider>");
  return ctx;
}
