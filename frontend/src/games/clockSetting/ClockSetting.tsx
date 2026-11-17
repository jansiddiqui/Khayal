import { Check, Clock } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { copy } from "../../copy";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { useFeedback } from "../../ui/feedback";
import { pressable } from "../../ui/motion";
import { AnswerButton, answerState, useChoice } from "../Answer";
import { QuestionRow } from "../QuestionRow";
import { HandDemo } from "../tutorial/HandDemo";
import type { GameDefinition, RoundProps } from "../types";
import { ClockFace } from "./ClockFace";
import {
  buildClockRound,
  digits,
  errorBits,
  hourPosition,
  readingChoices,
  same,
  scoreSetting,
  snapMinute,
  timeWords,
  type ClockRound,
  type Time,
} from "./logic";


const t = copy.games.clockSetting;

/** One round: set the hands to a time, or read the time a clock shows (levels 1 and 10). */
export function ClockSettingRound(props: RoundProps) {
  const { level, practice = false, rng = Math.random } = props;
  const round = useMemo(() => buildClockRound(level, rng, practice), [level, practice, rng]);
  return round.kind === "read" ? <ReadRound round={round} {...props} /> : <SetRound round={round} {...props} />;
}

type Which = "hour" | "minute";

function SetRound({ round, onComplete }: RoundProps & { round: ClockRound }) {
  const target = round.time;
  const shownAt = useRef(Date.now());
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const [moving, setMoving] = useState<Which>("hour");
  const { cue } = useFeedback();
  const reported = useRef(false);

  const words = timeWords(target, round.wordsOnly);
  const prompt = t.setTo(words);
  const step = hour === null ? t.tapShort : minute === null ? t.tapLong : t.tapDone;
  useSpeakOnChange(`${prompt} ${step}`);

  function place(angle: number) {
    cue("tap");
    if (moving === "hour") {
      setHour(hourPosition(angle));
      if (minute === null) setMoving("minute");
    } else {
      setMinute(snapMinute(angle));
    }
  }

  /** Keyboard: the selected hand moves half an hour or 5 minutes per arrow key. */
  function stepHand(direction: 1 | -1) {
    if (moving === "hour") setHour((h) => (((h ?? 12) - 0.5 + direction * 0.5 + 12) % 12) + 0.5);
    else setMinute((m) => (((m ?? 0) + direction * 5) % 60 + 60) % 60);
  }

  function done() {
    if (hour === null || minute === null || reported.current) return;
    reported.current = true;
    const result = scoreSetting(target, hour, minute);
    const correct = result.hourRight && result.minuteRight;
    onComplete(
      { correct, reaction_ms: Date.now() - shownAt.current, hint_used: false, errors: errorBits(result) },
      correct ? undefined : t.thisIs(timeWords(target)),
    );
  }

  const toggle = (which: Which, label: string) => (
    <button
      type="button"
      aria-pressed={moving === which}
      onClick={() => setMoving(which)}
      className={`flex min-h-[64px] flex-1 items-center justify-center gap-2 rounded-2xl border-4 px-2 text-lg leading-tight font-bold ${pressable} ${
        moving === which ? "border-brand bg-brand-soft text-brand-dark" : "border-line-strong bg-surface text-ink"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 shrink-0 rounded-full ${which === "hour" ? "w-5 bg-ink" : "w-8 bg-brand"}`}
      />
      {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <QuestionRow spoken={`${prompt} ${step}`}>
        <p className="text-2xl font-semibold">{prompt}</p>
        {!round.wordsOnly && <p className="text-xl text-ink-soft">{t.inDigits(digits(target))}</p>}
        <p className="mt-1 text-xl text-brand-dark" aria-live="polite">
          {step}
        </p>
      </QuestionRow>
      <div className="mx-auto w-full max-w-[17rem]">
        <ClockFace face={round.face} hour={hour} minute={minute} label={t.clockLabel} onTapAngle={place} onStep={stepHand} />
      </div>
      <div className="flex gap-2">
        {toggle("hour", t.shortHand)}
        {toggle("minute", t.longHand)}
      </div>
      <button
        type="button"
        onClick={done}
        disabled={hour === null || minute === null}
        className={`flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl border-4 border-brand bg-brand px-4 text-2xl font-bold text-white disabled:border-line-strong disabled:bg-sunken disabled:text-ink-soft ${pressable}`}
      >
        <Check aria-hidden="true" className="size-7" />
        {t.done}
      </button>
    </div>
  );
}

function ReadRound({ round, onComplete, practice = false, rng = Math.random }: RoundProps & { round: ClockRound }) {
  const shownAt = useRef(Date.now());
  const answer: Time = round.answer ?? round.time;
  const choices = useMemo(() => readingChoices(round, rng), [round, rng]);
  const [slipped, setSlipped] = useState(false);
  const { chosen, choose } = useChoice<string>(({ correct }) => {
    const words = timeWords(answer);
    onComplete(
      // A wrong reading counts as both hands misread (error bits 1 + 2).
      { correct, reaction_ms: Date.now() - shownAt.current, hint_used: false, errors: correct ? 0 : 3 },
      correct ? `${copy.games.orientation.yes}${t.itIs(words)}` : t.itIs(words),
    );
  });

  const prompt = round.later ? t.readLater : t.read;
  useSpeakOnChange(copy.common.spokenChoices([prompt, ...choices.map((c) => timeWords(c))]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={copy.common.spokenChoices([prompt, ...choices.map((c) => timeWords(c))])}>
        <p className="text-2xl font-semibold">{prompt}</p>
        {slipped && <p className="mt-1 text-xl text-brand-dark">{t.practiceHint(timeWords(answer))}</p>}
      </QuestionRow>
      <div className="mx-auto w-full max-w-[14rem]">
        <ClockFace face={round.face} hour={round.time.h + round.time.m / 60} minute={round.time.m} label={t.clockShowing(timeWords(round.time))} />
      </div>
      <div className="flex flex-col gap-3">
        {choices.map((c) => (
          <AnswerButton
            key={digits(c)}
            label={timeWords(c)}
            state={slipped && same(c, answer) ? "right" : answerState(chosen, digits(c))}
            onClick={() => {
              // Practice: a slip shows the right answer, and the round goes on until it is tapped.
              if (practice && !same(c, answer)) {
                setSlipped(true);
                return;
              }
              choose(digits(c), same(c, answer));
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ClockDemo() {
  return (
    <HandDemo label={t.tutorial.join(" ")} taps={[{ x: 74, y: 30 }, { x: 50, y: 12 }]}>
      <div className="mx-auto w-44">
        <ClockFace face="numbers" hour={2} minute={0} label="" />
      </div>
    </HandDemo>
  );
}

export const clockSetting: GameDefinition = {
  type: "clock_setting",
  title: t.title,
  intro: t.intro,
  icon: Clock,
  Round: ClockSettingRound,
  tutorial: { steps: t.tutorial, Demo: ClockDemo },
};
