import { useEffect } from "react";
import { reportVoiceCheck } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { LANGUAGE } from "../copy";
import { useReadAloud } from "./ReadAloudContext";

const REPORTED_KEY = "khayal.voiceReported";
/** Chrome fills its voice list a moment after start-up; report once it has had time to settle. */
const SETTLE_MS = 2500;

/**
 * The elder's device tells the family which read-aloud voice it found for the app language
 * (Round 2 batch 5): shown under Settings → Language on the caregiver page ("Urdu is read with a
 * Hindi voice", "This phone has no Hindi voice"). Sent again only when the answer changes.
 */
export function useReportVoice(): void {
  const { state } = useAuth();
  const { voice } = useReadAloud();
  const isPatient = state.status === "authenticated" && state.user.role === "patient";
  const report = JSON.stringify({ lang: LANGUAGE, voice: voice.voice?.name ?? null, using: voice.using });

  useEffect(() => {
    if (!isPatient || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const timer = setTimeout(() => {
      let last: string | null = null;
      try {
        last = localStorage.getItem(REPORTED_KEY);
      } catch {
        // Not stored: report anyway.
      }
      if (last === report) return;
      void reportVoiceCheck(JSON.parse(report))
        .then(() => {
          try {
            localStorage.setItem(REPORTED_KEY, report);
          } catch {
            // Reported again next time; harmless.
          }
        })
        .catch(() => undefined);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [isPatient, report]);
}
