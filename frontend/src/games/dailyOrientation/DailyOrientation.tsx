import { CalendarDays } from "lucide-react";
import { OrientationDemo } from "../tutorial/demos";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { QuestionRow } from "../QuestionRow";
import { listFamily } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AuthedImage } from "../../components/AuthedImage";
import { AnswerButton, answerState, useChoice } from "../Answer";
import { copy } from "../../copy";
import type { GameDefinition, RoundProps } from "../types";
import { buildQuestion } from "./logic";
import { dueFestival, festivalQuestion } from "./festivals";
import { FESTIVAL_ART } from "./festivals/FestivalArt";

const LAST_QUESTION = 4;

/**
 * One round = one question about today. No levels and no hint. The reply always
 * states the right answer kindly ("It's Wednesday today."), prefixed "Yes!" when right.
 * The last question is "Who is this?" with a family photo once 3+ people have photos.
 * Reaction time = time to answer, from when the question (and photo) appears.
 */
/** About Today's 6th question when a festival the family celebrates is within 30 days (D6). */
export const FESTIVAL_ROUND = 5;

function FestivalRound({ onComplete, rng = Math.random }: RoundProps) {
  const { state } = useAuth();
  const festivals = state.status === "authenticated" ? (state.user.festivals ?? []) : [];
  const question = useMemo(() => festivalQuestion(festivals, new Date(), rng), [festivals, rng]);
  const askedAt = useRef(Date.now());
  const answeredIn = useRef(0);
  const o = copy.games.orientation;
  const { chosen, choose } = useChoice<string>(({ correct }) => {
    if (!question) return;
    const reply = o.replyFestival(copy.festivals[question.answer]);
    onComplete({ correct, reaction_ms: answeredIn.current, hint_used: false }, correct ? o.yes + reply : reply);
  });
  const names = question?.options.map((id) => copy.festivals[id]) ?? [];
  const spoken = `${o.askFestival} ${copy.common.spokenChoices(names)}`;
  useSpeakOnChange(spoken);
  if (!question) return <p className="text-2xl">{copy.common.loading}</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={spoken}>
        <p className="text-3xl font-semibold">{o.askFestival}</p>
      </QuestionRow>
      <div className="flex flex-col gap-3">
        {question.options.map((id) => {
          const Picture = FESTIVAL_ART[id];
          return (
            <AnswerButton
              key={id}
              label={copy.festivals[id]}
              icon={<Picture className="size-12 shrink-0" />}
              state={answerState(chosen, id)}
              onClick={() => {
                answeredIn.current = Date.now() - askedAt.current;
                choose(id, id === question.answer);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function DailyOrientationRound(props: RoundProps) {
  return props.roundIndex === FESTIVAL_ROUND ? <FestivalRound {...props} /> : <OrientationQuestion {...props} />;
}

function OrientationQuestion({ roundIndex, onComplete, rng = Math.random }: RoundProps) {
  const { state } = useAuth();
  const user = state.status === "authenticated" ? state.user : null;
  const needsFamily = roundIndex === LAST_QUESTION && user !== null;
  const family = useQuery({
    queryKey: ["family", user?.id],
    queryFn: () => listFamily(user!.id),
    enabled: needsFamily,
  });
  const ready = !needsFamily || !family.isPending;

  const question = useMemo(
    () => (ready ? buildQuestion(roundIndex, new Date(), user?.city ?? null, rng, family.data) : null),
    [ready, roundIndex, user?.city, rng, family.data],
  );
  const askedAt = useRef(Date.now());
  const reported = useRef(false);
  const answeredIn = useRef(0);
  // The chosen answer is held for a moment (glow or gentle nudge), then the round reports.
  const { chosen, choose } = useChoice<string>(({ correct }) => {
    if (reported.current || !question) return;
    reported.current = true;
    onComplete(
      { correct, reaction_ms: answeredIn.current, hint_used: false },
      correct ? copy.games.orientation.yes + question.reply : question.reply,
    );
  });

  useEffect(() => {
    askedAt.current = Date.now();
  }, [question]);
  const spoken = question ? `${question.prompt} ${copy.common.spokenChoices(question.options)}` : "";
  useSpeakOnChange(spoken);

  if (!question) return <p className="text-2xl">{copy.common.loading}</p>;

  function answer(option: string) {
    if (reported.current || !question) return;
    const reaction = Date.now() - askedAt.current;
    choose(option, option === question.answer);
    answeredIn.current = reaction;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={spoken}>
        <p className="text-3xl font-semibold">{question.prompt}</p>
      </QuestionRow>
      {/* The photo takes only the space left, so every answer stays on screen. */}
      {question.photoUrl && (
        <div className="flex min-h-0 flex-1 justify-center">
          <AuthedImage
            src={question.photoUrl}
            alt={copy.games.orientation.askWhoIsThis}
            className="aspect-square h-full max-h-[400px] w-auto max-w-full rounded-2xl object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {question.options.map((option) => (
          <AnswerButton key={option} label={option} state={answerState(chosen, option)} onClick={() => answer(option)} />
        ))}
      </div>
    </div>
  );
}

export const dailyOrientation: GameDefinition = {
  type: "daily_orientation",
  title: copy.games.orientation.title,
  intro: copy.games.orientation.intro,
  icon: CalendarDays,
  Round: DailyOrientationRound,
  tutorial: { steps: copy.games.orientation.tutorial, Demo: OrientationDemo },
  // The festival question, only in the 30 days before a festival the caregiver ticked.
  extraRound: (user, now) => dueFestival(user?.festivals, now) !== null,
};
