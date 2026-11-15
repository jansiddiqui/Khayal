import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Small offset in ms when several pieces of one room arrive together (kept under 200 ms). */
  delay?: number;
  /** Rise from below (default) or settle from the side, so rooms do not all enter the same way. */
  from?: "below" | "left" | "right";
  as?: "div" | "li" | "section";
}

/**
 * A room arrives as you reach it: a short fade with a small rise, once, 350 ms ease-out.
 * Under prefers-reduced-motion it is plain markup: nothing moves, nothing waits.
 */
export function Reveal({ children, className, delay = 0, from = "below", as = "div" }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const offset = from === "below" ? { y: 18 } : { x: from === "left" ? -18 : 18 };
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: delay / 1000 }}
    >
      {children}
    </Tag>
  );
}

/**
 * Scroll to a section of the landing page. Sections below the hero load lazily, so wait (up
 * to 3 s) for the target to exist. Smooth unless the visitor prefers reduced motion.
 */
export function goToSection(id: string): void {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const started = Date.now();
  const tryScroll = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
      // Move keyboard focus with the view, without a second jump.
      el.focus({ preventScroll: true });
      return;
    }
    if (Date.now() - started < 3000) window.setTimeout(tryScroll, 60);
  };
  tryScroll();
}
