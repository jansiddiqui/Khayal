import { motion, useReducedMotion } from "motion/react";

/**
 * The Khayal mark (docs/brand/logo-concepts.md): a soft heart whose point dissolves into a
 * thought bubble's trail, with a saffron dot above like the dot of خ. "Thought + care".
 */
export const HEART_PATH =
  "M32 48.5C22 41 12.5 33.8 12.5 24.6 12.5 18.3 17.4 13.5 23.4 13.5c3.7 0 6.8 1.9 8.6 4.7 1.8-2.8 4.9-4.7 8.6-4.7 6 0 10.9 4.8 10.9 11.1 0 9.2-9.5 16.4-19.5 23.9z";

type Tone = "color" | "reversed" | "mono";

const TONES: Record<Tone, { body: string; dot: string }> = {
  color: { body: "var(--color-teal-700)", dot: "var(--color-saffron-400)" },
  reversed: { body: "var(--color-ivory)", dot: "var(--color-saffron-400)" },
  mono: { body: "currentColor", dot: "currentColor" },
};

const EASE = [0.16, 1, 0.3, 1] as const;

interface MarkProps {
  size?: number;
  tone?: Tone;
  /** Draw the mark in once (the hero): outline, then fill, trail bubbles, and the dot last. */
  drawIn?: boolean;
  className?: string;
}

export function LogoMark({ size = 40, tone = "color", drawIn = false, className }: MarkProps) {
  const { body, dot } = TONES[tone];
  const reduce = useReducedMotion();
  const animate = drawIn && !reduce;

  if (!animate) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
        <path d={HEART_PATH} fill={body} stroke={body} strokeWidth={3.2} strokeLinejoin="round" />
        <circle cx={24.6} cy={54.6} r={3.7} fill={body} />
        <circle cx={18.6} cy={59.9} r={2.3} fill={body} />
        <circle cx={32} cy={6.6} r={4.7} fill={dot} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <motion.path
        d={HEART_PATH}
        stroke={body}
        strokeWidth={3.2}
        strokeLinejoin="round"
        initial={{ pathLength: 0, fillOpacity: 0 }}
        animate={{ pathLength: 1, fillOpacity: 1 }}
        fill={body}
        transition={{ pathLength: { duration: 0.7, ease: EASE }, fillOpacity: { delay: 0.55, duration: 0.35, ease: "easeOut" } }}
      />
      {[
        { cx: 24.6, cy: 54.6, r: 3.7, delay: 0.75 },
        { cx: 18.6, cy: 59.9, r: 2.3, delay: 0.85 },
      ].map((c) => (
        <motion.circle
          key={c.cx}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={body}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          transition={{ delay: c.delay, duration: 0.3, ease: EASE }}
        />
      ))}
      <motion.circle
        cx={32}
        cy={6.6}
        r={4.7}
        fill={dot}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.4, ease: EASE }}
      />
    </svg>
  );
}

interface LogoProps {
  tone?: "color" | "reversed";
  /** Height of the mark in px; the words scale with it. */
  size?: number;
  className?: string;
}

/** Mark + "Khayal" + "خیال". The visible words are the accessible name. */
export function Logo({ tone = "color", size = 36, className = "" }: LogoProps) {
  const word = tone === "color" ? "text-ink" : "text-ivory";
  const urdu = tone === "color" ? "text-teal-700" : "text-saffron-300";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} tone={tone} />
      <span className={`font-bold tracking-[-0.01em] ${word}`} style={{ fontSize: size * 0.62, lineHeight: 1 }}>
        Khayal
      </span>
      <span lang="ur" className={urdu} style={{ fontFamily: "var(--font-urdu)", fontSize: size * 0.5, lineHeight: 1 }}>
        خیال
      </span>
    </span>
  );
}
