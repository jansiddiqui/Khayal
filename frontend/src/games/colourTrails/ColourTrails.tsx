import { Check, Spline } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { copy } from "../../copy";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { useFeedback } from "../../ui/feedback";
import { QuestionRow } from "../QuestionRow";
import { DemoTile, HandDemo } from "../tutorial/HandDemo";
import type { GameDefinition, RoundProps } from "../types";
import { buildTrail, MAX_ERRORS_FOR_CORRECT, medianGap, trailConfig, type Mark, type TrailItem } from "./logic";

const t = copy.games.colourTrails;

function markLook(mark: Mark): string {
  return mark === "circle"
    ? "rounded-full border-brand-dark bg-brand text-white"
    : "rounded-lg border-accent-strong bg-accent text-ink";
}

/**
 * One round = one trail. A right tap joins the number to the last one with a line; a wrong tap
 * doesn't join, and the game says which number to look for. Nothing ends by itself, and speed is
 * recorded but never shown (D2). Right = the trail finished with at most one wrong tap.
 */
export function ColourTrailsRound({ level, practice = false, onComplete, rng = Math.random }: RoundProps) {
  const config = trailConfig(level, practice);
  const items = useMemo(() => buildTrail(config, rng), [config.part, config.length, config.distractors, rng]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownAt = useRef(Date.now());
  const tapTimes = useRef<number[]>([]);
  const [joined, setJoined] = useState<TrailItem[]>([]);
  const [errors, setErrors] = useState(0);
  const [nudged, setNudged] = useState<{ id: number } | null>(null);
  const [lookFor, setLookFor] = useState<string | null>(null);
  const reported = useRef(false);
  const { cue } = useFeedback();

  const next = joined.length + 1;
  const prompt = config.part === 1 ? t.promptPart1 : t.promptPart2;
  useSpeakOnChange(lookFor ?? prompt);

  function tap(item: TrailItem) {
    if (reported.current || joined.some((j) => j.id === item.id)) return;
    const right = item.target && item.n === next;
    if (!right) {
      cue("gentle");
      setErrors((e) => e + 1);
      setNudged({ id: item.id });
      setLookFor(t.lookFor(next, config.part === 2 ? (next % 2 === 1 ? "circle" : "square") : null));
      return;
    }
    cue("tap");
    tapTimes.current.push(Date.now() - shownAt.current);
    const done = [...joined, item];
    setJoined(done);
    setLookFor(null);
    if (done.length === config.length) {
      reported.current = true;
      onComplete({
        correct: errors <= MAX_ERRORS_FOR_CORRECT,
        reaction_ms: medianGap(tapTimes.current),
        hint_used: false,
        errors,
      });
    }
  }

  const target = items.find((i) => i.target && i.n === next);
  // Practice: after a wrong tap the right number glows, so the patient learns without failing.
  const showAnswer = practice && errors > 0 ? target?.id : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={lookFor ?? prompt}>
        <p className="text-2xl" aria-live="polite">
          {lookFor ?? prompt}
        </p>
        <p className="mt-1 text-xl font-semibold text-brand-dark">{t.joinedOf(joined.length, config.length)}</p>
      </QuestionRow>
      <div className="relative min-h-[22rem] flex-1">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {joined.slice(1).map((item, i) => {
            const from = joined[i]!;
            return (
              <line
                key={item.id}
                x1={from.x}
                y1={from.y}
                x2={item.x}
                y2={item.y}
                stroke="var(--color-ink)"
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {items.map((item) => {
          const isJoined = joined.some((j) => j.id === item.id);
          const name = t.markName(item.n, config.part === 2 ? item.mark : null);
          return (
            <div
              key={item.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
            >
              <button
                type="button"
                onClick={() => tap(item)}
                onAnimationEnd={() => setNudged((prev) => (prev?.id === item.id ? null : prev))}
                aria-label={isJoined ? t.joinedName(name) : name}
                className={`relative flex size-[3rem] touch-manipulation items-center justify-center border-4 text-2xl font-bold shadow-lift transition-transform duration-150 ease-calm active:scale-95 motion-reduce:active:scale-100 ${markLook(item.mark)} ${
                  isJoined ? "ring-4 ring-calm ring-offset-2 ring-offset-surface" : ""
                } ${showAnswer === item.id ? "calm-glow ring-4 ring-accent-strong ring-offset-2 ring-offset-surface" : ""} ${
                  nudged?.id === item.id ? "gentle-nudge" : ""
                }`}
              >
                {item.n}
                {isJoined && (
                  <Check aria-hidden="true" className="absolute -top-2 -right-2 size-6 rounded-full bg-calm p-0.5 text-white" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ColourTrailsDemo() {
  const spots = [
    { n: 1, x: 22, y: 30 },
    { n: 2, x: 72, y: 22 },
    { n: 3, x: 50, y: 75 },
  ];
  return (
    <HandDemo label={t.tutorial.join(" ")} taps={spots.slice(0, 2)}>
      <div className="relative h-44">
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1={22} y1={30} x2={72} y2={22} stroke="var(--color-ink)" strokeWidth={4} vectorEffect="non-scaling-stroke" />
        </svg>
        {spots.map((s) => (
          <div key={s.n} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
            <DemoTile className={`size-14 ${markLook("circle")}`}>{s.n}</DemoTile>
          </div>
        ))}
      </div>
    </HandDemo>
  );
}

export const colourTrails: GameDefinition = {
  type: "colour_trails",
  title: t.title,
  intro: t.intro,
  icon: Spline,
  Round: ColourTrailsRound,
  tutorial: { steps: t.tutorial, Demo: ColourTrailsDemo },
};
