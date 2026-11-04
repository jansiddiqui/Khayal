import { Navigate, useParams } from "react-router";
import { Layout } from "../../components/Layout";
import { findGame } from "../../games";
import { GameSession } from "../../games/GameSession";

export function PlayGame() {
  const game = findGame(useParams().gameType);
  if (!game) return <Navigate to="/patient/games" replace />;

  return (
    <Layout title={game.title} spokenIntro={game.intro}>
      <GameSession key={game.type} game={game} />
    </Layout>
  );
}
