import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { listFamily } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AuthedImage } from "../../components/AuthedImage";
import { BigButton } from "../../components/BigButton";
import { copy } from "../../copy";
import type { GameDefinition, RoundProps } from "../types";
import { buildQuestion } from "./logic";

const LAST_QUESTION = 4;

/**
 * One round = one question about today. No levels and no hint. The reply always
 * states the right answer kindly ("It's Wednesday today."), prefixed "Yes!" when right.
 * The last question is "Who is this?" with a family photo once 3+ people have photos.
 * Reaction time = time to answer, from when the question (and photo) appears.
 */
export function DailyOrientationRound({ roundIndex, onComplete, rng = Math.random }: RoundProps) {
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

  useEffect(() => {
    askedAt.current = Date.now();
  }, [question]);

  if (!question) return <p className="text-2xl">{copy.common.loading}</p>;

  function answer(option: string) {
    if (reported.current || !question) return;
    reported.current = true;
    const correct = option === question.answer;
    onComplete(
      { correct, reaction_ms: Date.now() - askedAt.current, hint_used: false },
      correct ? copy.games.orientation.yes + question.reply : question.reply,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-3xl font-semibold">{question.prompt}</p>
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
          <BigButton key={option} label={option} icon="👉" variant="secondary" size="compact" onClick={() => answer(option)} />
        ))}
      </div>
    </div>
  );
}

export const dailyOrientation: GameDefinition = {
  type: "daily_orientation",
  title: copy.games.orientation.title,
  intro: copy.games.orientation.intro,
  icon: "📅",
  Round: DailyOrientationRound,
};
