import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Patient-side touch and sound feedback (Phase C). Both are optional and switched in the small
 * settings sheet next to Read aloud; the choice is remembered on this device only.
 * - Vibration: a light tick on phones that support it (navigator.vibrate). On by default.
 * - Sound: a soft, low tone made in the browser (no audio files). Off by default, so the app is
 *   never noisy unless someone chose it.
 * Never used for anything alarming: there is no "wrong" sound, only a gentle low note.
 */
export interface FeedbackSettings {
  vibration: boolean;
  sound: boolean;
}

type Cue = "tap" | "success" | "gentle";

interface FeedbackValue {
  settings: FeedbackSettings;
  set: (change: Partial<FeedbackSettings>) => void;
  /** Can this device vibrate at all? */
  canVibrate: boolean;
  cue: (kind: Cue) => void;
}

const STORAGE_KEY = "khayal.feedback";
const DEFAULTS: FeedbackSettings = { vibration: true, sound: false };

function load(): FeedbackSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<FeedbackSettings>;
    return { vibration: parsed.vibration ?? DEFAULTS.vibration, sound: parsed.sound ?? DEFAULTS.sound };
  } catch {
    return DEFAULTS;
  }
}

const VIBRATION: Record<Cue, number | number[]> = { tap: 8, success: [10, 70, 16], gentle: 20 };
// Soft sine tones (Hz, seconds), quiet enough to sit under speech.
const TONES: Record<Cue, [number, number][]> = {
  tap: [[540, 0.05]],
  success: [[587, 0.09], [784, 0.16]],
  gentle: [[392, 0.14]],
};

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FeedbackSettings>(load);
  const audio = useRef<AudioContext | null>(null);
  const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  const set = useCallback((change: Partial<FeedbackSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...change };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Not remembered; it still works for this visit.
      }
      return next;
    });
  }, []);

  const cue = useCallback(
    (kind: Cue) => {
      if (settings.vibration && canVibrate) {
        try {
          navigator.vibrate(VIBRATION[kind]);
        } catch {
          // Some browsers refuse without a fresh user gesture; feedback is optional.
        }
      }
      if (settings.sound && typeof window !== "undefined" && "AudioContext" in window) {
        try {
          audio.current ??= new AudioContext();
          const ctx = audio.current;
          let at = ctx.currentTime;
          for (const [frequency, length] of TONES[kind]) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(0.06, at + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
            osc.connect(gain).connect(ctx.destination);
            osc.start(at);
            osc.stop(at + length + 0.02);
            at += length * 0.8;
          }
        } catch {
          // No audio on this device; feedback is optional.
        }
      }
    },
    [settings, canVibrate],
  );

  const value = useMemo(() => ({ settings, set, canVibrate, cue }), [settings, set, canVibrate, cue]);
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

const SILENT: FeedbackValue = { settings: DEFAULTS, set: () => undefined, canVibrate: false, cue: () => undefined };

/** Outside a provider (a game round rendered on its own in a test) nothing vibrates or sounds. */
export function useFeedback(): FeedbackValue {
  return useContext(FeedbackContext) ?? SILENT;
}
