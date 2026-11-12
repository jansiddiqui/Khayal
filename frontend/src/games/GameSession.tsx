import { ArrowRight, House, Play, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getLevel,
  getTodaysGames,
  postSession,
  postSessionOnPageHide,
  type RoundResult,
  type SessionInput,
  type SessionResult,
} from "../api/client";
import { BigButton } from "../components/BigButton";
import { Card } from "../components/Card";
import { copy } from "../copy";
import { useReadAloud } from "../readAloud/ReadAloudContext";
import { findGame } from ".";
import type { GameDefinition, Rng } from "./types";

/** Agreed for M3: one session = 5 rounds, so the level can only change at the end. */
export const ROUNDS_PER_SESSION = 5;

type Phase =
  | { kind: "intro" }
  | { kind: "playing"; round: number }
  | { kind: "between"; round: number; feedback: string }
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
  const queryClient = useQueryClient();
  const level = useQuery({ queryKey: ["level", game.type], queryFn: () => getLevel(game.type), staleTime: 0 });
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const results = useRef<RoundResult[]>([]);
  const startedAt = useRef<string>("");
  /** The ending picked for this session (varies from session to session). */
  const ending = useRef("");
  /** True once the current session has been handed to the server (or there is nothing to save). */
  const submitted = useRef(true);
  /** The kind reply to the last answer, read aloud together with the ending. */
  const lastFeedback = useRef<string | undefined>(undefined);

  const playing = phase.kind === "playing";
  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  function sessionInput(): SessionInput {
    return {
      game_type: game.type,
      started_at: startedAt.current,
      ended_at: new Date().toISOString(),
      rounds: results.current,
      completed: results.current.length === ROUNDS_PER_SESSION,
    };
  }

  const save = useMutation({
    mutationFn: () => postSession(sessionInput()),
    onSuccess: (result: SessionResult) => {
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
    save.reset();
    setPhase({ kind: "playing", round: 1 });
  }

  function submit() {
    submitted.current = true;
    save.mutate();
  }

  function onRoundComplete(round: number, result: RoundResult, feedback?: string) {
    results.current = [...results.current, result];
    const message = feedback ?? (result.correct ? copy.games.roundWell : copy.games.roundTryAnother);
    if (round >= ROUNDS_PER_SESSION) {
      lastFeedback.current = feedback;
      setPhase({ kind: "done", lastFeedback: feedback });
      submit();
    } else {
      setPhase({ kind: "between", round, feedback: message });
      speak(message);
    }
  }

  // After a session: the next game on today's list that is not finished yet.
  const today = useQuery({
    queryKey: ["todaysGames"],
    queryFn: getTodaysGames,
    enabled: phase.kind === "done" && save.isSuccess,
  });
  const nextGame = today.data?.games
    .filter((g) => !g.done_today && g.game_type !== game.type)
    .map((g) => findGame(g.game_type))
    .find((g) => g !== undefined);

  if (level.isPending) return <p className="text-2xl">{copy.common.loading}</p>;
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

    case "playing":
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="text-xl text-ink-soft">{copy.games.roundOf(phase.round, ROUNDS_PER_SESSION)}</p>
          <game.Round
            key={phase.round}
            level={level.data}
            roundIndex={phase.round - 1}
            rng={rng}
            onComplete={(result, feedback) => onRoundComplete(phase.round, result, feedback)}
          />
        </div>
      );

    case "between":
      return (
        <Card>
          <p className="mb-6 text-3xl font-semibold" role="status">
            {phase.feedback}
          </p>
          <BigButton
            label={copy.games.next}
            icon={<ArrowRight />}
            onClick={() => setPhase({ kind: "playing", round: phase.round + 1 })}
          />
        </Card>
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
      if (!save.isSuccess) return <p className="text-2xl">{copy.games.saving}</p>;
      return (
        // Kept compact so "Next game" is always on screen on a phone (CLAUDE.md section 4).
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-4" role="status">
            {phase.lastFeedback && <p className="text-2xl">{phase.lastFeedback}</p>}
            <p className="flex items-start gap-2 text-2xl font-semibold">
              <Sparkles aria-hidden="true" className="mt-1 size-7 shrink-0 text-accent-strong" />
              <span>{ending.current.replace(copy.games.endUp, "").trim()}</span>
            </p>
            {ending.current.includes(copy.games.endUp) && <p className="text-xl">{copy.games.endUp}</p>}
          </div>
          {nextGame ? (
            <BigButton
              to={`/patient/games/${nextGame.type}`}
              label={copy.games.nextGame}
              note={nextGame.title}
              icon={<ArrowRight />}
            />
          ) : (
            <BigButton to="/patient" label={copy.games.backHome} icon={<House />} />
          )}
          <BigButton label={copy.games.playAgain} icon={<RotateCw />} variant="secondary" onClick={start} />
        </div>
      );
  }
}

/** Warm, varied encouragement; a gentle note when the game will be harder next time. */
export function endMessage(result: SessionResult, random: number): string {
  const words = copy.games.encouragement;
  const pick = words[Math.min(words.length - 1, Math.floor(random * words.length))]!;
  return result.level_change === "up" ? `${pick} ${copy.games.endUp}` : pick;
}
