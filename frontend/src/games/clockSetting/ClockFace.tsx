import type { KeyboardEvent, MouseEvent } from "react";
import { angleOf, hourAngle, minuteAngle, type Face } from "./logic";

const R = 100;

function polar(angle: number, r: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.sin(rad) * r, y: -Math.cos(rad) * r };
}

function Hand({ angle, length, width, className }: { angle: number; length: number; width: number; className: string }) {
  const tip = polar(angle, length);
  return <line x1={0} y1={0} x2={tip.x} y2={tip.y} strokeWidth={width} strokeLinecap="round" className={className} />;
}

/**
 * A plain clock face: ivory dial, ink numbers, a short thick hand and a long hand in teal.
 * `onTapAngle` makes it a setting surface: each tap reports its angle clockwise from 12.
 */
export function ClockFace({
  face,
  hour,
  minute,
  label,
  onTapAngle,
  onStep,
}: {
  face: Face;
  /** Short hand position in hours (0.5 steps), or null when not placed yet. */
  hour: number | null;
  /** Long hand in minutes, or null when not placed yet. */
  minute: number | null;
  label: string;
  onTapAngle?: (angle: number) => void;
  /** Keyboard: arrow keys move the selected hand one step either way. */
  onStep?: (direction: 1 | -1) => void;
}) {
  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (!onStep) return;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") onStep(1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") onStep(-1);
    else return;
    event.preventDefault();
  }

  function onTap(event: MouseEvent<SVGSVGElement>) {
    if (!onTapAngle) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    // Taps right on the middle have no direction.
    if (Math.hypot(x, y) < box.width * 0.07) return;
    onTapAngle(angleOf(x, y));
  }

  const numbers = face === "numbers" ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : face === "quarters" ? [12, 3, 6, 9] : [];
  return (
    <svg
      viewBox="-110 -110 220 220"
      role="img"
      aria-label={label}
      onClick={onTap}
      onKeyDown={onKey}
      tabIndex={onStep ? 0 : undefined}
      className={`aspect-square w-full touch-none rounded-full select-none ${onTapAngle ? "cursor-pointer" : ""}`}
    >
      <circle r={R} className="fill-surface stroke-ink" strokeWidth={5} />
      {Array.from({ length: 60 }, (_, i) => {
        const hourMark = i % 5 === 0;
        if (!hourMark && face !== "ticks") return null;
        const a = polar(i * 6, R - 4);
        const b = polar(i * 6, R - (hourMark ? 16 : 8));
        return (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={hourMark ? 4 : 1.5} strokeLinecap="round" className="stroke-ink" />
        );
      })}
      {numbers.map((n) => {
        const p = polar(n * 30, R - 32);
        return (
          <text key={n} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className="fill-ink text-[22px] font-bold">
            {n}
          </text>
        );
      })}
      {hour !== null && <Hand angle={hourAngle(hour)} length={52} width={11} className="stroke-ink" />}
      {minute !== null && <Hand angle={minuteAngle(minute)} length={80} width={7} className="stroke-brand" />}
      <circle r={7} className="fill-ink" />
    </svg>
  );
}
