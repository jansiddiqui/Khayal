import { RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { getAllMoreGames, getMoreGames } from "../../api/client";
import { BigButton } from "../../components/BigButton";
import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";
import { findGame } from "../../games";

/**
 * "More games" (CLAUDE.md section 7, "More games rotation"): 3 games outside the patient's core
 * set, the same all day; every one comes round within 3 days. Under them, one quiet link,
 * "See other games", opens the full list (`all`). Games the family hid never appear.
 */
export function MoreGames({ all = false }: { all?: boolean }) {
  const more = useQuery({
    queryKey: ["moreGames", all ? "all" : "today"],
    queryFn: all ? getAllMoreGames : getMoreGames,
    staleTime: 0,
  });
  const title = all ? copy.games.otherTitle : copy.games.moreTitle;
  return (
    <Layout title={title} spokenIntro={all ? copy.games.otherIntro : copy.games.moreIntro}>
      {more.isPending && <p className="text-2xl">{copy.common.loading}</p>}
      {more.isError && (
        <Card>
          <p className="mb-6 text-2xl">{copy.games.listFailed}</p>
          <BigButton label={copy.games.retry} icon={<RotateCcw />} onClick={() => void more.refetch()} />
        </Card>
      )}
      {more.isSuccess && more.data.length === 0 && <p className="text-2xl">{copy.games.moreEmpty}</p>}
      {more.isSuccess && more.data.length > 0 && (
        <nav aria-label={title} className="flex flex-col gap-3">
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
      {!all && more.isSuccess && more.data.length > 0 && (
        <Link
          to="/patient/games/more/all"
          className="min-h-11 self-center rounded-lg px-3 py-2 text-xl text-brand-dark underline underline-offset-4"
        >
          {copy.games.seeOther}
        </Link>
      )}
    </Layout>
  );
}

/** "See other games": the full list, as its own page. */
export function OtherGames() {
  return <MoreGames all />;
}
