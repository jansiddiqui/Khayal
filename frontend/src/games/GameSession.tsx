import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { getLevel, postSession, type RoundResult, type SessionResult } from "../api/client";
import { BigButton } from "../components/BigButton";
import { Card } from "../components/Card";
import { copy } from "../copy";
import { useReadAloud } from "../readAloud/ReadAloudContext";
import type { GameDefinition, Rng } from "./types";

/** Agreed for M3: one session = 5 rounds, so the level can only change at the end. */
export const ROUNDS_PER_SESSION = 5;

type Phase =
  | { kind: "intro" }
  | { kind: "playing"; round: number }
  | { kind: "between"; round: number; lastCorrect: boolean }
  | { kind: "done" };

interface GameSessionProps {
  game: GameDefinition;
  rng?: Rng;
}

/**
 * Runs one session of any game: intro, 5 rounds with gentle feedback in between,
 * then saves the session and ends on encouragement. The level is never shown.
 */
export function GameSession({ game, rng }: GameSessionProps) {
  const { speak } = useReadAloud();
  const level = useQuery({ queryKey: ["level", game.type], queryFn: () => getLevel(game.type), staleTime: 0 });
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const results = useRef<RoundResult[]>([]);
  const startedAt = useRef<string>("");

  const save = useMutation({
    mutationFn: () =>
      postSession({
        game_type: game.type,
        started_at: startedAt.current,
        ended_at: new Date().toISOString(),
        rounds: results.current,
      }),
    onSuccess: (result: SessionResult) => {
      void level.refetch();
      speak(endMessage(result));
    },
  });

  function start() {
    results.current = [];
    startedAt.current = new Date().toISOString();
    save.reset();
    setPhase({ kind: "playing", round: 1 });
  }

  function onRoundComplete(round: number, result: RoundResult) {
    results.current = [...results.current, result];
    if (round >= ROUNDS_PER_SESSION) {
      setPhase({ kind: "done" });
      save.mutate();
    } else {
      setPhase({ kind: "between", round, lastCorrect: result.correct });
      speak(result.correct ? copy.games.roundWell : copy.games.roundTryAnother);
    }
  }

  if (level.isPending) return <p className="text-2xl">{copy.common.loading}</p>;
  if (level.isError) {
    return (
      <Card>
        <p className="mb-6 text-2xl">{copy.games.saveFailed}</p>
        <BigButton label={copy.games.retry} icon="🔄" onClick={() => void level.refetch()} />
      </Card>
    );
  }

  switch (phase.kind) {
    case "intro":
      return (
        <>
          <p className="text-2xl">{game.intro}</p>
          <BigButton label={copy.games.start} icon="▶️" onClick={start} />
        </>
      );

    case "playing":
      return (
        <>
          <p className="text-xl text-gray-800">{copy.games.roundOf(phase.round, ROUNDS_PER_SESSION)}</p>
          <game.Round
            key={phase.round}
            level={level.data}
            rng={rng}
            onComplete={(result) => onRoundComplete(phase.round, result)}
          />
        </>
      );

    case "between":
      return (
        <Card>
          <p className="mb-6 text-3xl font-semibold" role="status">
            {phase.lastCorrect ? copy.games.roundWell : copy.games.roundTryAnother}
          </p>
          <BigButton
            label={copy.games.next}
            icon="➡️"
            onClick={() => setPhase({ kind: "playing", round: phase.round + 1 })}
          />
        </Card>
      );

    case "done":
      if (save.isError) {
        return (
          <Card>
            <p className="mb-6 text-2xl">{copy.games.saveFailed}</p>
            <BigButton label={copy.games.retry} icon="🔄" onClick={() => save.mutate()} />
          </Card>
        );
      }
      if (!save.isSuccess) return <p className="text-2xl">{copy.games.saving}</p>;
      return (
        <>
          <Card>
            <p className="text-3xl font-semibold" role="status">
              <span aria-hidden="true">🌟 </span>
              {endMessage(save.data)}
            </p>
          </Card>
          <BigButton label={copy.games.playAgain} icon="🔁" onClick={start} />
          <BigButton to="/patient/games" label={copy.games.backToGames} icon="🧩" variant="secondary" />
        </>
      );
  }
}

function endMessage(result: SessionResult): string {
  return result.level_change === "up" ? copy.games.endUp : copy.games.endKeep;
}
