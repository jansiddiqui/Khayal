import { ArrowRight, Check, MapPin } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { copy } from "../../copy";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { useFeedback } from "../../ui/feedback";
import { pressable } from "../../ui/motion";
import { QuestionRow } from "../QuestionRow";
import { DemoTile, HandDemo } from "../tutorial/HandDemo";
import type { GameDefinition, RoundProps } from "../types";
import { buildBoard, median, objectLocationConfig, type ObjectId } from "./logic";
import { photoFor } from "./photos";

const t = copy.games.objectLocation;
const objectName = (id: ObjectId) => copy.objects[id];

function Photo({ id, className = "" }: { id: ObjectId; className?: string }) {
  const src = photoFor(id);
  return (
    <picture>
      <source srcSet={src.webp} type="image/webp" />
      <img src={src.jpg} alt="" width={400} height={400} draggable={false} className={`object-contain ${className}`} />
    </picture>
  );
}

type Phase =
  | { kind: "study"; index: number }
  | { kind: "recall"; queue: ObjectId[]; pass: 1 | 2 }
  | { kind: "show" };

/**
 * One round = one board (PAL task idea, research.md 2.1). Objects are shown one at a time in their
 * boxes; "Next" moves on (no timer). Then each object appears above the grid and the patient taps
 * its box. Misplaced ones are shown again ("Here's where they were") for one more try: right on the
 * second try counts as right with a hint. `errors` = first-try misplacements (PAL's main score).
 */
export function ObjectLocationRound({ level, practice = false, onComplete, rng = Math.random }: RoundProps) {
  const config = objectLocationConfig(level, practice);
  const board = useMemo(() => buildBoard(config, rng), [config.objects, config.boxes, config.similar, rng]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxOf = (id: ObjectId) => board.placements.find((p) => p.object === id)!.box;

  const [phase, setPhase] = useState<Phase>({ kind: "study", index: 0 });
  const [placed, setPlaced] = useState<ObjectId[]>([]);
  const [nudged, setNudged] = useState<number | null>(null);
  const [slipped, setSlipped] = useState(false);
  const missed = useRef<ObjectId[]>([]);
  const firstTry = useRef({ errors: 0, times: [] as number[] });
  const studyStart = useRef(Date.now());
  const studyMs = useRef(0);
  const askedAt = useRef(0);
  const reported = useRef(false);
  const { cue } = useFeedback();

  const total = board.placements.length;
  const current = phase.kind === "recall" ? phase.queue[0] : undefined;
  const prompt =
    phase.kind === "study"
      ? t.study(phase.index + 1, total)
      : phase.kind === "show"
        ? t.again
        : t.whereWas(objectName(current!));
  useSpeakOnChange(prompt);

  function startRecall(queue: ObjectId[], pass: 1 | 2) {
    askedAt.current = Date.now();
    setPhase({ kind: "recall", queue, pass });
  }

  function nextStudy() {
    if (phase.kind !== "study") return;
    if (phase.index + 1 < total) setPhase({ kind: "study", index: phase.index + 1 });
    else {
      studyMs.current += Date.now() - studyStart.current;
      startRecall(board.askOrder, 1);
    }
  }

  function finish(correct: boolean, hint: boolean) {
    if (reported.current) return;
    reported.current = true;
    onComplete({
      correct,
      reaction_ms: firstTry.current.times.length ? median(firstTry.current.times) : null,
      hint_used: hint,
      study_ms: studyMs.current,
      errors: firstTry.current.errors,
    });
  }

  function tapBox(box: number) {
    if (phase.kind !== "recall" || !current || reported.current) return;
    const right = boxOf(current) === box;
    if (phase.pass === 1) {
      firstTry.current.times.push(Date.now() - askedAt.current);
      if (!right) firstTry.current.errors += 1;
    }
    if (!right && practice) {
      // Practice: show the box, and wait for it (errorless learning).
      cue("gentle");
      setSlipped(true);
      setNudged(box);
      return;
    }
    cue(right ? "success" : "gentle");
    if (right) setPlaced((p) => [...p, current]);
    else {
      setNudged(box);
      if (phase.pass === 1) missed.current.push(current);
    }
    const rest = phase.queue.slice(1);
    if (rest.length > 0) {
      askedAt.current = Date.now();
      setPhase({ ...phase, queue: rest });
      return;
    }
    if (phase.pass === 1) {
      if (missed.current.length === 0) finish(true, false);
      else setPhase({ kind: "show" });
    } else {
      // Second try: right only if every one is now in place.
      finish(placed.length + (right ? 1 : 0) === total, true);
    }
  }

  const shownIn = (box: number): ObjectId | undefined => {
    if (phase.kind === "study") {
      const p = board.placements[phase.index]!;
      return p.box === box ? p.object : undefined;
    }
    if (phase.kind === "show") return board.placements.find((p) => p.box === box)?.object;
    return placed.find((o) => boxOf(o) === box);
  };
  const answerBox = practice && slipped && current ? boxOf(current) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={prompt}>
        <p className="text-2xl font-semibold" aria-live="polite">
          {prompt}
        </p>
        {phase.kind === "recall" && (
          <p className="mt-1 text-xl text-brand-dark">{answerBox !== undefined ? t.practiceHint : t.placedOf(placed.length, total)}</p>
        )}
      </QuestionRow>
      {current && (
        <div className="flex items-center gap-3 self-center rounded-2xl border-4 border-accent bg-surface p-1.5 pr-4 shadow-lift">
          <Photo id={current} className="size-[4rem] rounded-xl" />
          <span className="text-2xl font-bold">{objectName(current)}</span>
        </div>
      )}
      <div
        className="mx-auto grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${config.cols}, 5.2rem)` }}
        role="group"
        aria-label={copy.games.objectLocation.title}
      >
        {Array.from({ length: config.boxes }, (_, box) => {
          const inside = shownIn(box);
          const isPlaced = phase.kind === "recall" && inside !== undefined;
          return (
            <button
              key={box}
              type="button"
              disabled={phase.kind !== "recall" || isPlaced}
              onClick={() => tapBox(box)}
              onAnimationEnd={() => setNudged((n) => (n === box ? null : n))}
              aria-label={inside ? t.boxWith(box + 1, objectName(inside)) : t.box(box + 1)}
              className={`relative flex size-[5.2rem] items-center justify-center overflow-hidden rounded-2xl border-4 bg-surface shadow-lift ${pressable} ${
                isPlaced ? "border-calm" : inside ? "border-accent" : "border-brand"
              } ${nudged === box ? "gentle-nudge" : ""} ${answerBox === box ? "calm-glow ring-4 ring-accent-strong ring-offset-2 ring-offset-surface" : ""}`}
            >
              {inside ? (
                <Photo id={inside} className="size-full p-1" />
              ) : (
                <span aria-hidden="true" className="size-4 rounded-full bg-brand-soft" />
              )}
              {isPlaced && <Check aria-hidden="true" className="absolute top-1 right-1 size-5 rounded-full bg-calm p-0.5 text-white" />}
            </button>
          );
        })}
      </div>
      {phase.kind === "study" && (
        <button
          type="button"
          onClick={nextStudy}
          className={`mt-auto flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl border-4 border-brand bg-brand px-4 text-2xl font-bold text-white ${pressable}`}
        >
          {phase.index + 1 < total ? t.next : t.ready}
          <ArrowRight aria-hidden="true" className="size-7" />
        </button>
      )}
      {phase.kind === "show" && (
        <button
          type="button"
          onClick={() => {
            const retry = missed.current;
            missed.current = [];
            startRecall(retry, 2);
          }}
          className={`mt-auto flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl border-4 border-brand bg-brand px-4 text-2xl font-bold text-white ${pressable}`}
        >
          {t.next}
          <ArrowRight aria-hidden="true" className="size-7" />
        </button>
      )}
    </div>
  );
}

function ObjectLocationDemo() {
  return (
    <HandDemo label={t.tutorial.join(" ")} taps={[{ x: 76, y: 74 }]}>
      <div className="flex flex-col items-center gap-2 p-2">
        <div className="flex items-center gap-2 rounded-xl border-4 border-accent bg-surface p-1 pr-3">
          <Photo id="key" className="size-12" />
          <span className="font-bold">{objectName("key")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <DemoTile key={i} className="size-16 border-brand bg-surface" />
          ))}
        </div>
      </div>
    </HandDemo>
  );
}

export const objectLocation: GameDefinition = {
  type: "object_location",
  title: t.title,
  intro: t.intro,
  icon: MapPin,
  Round: ObjectLocationRound,
  tutorial: { steps: t.tutorial, Demo: ObjectLocationDemo },
};
