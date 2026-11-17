import { Pointer } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useLessMotion } from "../../ui/motion";

/** A point on the demo board, in percent of its width and height. */
export interface DemoPoint {
  x: number;
  y: number;
}

/** Seconds per move: glide to the point, tap, rest. */
const STEP_S = 1.6;

/** Keyframes for one loop: at each point the hand arrives, taps (a soft ring) and rests. */
export function demoKeyframes(taps: readonly DemoPoint[]) {
  const n = Math.max(1, taps.length);
  const left: string[] = [];
  const top: string[] = [];
  const times: number[] = [];
  const ring: number[] = [];
  taps.forEach((p, i) => {
    for (const [at, r] of [
      [0.35, 0],
      [0.55, 0.9],
      [0.95, 0],
    ] as const) {
      left.push(`${p.x}%`);
      top.push(`${p.y}%`);
      times.push((i + at) / n);
      ring.push(r);
    }
  });
  return { left, top, times, ring, duration: STEP_S * n };
}

/**
 * A small picture of the game board with a hand that shows one move (research.md 3.4). The hand
 * glides to each point in turn and taps; under reduced motion it rests on the first point.
 * Decorative: the spoken and written steps carry the meaning.
 */
export function HandDemo({ taps, children, label }: { taps: readonly DemoPoint[]; children: ReactNode; label: string }) {
  const less = useLessMotion();
  const first = taps[0] ?? { x: 50, y: 50 };
  const k = demoKeyframes(taps.length ? taps : [first]);
  const loop = { duration: k.duration, times: k.times, repeat: Infinity, ease: "easeInOut" as const };

  return (
    <figure role="img" aria-label={label} className="relative mx-auto w-full max-w-xs select-none">
      <div aria-hidden="true" className="pointer-events-none">
        {children}
      </div>
      {less ? (
        <span aria-hidden="true" className="absolute" style={{ left: `${first.x}%`, top: `${first.y}%` }}>
          <Pointer className="size-12 -translate-x-1/4 fill-surface text-ink" strokeWidth={1.75} />
        </span>
      ) : (
        <>
          <motion.span
            aria-hidden="true"
            className="absolute -mt-6 -ml-6 size-12 rounded-full border-4 border-accent"
            initial={{ left: k.left[0], top: k.top[0], opacity: 0 }}
            animate={{ left: k.left, top: k.top, opacity: k.ring }}
            transition={{ left: loop, top: loop, opacity: loop }}
          />
          <motion.span
            aria-hidden="true"
            className="absolute"
            initial={{ left: k.left[0], top: k.top[0] }}
            animate={{ left: k.left, top: k.top }}
            transition={{ left: loop, top: loop }}
          >
            <Pointer className="size-12 -translate-x-1/4 fill-surface text-ink drop-shadow" strokeWidth={1.75} />
          </motion.span>
        </>
      )}
    </figure>
  );
}

/** A plain rounded tile for demo boards. */
export function DemoTile({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={`flex items-center justify-center rounded-xl border-4 text-lg font-bold ${className}`}>{children}</div>;
}
