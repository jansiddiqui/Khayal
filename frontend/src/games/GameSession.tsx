import { ArrowRight, Check, House, LayoutGrid, Play, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getLevel,
  getTodaysGames,
  markTutorialSeen,
  VOICE_TASK,
  postSession,
  postSessionOnPageHide,
  type RoundResult,
  type SessionInput,
  type SessionResult,
} from "../api/client";
import { BigButton } from "../components/BigButton";
import { Card } from "../components/Card";
import { copy } from "../copy";
import { useAuth } from "../auth/AuthContext";
import { useReadAloud } from "../readAloud/ReadAloudContext";
import { findGame } from ".";
import type { GameDefinition, Rng } from "./types";
import { commitDelayed, dueDelayed, type PendingRecall } from "./wordRecall/delayed";
import { DelayedRecall } from "./wordRecall/DelayedRecall";
import { calm, DURATION, useLessMotion } from "../ui/motion";
import { Spinner } from "../ui/Spinner";

/**
 * When a new board or a reply appears, taps are ignored this long, so a second tap meant for the
 * last screen can't answer the next one (the elderly double-tap). Nothing visible changes.
 */
export const INPUT_GUARD_MS = 300;

/** Ignores pointer input for INPUT_GUARD_MS after it appears; keyboard and screen readers are unaffected. */
function Guarded({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), INPUT_GUARD_MS);
    return () => clearTimeout(t);
  }, []);
  return <div className={`${className} ${ready ? "" : "pointer-events-none"}`}>{children}</div>;
}

/** Agreed for M3: one session = 5 rounds, so the level can only change at the end. */
export const ROUNDS_PER_SESSION = 5;

type Phase =
  | { kind: "intro" }
  | { kind: "delayed"; pending: PendingRecall }
  | { kind: "delayedDone" }
  | { kind: "tutorial" }
  | { kind: "practice" }
  | { kind: "practiceDone" }
  | { kind: "playing"; round: number }
  | { kind: "between"; round: number; feedback: string; correct: boolean }
  | { kind: "done"; lastFeedback?: string };

interface GameSessionProps {
  game: GameDefinition;
  rng?: Rng;
  /** True while a round is on screen, so the page can switch to play mode. */
  onPlayingChange?: (playing: boolean) => void;
}

/**
 * Runs one session of any game: intro, 5 rounds with gentle feedback in between,
 * then saves the session and ends on encouragement. The level is never shown.
 *
 * If the patient leaves part-way (Home button, closing the page), the rounds played
 * so far are saved as a stopped-early session, which never changes the level.
 */
export function GameSession({ game, rng, onPlayingChange }: GameSessionProps) {
  const { speak } = useReadAloud();
  const { state: auth } = useAuth();
  /** Rounds in this session: 5, or 6 with About Today's festival question. */
  const [totalRounds, setTotalRounds] = useState(ROUNDS_PER_SESSION);
  const total = useRef(ROUNDS_PER_SESSION);
  /** Where in the praise list this session starts, so it varies between sessions too. */
  const praiseStart = useRef(0);
  const tutorialShown = useRef(false);
  const queryClient = useQueryClient();
  const level = useQuery({ queryKey: ["level", game.type], queryFn: () => getLevel(game.type), staleTime: 0 });
  // A delayed word check is due (3–30 minutes after Remember the Words): it comes first (D4).
  const [phase, setPhase] = useState<Phase>(() => {
    const pending = game.type === "word_recall" ? null : dueDelayed();
    return pending ? { kind: "delayed", pending } : { kind: "intro" };
  });
  const results = useRef<RoundResult[]>([]);
  const startedAt = useRef<string>("");
  /** The ending picked for this session (varies from session to session). */
  const ending = useRef("");
  /** True once the current session has been handed to the server (or there is nothing to save). */
  const submitted = useRef(true);
  /** The kind reply to the last answer, read aloud together with the ending. */
  const lastFeedback = useRef<string | undefined>(undefined);

  // Play mode for the whole session (rounds, replies and the end), so nothing jumps between screens.
  const playing = phase.kind !== "intro";
  const less = useLessMotion();
  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  // First time with this game: a short spoken demo and a practice round first (research.md 3.4).
  useEffect(() => {
    if (level.data?.tutorial && !tutorialShown.current && phase.kind === "intro") {
      tutorialShown.current = true;
      setPhase({ kind: "tutorial" });
      // Spoken even when Read aloud is off; the words are also on screen.
      speak(game.tutorial.steps.join(" "), { force: true });
    }
  }, [level.data, game.tutorial.steps, speak, phase.kind]);

  const seen = useMutation({ mutationFn: () => markTutorialSeen(game.type) });

  function sessionInput(): SessionInput {
    return {
      game_type: game.type,
      started_at: startedAt.current,
      ended_at: new Date().toISOString(),
      rounds: results.current,
      completed: results.current.length === total.current,
    };
  }

  const save = useMutation({
    mutationFn: () => postSession(sessionInput()),
    onSuccess: (result: SessionResult) => {
      // A finished Remember the Words session: its last words come back later (D4).
      if (game.type === "word_recall" && result.session.completed) commitDelayed();
      void level.refetch();
      void queryClient.invalidateQueries({ queryKey: ["todaysGames"] });
      ending.current = endMessage(result, (rng ?? Math.random)());
      speak([lastFeedback.current, ending.current].filter(Boolean).join(" "));
    },
    onError: () => {
      // Not saved: let leaving the page try once more.
      submitted.current = false;
    },
  });

  // Save unfinished work when the patient leaves the game or closes the page.
  const sessionInputRef = useRef(sessionInput);
  sessionInputRef.current = sessionInput;
  useEffect(() => {
    const leave = (send: (input: SessionInput) => void) => {
      if (submitted.current || results.current.length === 0) return;
      submitted.current = true;
      send(sessionInputRef.current());
    };
    const onPageHide = () => leave(postSessionOnPageHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      leave((input) => void postSession(input).catch(() => undefined));
    };
  }, []);

  function start() {
    results.current = [];
    submitted.current = false;
    startedAt.current = new Date().toISOString();
    total.current = ROUNDS_PER_SESSION + (game.extraRound?.(auth.status === "authenticated" ? auth.user : null, new Date()) ? 1 : 0);
    setTotalRounds(total.current);
    praiseStart.current = Math.floor((rng ?? Math.random)() * copy.games.praise.length);
    save.reset();
    setPhase({ kind: "playing", round: 1 });
  }

  function submit() {
    submitted.current = true;
    save.mutate();
  }

  function onRoundComplete(round: number, result: RoundResult, feedback?: string) {
    results.current = [...results.current, result];
    const praise = copy.games.praise[(praiseStart.current + round - 1) % copy.games.praise.length]!;
    const message = feedback ?? (result.correct ? praise : copy.games.roundTryAnother);
    if (round >= total.current) {
      lastFeedback.current = feedback;
      setPhase({ kind: "done", lastFeedback: feedback });
      submit();
    } else {
      setPhase({ kind: "between", round, feedback: message, correct: result.correct });
      speak(message);
    }
  }

  // After a session: the next game on today's list that is not finished yet.
  const today = useQuery({
    queryKey: ["todaysGames"],
    queryFn: getTodaysGames,
    enabled: phase.kind === "done" && save.isSuccess,
  });
  const next = today.data?.games.find((g) => !g.done_today && g.game_type !== game.type);
  const nextGame = !next
    ? undefined
    : next.game_type === VOICE_TASK
      ? { to: "/patient/voice", title: copy.voiceTask.title }
      : { to: `/patient/games/${next.game_type}`, title: findGame(next.game_type)?.title ?? "" };

  if (level.isPending) {
    return (
      <p role="status" className="flex items-center gap-3 text-2xl text-ink-soft">
        <Spinner />
        {copy.common.loading}
      </p>
    );
  }
  if (level.isError) {
    return (
      <Card>
        <p className="mb-6 text-2xl">{copy.games.saveFailed}</p>
        <BigButton label={copy.games.retry} icon={<RotateCcw />} onClick={() => void level.refetch()} />
      </Card>
    );
  }

  switch (phase.kind) {
    case "intro":
      return (
        <>
          <p className="text-2xl">{game.intro}</p>
          <BigButton label={copy.games.start} icon={<Play />} onClick={start} />
        </>
      );

    case "delayed":
      return <DelayedRecall pending={phase.pending} onDone={() => setPhase({ kind: "delayedDone" })} />;

    case "delayedDone":
      return (
        <Guarded className="flex flex-col gap-6 rounded-2xl border-4 border-calm bg-calm-soft p-6 shadow-lift">
          <p className="flex items-start gap-3 text-3xl font-semibold" role="status">
            <Check aria-hidden="true" className="mt-1 size-9 shrink-0 text-calm" />
            <span>{copy.games.wordRecall.delayedThanks}</span>
          </p>
          <BigButton label={copy.games.next} icon={<ArrowRight />} onClick={() => setPhase({ kind: "intro" })} />
        </Guarded>
      );

    case "tutorial":
      return (
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl font-bold">{copy.games.tutorialHeading}</h2>
          <game.tutorial.Demo />
          <div className="flex flex-col gap-2 text-2xl">
            {game.tutorial.steps.map((step) => (
              <p key={step}>{step}</p>
            ))}
          </div>
          <BigButton label={copy.games.tryOne} icon={<Play />} onClick={() => setPhase({ kind: "practice" })} />
        </div>
      );

    case "practice":
      return (
        <Guarded key="practice" className="flex min-h-0 flex-1 flex-col">
          <game.Round
            level={1}
            practice
            roundIndex={0}
            rng={rng}
            onComplete={() => {
              // Practice is never stored: it can't change the level or the trend.
              setPhase({ kind: "practiceDone" });
              speak(copy.games.practiceDone, { force: true });
            }}
          />
        </Guarded>
      );

    case "practiceDone":
      return (
        <Guarded className="flex flex-col gap-6 rounded-2xl border-4 border-calm bg-calm-soft p-6 shadow-lift">
          <p className="flex items-start gap-3 text-3xl font-semibold" role="status">
            <Check aria-hidden="true" className="mt-1 size-9 shrink-0 text-calm" />
            <span>{copy.games.practiceDone}</span>
          </p>
          <BigButton
            label={copy.games.start}
            icon={<Play />}
            onClick={() => {
              seen.mutate();
              start();
            }}
          />
        </Guarded>
      );

    case "playing":
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="text-xl text-ink-soft">{copy.games.roundOf(phase.round, totalRounds)}</p>
          <Guarded key={phase.round} className="flex min-h-0 flex-1 flex-col">
            <game.Round
              level={level.data.level}
              roundIndex={phase.round - 1}
              rng={rng}
              onComplete={(result, feedback) => onRoundComplete(phase.round, result, feedback)}
            />
          </Guarded>
        </div>
      );

    case "between":
      return (
        <Guarded key={`between-${phase.round}`} className="flex flex-col gap-3">
          {/* The place in the session stays where it was during the round. */}
          <p className="text-xl text-ink-soft">{copy.games.roundOf(phase.round, totalRounds)}</p>
          <motion.div
            initial={less ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={calm(DURATION.base)}
            className={`flex flex-col gap-6 rounded-2xl border-4 p-6 shadow-lift ${
              phase.correct ? "border-calm bg-calm-soft" : "border-line bg-surface"
            }`}
          >
            <p className="flex items-start gap-3 text-3xl font-semibold" role="status">
              {phase.correct && <Check aria-hidden="true" className="mt-1 size-9 shrink-0 text-calm" />}
              <span>{phase.feedback}</span>
            </p>
            <BigButton
              label={copy.games.next}
              icon={<ArrowRight />}
              onClick={() => setPhase({ kind: "playing", round: phase.round + 1 })}
            />
          </motion.div>
        </Guarded>
      );

    case "done":
      if (save.isError) {
        return (
          <Card>
            <p className="mb-6 text-2xl">{copy.games.saveFailed}</p>
            <BigButton label={copy.games.retry} icon={<RotateCcw />} onClick={submit} />
          </Card>
        );
      }
      if (!save.isSuccess) {
        return (
          <p role="status" className="flex items-center gap-3 text-2xl text-ink-soft">
            <Spinner />
            {copy.games.saving}
          </p>
        );
      }
      return (
        // Kept compact so "Next game" is always on screen on a phone (CLAUDE.md section 4).
        <Guarded className="flex flex-col gap-4">
          {/* A calm celebration: a soft marigold light and a gentle sparkle, never confetti. */}
          <motion.div
            initial={less ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={calm(DURATION.slow)}
            className="relative flex flex-col gap-2 overflow-hidden rounded-2xl border-2 border-accent bg-surface p-4 shadow-lift"
            role="status"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-[radial-gradient(circle,var(--color-accent-soft)_0%,transparent_70%)]"
            />
            {phase.lastFeedback && <p className="relative text-2xl">{phase.lastFeedback}</p>}
            <p className="relative flex items-start gap-2 text-2xl font-semibold">
              <motion.span
                aria-hidden="true"
                className="mt-1 flex shrink-0 text-accent-strong"
                initial={less ? false : { scale: 0.6, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={calm(DURATION.slow * 1.5)}
              >
                <Sparkles className="size-7" />
              </motion.span>
              <span>{ending.current.replace(copy.games.endUp, "").trim()}</span>
            </p>
            {ending.current.includes(copy.games.endUp) && <p className="relative text-xl">{copy.games.endUp}</p>}
          </motion.div>
          {nextGame ? (
            <BigButton
              to={nextGame.to}
              label={copy.games.nextGame}
              note={nextGame.title}
              icon={<ArrowRight />}
            />
          ) : (
            <BigButton to="/patient" label={copy.games.backHome} icon={<House />} />
          )}
          <BigButton label={copy.games.playAgain} icon={<RotateCw />} variant="secondary" onClick={start} />
          {/* Today's games are all done: other games are there for anyone who wants more. */}
          {!nextGame && today.isSuccess && (
            <BigButton to="/patient/games/more" label={copy.games.moreGames} icon={<LayoutGrid />} variant="secondary" />
          )}
        </Guarded>
      );
  }
}

/** Warm, varied encouragement; a gentle note when the game will be harder next time. */
export function endMessage(result: SessionResult, random: number): string {
  const words = copy.games.encouragement;
  const pick = words[Math.min(words.length - 1, Math.floor(random * words.length))]!;
  return result.level_change === "up" ? `${pick} ${copy.games.endUp}` : pick;
}
