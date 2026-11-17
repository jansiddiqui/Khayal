import { RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMoreGames } from "../../api/client";
import { BigButton } from "../../components/BigButton";
import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";
import { findGame } from "../../games";

/**
 * "More games" (CLAUDE.md section 7, core set): up to 3 games outside the patient's core set,
 * least recently played first, so over time each gets its turn. Reached after today's games.
 */
export function MoreGames() {
  const more = useQuery({ queryKey: ["moreGames"], queryFn: getMoreGames, staleTime: 0 });
  return (
    <Layout title={copy.games.moreTitle} spokenIntro={copy.games.moreIntro}>
      {more.isPending && <p className="text-2xl">{copy.common.loading}</p>}
      {more.isError && (
        <Card>
          <p className="mb-6 text-2xl">{copy.games.listFailed}</p>
          <BigButton label={copy.games.retry} icon={<RotateCcw />} onClick={() => void more.refetch()} />
        </Card>
      )}
      {more.isSuccess && more.data.length === 0 && <p className="text-2xl">{copy.games.moreEmpty}</p>}
      {more.isSuccess && more.data.length > 0 && (
        <nav aria-label={copy.games.moreTitle} className="flex flex-col gap-3">
          {more.data.map(({ game_type, done_today }) => {
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
