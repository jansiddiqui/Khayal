import { copy } from "../../copy";
import { TILES } from "../sequenceRecall/logic";
import { DemoTile, HandDemo } from "./HandDemo";

/** Tutorial demos for the first five games: a small board and a hand doing one move. */

export function MemoryMatchDemo() {
  const card = "aspect-square border-brand bg-surface text-brand-dark";
  const back = "aspect-square border-brand bg-brand text-white";
  return (
    <HandDemo label={copy.games.memoryMatch.tutorial.join(" ")} taps={[{ x: 30, y: 30 }, { x: 80, y: 80 }]}>
      <div className="grid grid-cols-2 gap-3 p-2">
        <DemoTile className={card}>{copy.cards.chai}</DemoTile>
        <DemoTile className={back} />
        <DemoTile className={back} />
        <DemoTile className={card}>{copy.cards.chai}</DemoTile>
      </div>
    </HandDemo>
  );
}

export function SequenceRecallDemo() {
  return (
    <HandDemo label={copy.games.sequenceRecall.tutorial.join(" ")} taps={[{ x: 30, y: 30 }, { x: 80, y: 80 }]}>
      <div className="grid grid-cols-2 gap-3 p-2">
        {TILES.map((t) => (
          <DemoTile key={t.id} className={`aspect-[4/3] border-transparent ${t.idle}`}>
            {copy.tiles[t.id]}
          </DemoTile>
        ))}
      </div>
    </HandDemo>
  );
}

export function WordRecallDemo() {
  const words = [copy.words.tea, copy.words.bus, copy.words.rice, copy.words.lamp];
  return (
    <HandDemo label={copy.games.wordRecall.tutorial.join(" ")} taps={[{ x: 30, y: 25 }, { x: 30, y: 75 }]}>
      <div className="grid grid-cols-2 gap-3 p-2">
        {words.map((w, i) => (
          <DemoTile
            key={w}
            className={`min-h-16 ${i % 2 === 0 ? "border-calm bg-calm-soft text-ink" : "border-brand bg-surface text-brand-dark"}`}
          >
            {w}
          </DemoTile>
        ))}
      </div>
    </HandDemo>
  );
}

export function OrientationDemo() {
  return (
    <HandDemo label={copy.games.orientation.tutorial.join(" ")} taps={[{ x: 60, y: 58 }]}>
      <div className="flex flex-col gap-2 p-2">
        <p className="text-lg font-semibold">{copy.games.orientation.askDay}</p>
        {[copy.days[1], copy.days[2], copy.days[3]].map((d) => (
          <DemoTile key={d} className="min-h-12 border-brand bg-surface text-brand-dark">
            {d}
          </DemoTile>
        ))}
      </div>
    </HandDemo>
  );
}

export function ReactionTapDemo() {
  return (
    <HandDemo label={copy.games.reactionTap.tutorial.join(" ")} taps={[{ x: 55, y: 55 }]}>
      <div className="flex justify-center p-2">
        <div className="flex size-40 items-center justify-center rounded-full border-8 border-go-edge bg-go text-2xl font-bold text-white">
          {copy.games.reactionTap.green}
        </div>
      </div>
    </HandDemo>
  );
}
