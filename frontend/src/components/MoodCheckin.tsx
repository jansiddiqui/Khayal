import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Frown, Meh, Smile } from "lucide-react";
import { useState } from "react";
import { answerMood, type Mood } from "../api/client";
import { copy } from "../copy";
import { useReadAloud } from "../readAloud/ReadAloudContext";
import { useFeedback } from "../ui/feedback";
import { BigButton } from "./BigButton";
import { Layout } from "./Layout";

const CHOICES: { mood: Mood; label: string; icon: JSX.Element }[] = [
  { mood: "good", label: copy.mood.good, icon: <Smile /> },
  { mood: "okay", label: copy.mood.okay, icon: <Meh /> },
  { mood: "not_so_good", label: copy.mood.notSoGood, icon: <Frown /> },
];

/**
 * "How are you feeling today?" (Round 2 batch 4): shown instead of Home the first time it opens
 * each day. Three answers (answer options, not counted as buttons, CLAUDE.md section 4) and Skip.
 * After an answer, a kind reply and Continue: nothing moves on by itself.
 */
export function MoodCheckin() {
  const m = copy.mood;
  const queryClient = useQueryClient();
  const { speak } = useReadAloud();
  const { cue } = useFeedback();
  const [answered, setAnswered] = useState<Mood | null>(null);
  const save = useMutation({
    mutationFn: (mood: Mood | null) => answerMood(mood),
    onSuccess: (_, mood) => {
      if (mood === null) void queryClient.invalidateQueries({ queryKey: ["moodToday"] });
      else {
        setAnswered(mood);
        speak(mood === "not_so_good" ? `${m.thanks} ${m.gentle}` : m.thanks);
      }
    },
  });

  if (answered) {
    return (
      <Layout title={m.thanks} spoken={answered === "not_so_good" ? `${m.thanks} ${m.gentle}` : m.thanks}>
        {answered === "not_so_good" && <p className="text-2xl">{m.gentle}</p>}
        <div className="mt-auto">
          <BigButton label={m.continue} icon={<ArrowRight />} onClick={() => void queryClient.invalidateQueries({ queryKey: ["moodToday"] })} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={m.question} spoken={m.spoken} snug>
      <div role="group" aria-label={m.question} className="flex flex-col gap-3">
        {CHOICES.map((c) => (
          <BigButton
            key={c.mood}
            label={c.label}
            icon={c.icon}
            variant="secondary"
            busy={save.isPending && save.variables === c.mood}
            onClick={() => {
              if (save.isPending) return;
              cue("tap");
              save.mutate(c.mood);
            }}
          />
        ))}
      </div>
      <div className="pt-2">
        <BigButton label={m.skip} icon={<ArrowRight />} variant="secondary" onClick={() => !save.isPending && save.mutate(null)} />
      </div>
    </Layout>
  );
}
