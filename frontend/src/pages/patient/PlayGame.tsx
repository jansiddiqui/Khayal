import { useState } from "react";
import { Navigate, useParams } from "react-router";
import { Layout } from "../../components/Layout";
import { findGame } from "../../games";
import { GameSession } from "../../games/GameSession";

export function PlayGame() {
  const game = findGame(useParams().gameType);
  const [playing, setPlaying] = useState(false);
  if (!game) return <Navigate to="/patient/games" replace />;

  return (
    <Layout title={game.title} spokenIntro={game.intro} compact={playing}>
      <GameSession key={game.type} game={game} onPlayingChange={setPlaying} />
    </Layout>
  );
}
