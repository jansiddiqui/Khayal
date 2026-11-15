import { AlarmClock, Check, CircleCheck, House, Pill, Soup, TriangleAlert, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { CARD_ART } from "../../games/memory/art";
import type { CardFace } from "../../games/memoryMatch/logic";

/**
 * The real product, drawn small for the landing page: the same layouts the app ships, with a
 * sample name and made-up numbers. Illustrations, not screenshots; each is described by its
 * figure caption, and the drawing itself is hidden from screen readers.
 */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative mx-auto w-[13.75rem] rounded-[2.4rem] border-[0.55rem] border-teal-950 bg-teal-950 shadow-[0_30px_60px_-20px_rgb(0_20_22_/_0.55),0_12px_24px_-12px_rgb(0_20_22_/_0.4)] sm:w-[15rem] ${className}`}
    >
      <div className="absolute top-2 left-1/2 z-10 h-[0.9rem] w-[4.5rem] -translate-x-1/2 rounded-full bg-teal-950" />
      <div className="overflow-hidden rounded-[1.85rem] bg-paper px-3 pt-8 pb-5 text-ink" style={{ fontSize: "0.62rem" }}>
        {children}
      </div>
    </div>
  );
}

/** The top bar every patient screen shares: Home and Read aloud. */
export function TopBar() {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-2">
      <span className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-ink px-2.5 py-1.5 font-bold">
        <House className="size-[1.1em]" />
        Home
      </span>
      <span className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-ink px-2 py-1.5 font-bold">
        <VolumeX className="size-[1.1em]" />
        Read aloud: Off
      </span>
    </div>
  );
}

const BOARD: (CardFace | null)[] = ["chai", null, "diya", "kite", null, "mango", "diya", null, null, "kite", "chai", null];

/** Find the Pairs, mid-game: some pairs found (soft green), the rest face down. */
export function GameScreen() {
  return (
    <PhoneFrame>
      <TopBar />
      <p className="mt-3 text-[1.25em] leading-tight font-bold">Find the pairs</p>
      <p className="mt-0.5 text-ink-soft">Round 2 of 5 · take your time</p>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {BOARD.map((face, i) => {
          const Art = face ? CARD_ART[face] : null;
          return (
            <span
              key={i}
              className={`flex aspect-square items-center justify-center rounded-lg border-2 ${
                Art ? "border-calm bg-calm-soft" : "border-brand bg-brand"
              }`}
            >
              {Art ? <Art className="size-[70%]" /> : <span className="size-2 rounded-full bg-saffron-400" />}
            </span>
          );
        })}
      </div>
      <p className="mt-2.5 rounded-lg bg-calm-soft px-2 py-1.5 text-center font-bold text-calm">Well done, a pair!</p>
    </PhoneFrame>
  );
}

const REMINDERS = [
  { icon: Pill, time: "9:00", title: "Blood pressure tablet", done: true },
  { icon: Soup, time: "1:00", title: "Lunch", done: false },
  { icon: AlarmClock, time: "6:00", title: "Evening walk", done: false },
];

/** Today's reminders: one big Done button each; done ones turn calm green. */
export function RemindersScreen() {
  return (
    <PhoneFrame>
      <TopBar />
      <p className="mt-3 text-[1.25em] leading-tight font-bold">Today's reminders</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {REMINDERS.map(({ icon: Icon, time, title, done }) => (
          <li key={title} className={`rounded-xl border-2 px-2.5 py-2 ${done ? "border-calm bg-calm-soft" : "border-line-strong bg-surface"}`}>
            <span className="flex items-center gap-2">
              <Icon className="size-[1.3em] shrink-0 text-brand" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block font-bold">{title}</span>
                <span className="text-ink-soft">{time}</span>
              </span>
            </span>
            <span
              className={`mt-1.5 flex min-h-[2.6em] items-center justify-center gap-1 rounded-lg text-[1.1em] font-bold ${
                done ? "text-calm" : "bg-brand text-white"
              }`}
            >
              {done ? (
                <>
                  <Check className="size-[1.1em]" /> Done
                </>
              ) : (
                "Done"
              )}
            </span>
          </li>
        ))}
      </ul>
    </PhoneFrame>
  );
}

// One game's composite over 30 sessions: steady inside the normal band, then a gentle dip.
const POINTS = [0.6, 0.62, 0.59, 0.63, 0.61, 0.6, 0.62, 0.64, 0.61, 0.6, 0.62, 0.61, 0.63, 0.6, 0.61, 0.62, 0.6, 0.59, 0.61, 0.6, 0.58, 0.59, 0.57, 0.56, 0.57, 0.55, 0.56, 0.54, 0.55, 0.55];

/** The family's view of one game: the line against the elder's own normal, status in words, a plain sentence. */
export function TrendPanel() {
  const w = 300;
  const h = 120;
  const y = (v: number) => h - 10 - ((v - 0.48) / (0.68 - 0.48)) * (h - 20);
  const x = (i: number) => 8 + (i * (w - 16)) / (POINTS.length - 1);
  const line = POINTS.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[22rem] rounded-2xl border border-line bg-surface p-4 shadow-[0_30px_60px_-30px_rgb(0_20_22_/_0.45)]" style={{ fontFamily: "var(--font-caregiver)" }}>
      <div className="flex items-baseline justify-between gap-2 text-[0.75rem]">
        <span className="font-semibold">Find the Pairs · Kamala Devi</span>
        <span className="flex items-center gap-1 text-warning">
          <TriangleAlert className="size-[1.1em]" /> This game: Watch
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full">
        <rect x="0" y={y(0.66)} width={w} height={y(0.57) - y(0.66)} rx="6" fill="var(--color-teal-50)" />
        <text x="6" y={y(0.66) - 4} fontSize="10" fill="var(--color-teal-700)" fontWeight="600">
          Her normal
        </text>
        <path d={line} fill="none" stroke="var(--color-teal-600)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(POINTS.length - 1)} cy={y(POINTS[POINTS.length - 1]!)} r="4" fill="var(--color-saffron-500)" />
      </svg>
      <p className="mt-2 text-[0.75rem] leading-snug text-ink">
        A little below her own normal this week: average 0.55, her normal 0.61. Nothing to worry about yet.
      </p>
      <p className="mt-1.5 flex items-center gap-1 text-[0.7rem] text-success">
        <CircleCheck className="size-[1.1em]" /> Overall: Stable · reminders 12 of 14 done
      </p>
    </div>
  );
}
