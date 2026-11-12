import { useCallback, useEffect, useRef, useState } from "react";

/** The task stops by itself after 3 minutes; the patient never sees a countdown. */
export const AUTO_STOP_MS = 3 * 60 * 1000;

/** Opus in WebM where the browser supports it (Chrome, Edge, Firefox), else Ogg. */
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export interface Recording {
  audio: Blob;
  durationMs: number;
}

export type RecorderState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording" }
  | { kind: "denied" }
  | { kind: "finished"; recording: Recording };

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Microphone recording with a live sound level (0-1) for a simple bar.
 * `stop()` (or the 3-minute auto-stop) ends in the "finished" state with the audio.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>({ kind: "idle" });
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);

  const release = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (autoStop.current !== null) clearTimeout(autoStop.current);
    autoStop.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    setState({ kind: "starting" });
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState({ kind: "denied" });
      return;
    }
    stream.current = media;
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt.current;
      release();
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0]!;
      setState({ kind: "finished", recording: { audio: new Blob(chunks, { type }), durationMs } });
    };
    recorder.current = rec;

    // Live sound level from an analyser; the bar only shows that the microphone hears something.
    if (typeof AudioContext !== "undefined") {
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(media).connect(analyser);
        audioContext.current = ctx;
        const samples = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const v of samples) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
          frame.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // No level bar; recording still works.
      }
    }

    startedAt.current = Date.now();
    rec.start(1000);
    autoStop.current = setTimeout(stop, AUTO_STOP_MS);
    setState({ kind: "recording" });
  }, [release, stop]);

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  // Leaving the screen mid-recording releases the microphone without saving.
  useEffect(
    () => () => {
      if (recorder.current) recorder.current.onstop = null;
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      release();
    },
    [release],
  );

  return { state, level, start, stop, reset };
}
