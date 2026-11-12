import { Mic, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTodaysGames, VOICE_TASK } from "../../api/client";
import { BigButton } from "../../components/BigButton";
import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";
import { findGame } from "../../games";

/** Today's 3 games (rules in CLAUDE.md section 7). Finished ones show "✓ Done today" but stay playable. */
export function Games() {
  const today = useQuery({ queryKey: ["todaysGames"], queryFn: getTodaysGames, staleTime: 0 });

  return (
    <Layout title={copy.games.title} spokenIntro={copy.games.intro}>
      <p className="text-2xl">{copy.games.intro}</p>
      {today.isPending && <p className="text-2xl">{copy.common.loading}</p>}
      {today.isError && (
        <Card>
          <p className="mb-6 text-2xl">{copy.games.listFailed}</p>
          <BigButton label={copy.games.retry} icon={<RotateCcw />} onClick={() => void today.refetch()} />
        </Card>
      )}
      {today.isSuccess && (
        <nav aria-label="Games" className="flex flex-col gap-5">
          {today.data.games.map(({ game_type, done_today }) => {
            if (game_type === VOICE_TASK) {
              return (
                <BigButton
                  key={VOICE_TASK}
                  to="/patient/voice"
                  icon={<Mic />}
                  label={copy.voiceTask.title}
                  note={done_today ? copy.games.doneToday : undefined}
                  variant={done_today ? "secondary" : "primary"}
                />
              );
            }
            const game = findGame(game_type);
            if (!game) return null;
            return (
              <BigButton
                key={game.type}
                to={`/patient/games/${game.type}`}
                icon={<game.icon />}
                label={game.title}
                note={done_today ? copy.games.doneToday : undefined}
                variant={done_today ? "secondary" : "primary"}
              />
            );
          })}
        </nav>
      )}
    </Layout>
  );
}
