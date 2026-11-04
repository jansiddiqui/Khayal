import { BigButton } from "../../components/BigButton";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";
import { GAMES } from "../../games";

// The weekly "Tell me about a picture" task joins this list, only when due, in Milestone 8.
export function Games() {
  return (
    <Layout title={copy.games.title} spokenIntro={copy.games.intro}>
      <p className="text-2xl">{copy.games.intro}</p>
      <nav aria-label="Games" className="flex flex-col gap-5">
        {GAMES.map((game) => (
          <BigButton key={game.type} to={`/patient/games/${game.type}`} icon={game.icon} label={game.title} />
        ))}
      </nav>
    </Layout>
  );
}
