import { useMemo, useRef } from "react";
import { useAuth } from "../../auth/AuthContext";
import { BigButton } from "../../components/BigButton";
import { copy } from "../../copy";
import type { GameDefinition, RoundProps } from "../types";
import { buildQuestion } from "./logic";

/**
 * One round = one question about today. No levels and no hint. The reply always
 * states the right answer kindly ("It's Wednesday today."), prefixed "Yes!" when right.
 * Reaction time = time to answer.
 */
export function DailyOrientationRound({ roundIndex, onComplete, rng = Math.random }: RoundProps) {
  const { state } = useAuth();
  const city = state.status === "authenticated" ? state.user.city : null;
  const question = useMemo(() => buildQuestion(roundIndex, new Date(), city, rng), [roundIndex, city, rng]);
  const askedAt = useRef(Date.now());
  const reported = useRef(false);

  function answer(option: string) {
    if (reported.current) return;
    reported.current = true;
    const correct = option === question.answer;
    onComplete(
      { correct, reaction_ms: Date.now() - askedAt.current, hint_used: false },
      correct ? copy.games.orientation.yes + question.reply : question.reply,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-3xl font-semibold">{question.prompt}</p>
      <div className="flex flex-col gap-4">
        {question.options.map((option) => (
          <BigButton key={option} label={option} icon="👉" variant="secondary" onClick={() => answer(option)} />
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
