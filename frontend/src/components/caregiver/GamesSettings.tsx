import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { getGameCatalog, resetTutorial, updatePatient, type GameType, type Patient } from "../../api/client";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { useToast } from "../../ui/Toast";
import { GAME_NAMES } from "./TrendCharts";

const CORE_SIZE = 4;

/**
 * The patient's core set (CLAUDE.md section 7, research.md D7): 4 levelled games that rotate
 * through Today's games and count for decline alerts and the overall status. Other games are
 * "More games": recorded with their own chart, never in alerts.
 */
export function CoreGamesForm({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const catalog = useQuery({ queryKey: ["gameCatalog"], queryFn: getGameCatalog, staleTime: Infinity });
  const [chosen, setChosen] = useState<GameType[]>(patient.core_games);
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: (games: GameType[] | null) => updatePatient(patient.id, { core_games: games }),
    onSuccess: (updated) => {
      setEditing(false);
      setChosen(updated.core_games);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      void queryClient.invalidateQueries({ queryKey: ["trend", patient.id] });
      toast.show({ message: updated.core_is_default ? "Core games are back to the default set." : "Core games saved." });
    },
  });

  const domainOf = (g: GameType) => catalog.data?.find((c) => c.game_type === g)?.domain ?? "";
  const duplicates = chosen.length === CORE_SIZE && new Set(chosen).size < CORE_SIZE;
  const sameDomain =
    !duplicates && catalog.isSuccess && new Set(chosen.map(domainOf)).size < chosen.length ? "Two of these test the same thing." : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!duplicates) save.mutate(chosen);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-labelledby="core-games-heading">
      <h2 id="core-games-heading" className="text-lg font-semibold">
        Core games
      </h2>
      <p className="max-w-prose text-ink-muted">
        These 4 games take turns in today's games and count for decline alerts and the overall status. Other games stay
        available under "More games" and get their own chart, but never raise alerts. Changing a game starts its
        baseline from the beginning (about 15 sessions).
      </p>
      {!editing ? (
        <>
          <ul className="flex flex-wrap gap-2">
            {patient.core_games.map((g) => (
              <li key={g} className="rounded-md border border-line bg-sunken px-3 py-1.5">
                <span className="font-medium">{GAME_NAMES[g]}</span>
                {catalog.isSuccess && <span className="text-ink-muted"> · {domainOf(g)}</span>}
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">{patient.core_is_default ? "The default set." : "Chosen by a caregiver."}</p>
          <Button className="self-start" onClick={() => setEditing(true)}>
            Change core games
          </Button>
        </>
      ) : catalog.isPending ? (
        <Skeleton className="h-24 w-full max-w-xl" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {chosen.map((value, i) => (
              <div key={i} className="flex flex-col gap-1">
                <label htmlFor={`core-${i}`} className="text-ink-soft">
                  Game {i + 1}
                </label>
                <select
                  id={`core-${i}`}
                  value={value}
                  onChange={(e) => setChosen(chosen.map((g, j) => (j === i ? (e.target.value as GameType) : g)))}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2"
                >
                  {(catalog.data ?? []).map((c) => (
                    <option key={c.game_type} value={c.game_type}>
                      {GAME_NAMES[c.game_type]} ({c.domain})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {duplicates && <p className="text-accent-strong">Choose 4 different games.</p>}
          {sameDomain && <p className="text-ink-muted">{sameDomain} That's allowed; a mix of domains tracks more of the mind.</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" loading={save.isPending && save.variables !== null} disabled={duplicates}>
              Save core games
            </Button>
            {!patient.core_is_default && (
              <Button onClick={() => save.mutate(null)} loading={save.isPending && save.variables === null}>
                Use the default set
              </Button>
            )}
            <Button
              variant="quiet"
              onClick={() => {
                setChosen(patient.core_games);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
      {save.isError && (
        <p role="alert" className="text-danger">
          Could not save the core games.
        </p>
      )}
    </form>
  );
}

/** "Show the tutorial again": the next time the patient opens that game (research.md 3.4). */
export function TutorialAgainForm({ patientId, games }: { patientId: number; games: readonly GameType[] }) {
  const toast = useToast();
  const [game, setGame] = useState<GameType>(games[0]!);
  const reset = useMutation({
    mutationFn: () => resetTutorial(patientId, game),
    onSuccess: () => toast.show({ message: `The ${GAME_NAMES[game]} tutorial will show the next time it's opened.` }),
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        reset.mutate();
      }}
    >
      <h2 className="text-lg font-semibold">Game tutorials</h2>
      <p className="text-ink-muted">Each game shows a short spoken demo and a practice round the first time it's opened.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="tutorial-game" className="text-ink-soft">
            Game
          </label>
          <select
            id="tutorial-game"
            value={game}
            onChange={(e) => setGame(e.target.value as GameType)}
            className="rounded-md border border-line-strong bg-surface px-3 py-2"
          >
            {games.map((g) => (
              <option key={g} value={g}>
                {GAME_NAMES[g]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" loading={reset.isPending}>
          Show the tutorial again
        </Button>
      </div>
      {reset.isError && (
        <p role="alert" className="text-danger">
          Could not save that just now.
        </p>
      )}
    </form>
  );
}
