import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { getGameCatalog, resetTutorial, updatePatient, type GameType, type Patient } from "../../api/client";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { useToast } from "../../ui/Toast";
import { GAME_NAMES } from "./TrendCharts";
import { copy } from "../../copy";
import { t } from "../../t";
import { FESTIVAL_IDS, type FestivalId } from "../../games/dailyOrientation/festivals";

const CORE_SIZE = 4;

/** What the patient sees each game called (copy.ts), next to the clinical name caregivers see. */
export const PATIENT_TITLES: Partial<Record<GameType, string>> = {
  memory_match: copy.games.memoryMatch.title,
  sequence_recall: copy.games.sequenceRecall.title,
  word_recall: copy.games.wordRecall.title,
  daily_orientation: copy.games.orientation.title,
  reaction_tap: copy.games.reactionTap.title,
  colour_trails: copy.games.colourTrails.title,
  clock_setting: copy.games.clockSetting.title,
  money_handling: copy.games.market.title,
  spatial_span: copy.games.spatialSpan.title,
  object_location: copy.games.objectLocation.title,
};

/** "Paired Associates (object location) — “Where did it go?”", plus " (domain)" when given. */
export function gameLabel(game: GameType, domain?: string): string {
  const title = PATIENT_TITLES[game];
  const base = title ? `${GAME_NAMES[game]} — “${title}”` : GAME_NAMES[game];
  return domain ? `${base} (${domain})` : base;
}

/** A game's domain in the caregiver's language; the server's English when there is no translation. */
function domainName(game: GameType, serverDomain: string): string {
  return serverDomain ? (t.elderPanels.games.domains[game] ?? serverDomain) : "";
}

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
      toast.show({ message: updated.core_is_default ? t.elderPanels.games.coreDefault : t.elderPanels.games.coreSaved });
    },
  });

  const domainOf = (g: GameType) => domainName(g, catalog.data?.find((c) => c.game_type === g)?.domain ?? "");
  const duplicates = chosen.length === CORE_SIZE && new Set(chosen).size < CORE_SIZE;
  const sameDomain =
    !duplicates && catalog.isSuccess && new Set(chosen.map(domainOf)).size < chosen.length ? t.elderPanels.games.sameDomain : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!duplicates) save.mutate(chosen);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-labelledby="core-games-heading">
      <h2 id="core-games-heading" className="text-lg font-semibold">
        {t.elderPanels.games.coreTitle}
      </h2>
      <p className="max-w-prose text-ink-muted">
        {t.elderPanels.games.coreIntro}
      </p>
      {!editing ? (
        <>
          <ul className="flex flex-wrap gap-2">
            {patient.core_games.map((g) => (
              <li key={g} className="rounded-md border border-line bg-sunken px-3 py-1.5">
                <span className="font-medium">{gameLabel(g)}</span>
                {catalog.isSuccess && <span className="text-ink-muted"> · {domainOf(g)}</span>}
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">{patient.core_is_default ? t.elderPanels.games.defaultSet : t.elderPanels.games.chosenByCaregiver}</p>
          <Button className="self-start" onClick={() => setEditing(true)}>
            {t.elderPanels.games.changeCore}
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
                  {t.elderPanels.games.gameN(i + 1)}
                </label>
                <select
                  id={`core-${i}`}
                  value={value}
                  onChange={(e) => setChosen(chosen.map((g, j) => (j === i ? (e.target.value as GameType) : g)))}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2"
                >
                  {(catalog.data ?? []).map((c) => (
                    <option key={c.game_type} value={c.game_type}>
                      {gameLabel(c.game_type, domainName(c.game_type, c.domain))}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {duplicates && <p className="text-accent-strong">{t.elderPanels.games.chooseDifferent}</p>}
          {sameDomain && <p className="text-ink-muted">{sameDomain} {t.elderPanels.games.mixAllowed}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" loading={save.isPending && save.variables !== null} disabled={duplicates}>
              {t.elderPanels.games.saveCore}
            </Button>
            {!patient.core_is_default && (
              <Button onClick={() => save.mutate(null)} loading={save.isPending && save.variables === null}>
                {t.elderPanels.games.useDefault}
              </Button>
            )}
            <Button
              variant="quiet"
              onClick={() => {
                setChosen(patient.core_games);
                setEditing(false);
              }}
            >
              {t.elderPanels.games.cancel}
            </Button>
          </div>
        </>
      )}
      {save.isError && (
        <p role="alert" className="text-danger">
          {t.elderPanels.games.coreFailed}
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
    onSuccess: () => toast.show({ message: t.elderPanels.games.tutorialToast(GAME_NAMES[game]) }),
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        reset.mutate();
      }}
    >
      <h2 className="text-lg font-semibold">{t.elderPanels.games.tutorialTitle}</h2>
      <p className="text-ink-muted">{t.elderPanels.games.tutorialIntro}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="tutorial-game" className="text-ink-soft">
            {t.elderPanels.games.game}
          </label>
          <select
            id="tutorial-game"
            value={game}
            onChange={(e) => setGame(e.target.value as GameType)}
            className="rounded-md border border-line-strong bg-surface px-3 py-2"
          >
            {games.map((g) => (
              <option key={g} value={g}>
                {gameLabel(g)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" loading={reset.isPending}>
          {t.elderPanels.games.tutorialAgain}
        </Button>
      </div>
      {reset.isError && (
        <p role="alert" className="text-danger">
          {t.elderPanels.games.tutorialFailed}
        </p>
      )}
    </form>
  );
}

/**
 * The festivals this family celebrates (research.md D6). About Today then asks "Which festival
 * comes next?" in the 30 days before one of them. Nothing ticked = the question is off.
 */
export function FestivalsForm({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(patient.festivals ?? []));
  const save = useMutation({
    mutationFn: () => updatePatient(patient.id, { festivals: [...chosen] }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.show({
        message: updated.festivals?.length ? t.elderPanels.games.festivalsSaved : t.elderPanels.games.festivalsOff,
      });
    },
  });
  const changed = [...chosen].sort().join() !== [...(patient.festivals ?? [])].sort().join();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-lg font-semibold">{t.elderPanels.games.festivalsTitle}</legend>
        <p className="max-w-prose text-ink-muted">
          {t.elderPanels.games.festivalsIntro}
        </p>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
          {FESTIVAL_IDS.map((id: FestivalId) => (
            <label key={id} className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={chosen.has(id)}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(id);
                  else next.delete(id);
                  setChosen(next);
                }}
              />
              {copy.festivals[id]}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" className="self-start" loading={save.isPending} disabled={!changed}>
        {t.elderPanels.games.saveFestivals}
      </Button>
      {save.isError && (
        <p role="alert" className="text-danger">
          {t.elderPanels.games.festivalsFailed}
        </p>
      )}
    </form>
  );
}

/** Levelled games (the ones that can be in the core set or in "More games"). */
const LEVELLED: readonly GameType[] = [
  "word_recall", "object_location", "colour_trails", "money_handling", "memory_match", "sequence_recall", "reaction_tap",
  "clock_setting", "spatial_span",
];

/**
 * Settings → "Hide these games": games outside the core set the family doesn't want offered
 * (more-games-rotation). Hidden games never appear in "More games" or its full list; core games
 * can't be hidden here (change the core set first).
 */
export function HiddenGamesForm({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const options = LEVELLED.filter((g) => !patient.core_games.includes(g));
  const [hidden, setHidden] = useState<ReadonlySet<GameType>>(new Set(patient.hidden_games ?? []));
  const save = useMutation({
    mutationFn: () => updatePatient(patient.id, { hidden_games: [...hidden] }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      const n = updated.hidden_games?.length ?? 0;
      toast.show({ message: t.elderPanels.games.hiddenToast(n) });
    },
  });
  const changed = [...hidden].sort().join() !== [...(patient.hidden_games ?? [])].sort().join();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-lg font-semibold">{t.elderPanels.games.hiddenTitle}</legend>
        <p className="max-w-prose text-ink-muted">
          {t.elderPanels.games.hiddenIntro}
        </p>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {options.map((g) => (
            <label key={g} className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={hidden.has(g)}
                onChange={(e) => {
                  const next = new Set(hidden);
                  if (e.target.checked) next.add(g);
                  else next.delete(g);
                  setHidden(next);
                }}
              />
              {gameLabel(g)}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" className="self-start" loading={save.isPending} disabled={!changed}>
        {t.elderPanels.games.saveHidden}
      </Button>
      {save.isError && (
        <p role="alert" className="text-danger">
          {t.elderPanels.games.hiddenFailed}
        </p>
      )}
    </form>
  );
}
