import { useEffect, useRef, useState } from "react";
import { useLessMotion } from "./motion";

/**
 * A number that counts up once when it first appears (600ms, easing out). Later changes jump
 * straight to the new value, and under reduced motion it never animates. Screen readers get the
 * final value only.
 */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const less = useLessMotion();
  const [shown, setShown] = useState(less ? value : 0);
  const done = useRef(less);

  useEffect(() => {
    if (done.current) {
      setShown(value);
      return;
    }
    done.current = true;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      setShown(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
