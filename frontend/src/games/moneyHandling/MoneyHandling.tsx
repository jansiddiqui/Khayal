import { ShoppingBasket, Wallet } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { copy } from "../../copy";
import { useSpeakOnChange } from "../../readAloud/ReadAloudContext";
import { useFeedback } from "../../ui/feedback";
import { pressable } from "../../ui/motion";
import { AnswerButton, answerState, useChoice } from "../Answer";
import { QuestionRow } from "../QuestionRow";
import { HandDemo } from "../tutorial/HandDemo";
import type { GameDefinition, RoundProps } from "../types";
import { buildMarketRound, total, type Item, type MarketRound, type Piece } from "./logic";
import { CoinArt, NoteArt } from "./money";

const t = copy.games.market;
const name = (item: Item) => copy.market[item.id];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One round: pay for something with the purse, or answer a money question (change, budget). */
export function MoneyHandlingRound(props: RoundProps) {
  const { level, practice = false, rng = Math.random } = props;
  const round = useMemo(() => buildMarketRound(level, rng, practice), [level, practice, rng]);
  return round.kind === "pay" ? <PayRound round={round} {...props} /> : <ChooseRound round={round} {...props} />;
}

function payPrompt(round: Extract<MarketRound, { kind: "pay" }>): string {
  const [a, b] = round.items;
  if (round.mode === "one") return t.payOne(cap(name(a!)), a!.price);
  if (round.mode === "cheaper") return t.payCheaper(cap(name(a!)), a!.price, name(b!), b!.price);
  return t.payBoth(cap(name(a!)), a!.price, name(b!), b!.price);
}

function PieceButton({ piece, onClick, glow, label }: { piece: Piece; onClick: () => void; glow: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`touch-manipulation rounded-lg ${pressable} ${glow ? "calm-glow ring-4 ring-accent-strong ring-offset-2 ring-offset-surface" : ""}`}
    >
      {piece.kind === "note" ? <NoteArt value={piece.value} className="h-[3.4rem] w-[6.8rem]" /> : <CoinArt value={piece.value} className="size-[3.4rem]" />}
    </button>
  );
}

function PayRound({ round, onComplete, practice = false }: RoundProps & { round: Extract<MarketRound, { kind: "pay" }> }) {
  const shownAt = useRef(Date.now());
  const [counter, setCounter] = useState<Piece[]>([]);
  const [slipped, setSlipped] = useState(false);
  const reported = useRef(false);
  const { cue } = useFeedback();
  const purse = round.purse.filter((p) => !counter.some((c) => c.id === p.id));
  const prompt = payPrompt(round);
  useSpeakOnChange(prompt);

  function pay() {
    if (reported.current || counter.length === 0) return;
    const paid = total(counter);
    const correct = paid === round.target;
    if (practice && !correct) {
      // Practice: show which note pays it, and let them try again.
      setSlipped(true);
      setCounter([]);
      return;
    }
    reported.current = true;
    onComplete(
      { correct, reaction_ms: Date.now() - shownAt.current, hint_used: false },
      correct ? t.exactly(round.target) : t.notQuite(paid, round.target),
    );
  }

  const answerPiece = slipped ? round.purse.find((p) => p.value === round.target)?.id : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={prompt}>
        <p className="text-2xl font-semibold">{prompt}</p>
        {slipped && <p className="mt-1 text-xl text-brand-dark">{t.practiceHint(round.target)}</p>}
      </QuestionRow>
      <section aria-label={t.counter} className="flex min-h-[6.5rem] flex-col gap-1 rounded-2xl border-4 border-dashed border-line-strong bg-sunken p-2">
        <p className="flex items-center gap-2 text-lg text-ink-soft">
          <ShoppingBasket aria-hidden="true" className="size-5" />
          {t.counter}
        </p>
        <div className="flex flex-wrap gap-2">
          {counter.map((p) => (
            <PieceButton
              key={p.id}
              piece={p}
              glow={false}
              label={t.takeBack(p.value)}
              onClick={() => {
                cue("tap");
                setCounter(counter.filter((c) => c.id !== p.id));
              }}
            />
          ))}
        </div>
      </section>
      <section aria-label={t.purse} className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-lg text-ink-soft">
          <Wallet aria-hidden="true" className="size-5" />
          {t.purse}
        </p>
        <div className="flex flex-wrap gap-2">
          {purse.map((p) => (
            <PieceButton
              key={p.id}
              piece={p}
              glow={answerPiece === p.id}
              label={t.give(p.value)}
              onClick={() => {
                cue("tap");
                setCounter([...counter, p]);
              }}
            />
          ))}
        </div>
      </section>
      <button
        type="button"
        onClick={pay}
        disabled={counter.length === 0}
        className={`mt-auto flex min-h-[64px] w-full items-center justify-center rounded-2xl border-4 border-brand bg-brand px-4 text-2xl font-bold text-white disabled:border-line-strong disabled:bg-sunken disabled:text-ink-soft ${pressable}`}
      >
        {t.pay}
      </button>
    </div>
  );
}

function ChooseRound({ round, onComplete }: RoundProps & { round: Extract<MarketRound, { kind: "choose" }> }) {
  const shownAt = useRef(Date.now());
  const right = round.choices.find((c) => c.correct)!;
  const label = (c: (typeof round.choices)[number]) =>
    c.items ? t.pairLabel(cap(name(c.items[0]!)), c.items[0]!.price, name(c.items[1]!), c.items[1]!.price) : `₹${c.amount}`;
  const prompt =
    round.question === "change"
      ? t.askChange(cap(name(round.items[0]!)), round.items[0]!.price, round.money)
      : t.askAfford(round.money);

  const { chosen, choose } = useChoice<string>(({ correct }) => {
    const reply =
      round.question === "change"
        ? t.changeReply(right.amount!, round.money, round.items[0]!.price)
        : t.affordReply(label(right), right.items!.reduce((s, i) => s + i.price, 0), round.money);
    onComplete({ correct, reaction_ms: Date.now() - shownAt.current, hint_used: false }, correct ? `${copy.games.orientation.yes}${reply}` : reply);
  });
  useSpeakOnChange(copy.common.spokenChoices([prompt, ...round.choices.map(label)]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QuestionRow spoken={copy.common.spokenChoices([prompt, ...round.choices.map(label)])}>
        <p className="text-2xl font-semibold">{prompt}</p>
      </QuestionRow>
      {round.question === "change" && <NoteArt value={round.money} className="h-16 w-32" />}
      <div className="flex flex-col gap-3">
        {round.choices.map((c) => (
          <AnswerButton key={c.key} label={label(c)} state={answerState(chosen, c.key)} onClick={() => choose(c.key, c.correct)} />
        ))}
      </div>
    </div>
  );
}

function MarketDemo() {
  return (
    <HandDemo label={t.tutorial.join(" ")} taps={[{ x: 25, y: 75 }, { x: 50, y: 92 }]}>
      <div className="flex flex-col gap-2 p-2">
        <p className="text-lg font-semibold">{t.payOne(cap(copy.market.coriander), 20)}</p>
        <div className="flex gap-2">
          <NoteArt value={20} className="h-12 w-24" />
          <NoteArt value={50} className="h-12 w-24" />
        </div>
        <div className="rounded-xl bg-brand py-2 text-center font-bold text-white">{t.pay}</div>
      </div>
    </HandDemo>
  );
}

export const moneyHandling: GameDefinition = {
  type: "money_handling",
  title: t.title,
  intro: t.intro,
  icon: ShoppingBasket,
  Round: MoneyHandlingRound,
  tutorial: { steps: t.tutorial, Demo: MarketDemo },
};
