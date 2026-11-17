import { motion } from "motion/react";
import { calm, DURATION, useLessMotion } from "../ui/motion";

/**
 * Today's progress for one thing (games, reminders), drawn as a small ring that fills once when the
 * screen opens. It sits inside the big button it belongs to, whose words already say it ("1 of 3
 * done today"), so the ring itself is decorative. Never a score, never a streak.
 */
export function ProgressRing({ done, total, size = 24 }: { done: number; total: number; size?: number }) {
  const less = useLessMotion();
  const stroke = Math.max(3, Math.round(size / 7));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: less ? circumference * (1 - share) : circumference }}
        animate={{ strokeDashoffset: circumference * (1 - share) }}
        transition={calm(less ? 0 : DURATION.slow * 2)}
      />
    </svg>
  );
}
