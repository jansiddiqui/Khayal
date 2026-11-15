import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useId, useRef } from "react";
import { HEART_PATH } from "./Logo";

const TILE = 56;

/** One jaali tile: four small Khayal hearts meeting point to point (a quatrefoil), like a carved stone screen. */
function Tile({ color }: { color: string }) {
  const c = TILE / 2;
  return (
    <>
      {[0, 90, 180, 270].map((k) => (
        <path
          key={k}
          d={HEART_PATH}
          fill={color}
          transform={`translate(${c} ${c}) rotate(${k}) translate(0 -9.5) scale(0.26) translate(-32 -31)`}
        />
      ))}
      {[
        [0, 0],
        [TILE, 0],
        [0, TILE],
        [TILE, TILE],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={2.2} fill={color} />
      ))}
    </>
  );
}

interface JaaliProps {
  /** Colour of the lattice (a lighter tone of the ground it sits on). */
  color?: string;
  /** Where the light falls, as fractions of the box. */
  lightX?: number;
  lightY?: number;
  /** Let the light drift a little as the section scrolls (off under reduced motion). */
  drift?: boolean;
  className?: string;
}

/**
 * Light through a jaali: the lattice shows only where a soft pool of light falls on it.
 * Decorative (aria-hidden); text never sits on the brightest part.
 */
export function Jaali({ color = "var(--color-teal-700)", lightX = 0.75, lightY = 0.4, drift = false, className = "" }: JaaliProps) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -48]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 36]);
  const move = drift && !reduce;

  return (
    <div ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <motion.svg className="absolute -inset-16 h-[calc(100%+8rem)] w-[calc(100%+8rem)]" style={move ? { x, y } : undefined}>
        <defs>
          <pattern id={`j${id}`} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            <Tile color={color} />
          </pattern>
          <radialGradient id={`l${id}`} cx={lightX} cy={lightY} r="0.6">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id={`m${id}`}>
            <rect width="100%" height="100%" fill={`url(#l${id})`} />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={`url(#j${id})`} mask={`url(#m${id})`} />
      </motion.svg>
    </div>
  );
}
