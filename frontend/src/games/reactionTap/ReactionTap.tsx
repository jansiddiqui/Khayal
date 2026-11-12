import { CircleDot, Hand } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "../../copy";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { QuestionRow } from "../QuestionRow";
import type { GameDefinition, RoundProps } from "../types";
import { RED_FROM_LEVEL, redChance, RESPONSE_WINDOW_MS, TOO_EARLY_PAUSE_MS, waitMs } from "./logic";

type Circle = "waiting" | "green" | "red" | "tooEarly";

/**
 * Colour is never the only cue: "tap" is a green circle saying "Tap!"; "don't tap" is a red
 * rounded square with a hand-stop icon saying "Don't tap".
 */
const circleStyle: Record<Circle, string> = {
  waiting: "rounded-full border-line-strong bg-sunken text-ink",
  green: "rounded-full border-green-900 bg-green-600 text-white",
  red: "rounded-[2.5rem] border-red-900 bg-red-700 text-white",
  tooEarly: "rounded-full border-accent-strong bg-accent-soft text-ink",
};

/**
 * One round = one trial: after a random 2–5 s wait the circle turns green (tap within 3 s)
 * or, from level 4, sometimes red (don't tap). The only game with timing.
 * Reaction time = time from the colour change to the tap; null when nothing was tapped.
 * Tapping while waiting shows "Wait for green" and the trial starts again (it doesn't count).
 */
export function ReactionTapRound({ level, roundIndex, onComplete, rng = Math.random }: RoundProps) {
  const [circle, setCircle] = useState<Circle>("waiting");
  const [trial, setTrial] = useState(0);
  const shownAt = useRef(0);
  const reported = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const finish = (correct: boolean, reaction_ms: number | null) => {
    if (reported.current) return;
    reported.current = true;
    clearTimers();
    onComplete({ correct, reaction_ms, hint_used: false });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Start (or restart) a trial.
  useEffect(() => {
    setCircle("waiting");
    const colour: Circle = rng() < redChance(level) ? "red" : "green";
    timers.current.push(
      setTimeout(() => {
        shownAt.current = Date.now();
        setCircle(colour);
        // Nothing tapped in time: a missed green, or a red correctly left alone.
        timers.current.push(setTimeout(() => finishRef.current(colour === "red", null), RESPONSE_WINDOW_MS));
      }, waitMs(rng)),
    );
    return clearTimers;
  }, [trial, level, rng]);

  useEffect(() => {
    if (circle !== "tooEarly") return;
    const t = setTimeout(() => setTrial((n) => n + 1), TOO_EARLY_PAUSE_MS);
    return () => clearTimeout(t);
  }, [circle]);

  function tap() {
    if (circle === "waiting") {
      clearTimers(); // this trial is void; it restarts after the pause
      setCircle("tooEarly");
    } else if (circle === "green") {
      finish(true, Date.now() - shownAt.current);
    } else if (circle === "red") {
      finish(false, Date.now() - shownAt.current);
    }
  }

  const t = copy.games.reactionTap;
  const label = { waiting: t.waiting, green: t.green, red: t.red, tooEarly: t.tooEarly }[circle];
  const instructions = level >= RED_FROM_LEVEL ? t.instructionsWithRed : t.instructions;
  // Instructions once, at the start; speaking during a trial would delay the tap.
  useSpeakOnChange(circle === "tooEarly" ? t.tooEarly : roundIndex === 0 ? instructions : "");

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="self-stretch">
        <QuestionRow spoken={instructions}>
          <p className="text-2xl">{instructions}</p>
        </QuestionRow>
      </div>
      <button
        type="button"
        onClick={tap}
        aria-live="assertive"
        data-shape={circle === "red" ? "square" : "circle"}
        className={`flex h-64 w-64 flex-col items-center justify-center gap-2 border-8 text-3xl font-bold ${circleStyle[circle]}`}
      >
        {circle === "red" && <Hand aria-hidden="true" className="size-16" strokeWidth={2.5} />}
        {label}
      </button>
    </div>
  );
}

export const reactionTap: GameDefinition = {
  type: "reaction_tap",
  title: copy.games.reactionTap.title,
  intro: copy.games.reactionTap.intro,
  icon: CircleDot,
  Round: ReactionTapRound,
};
