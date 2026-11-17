import { Check, CircleHelp, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { ReminderIcon } from "../../components/ReminderIcon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTodayReminders, markReminderDone, markReminderUnsure, type TodayReminder } from "../../api/client";
import { BigButton } from "../../components/BigButton";
import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";
import { useReadAloud } from "../../readAloud/ReadAloudContext";
import { useFeedback } from "../../ui/feedback";
import { calm, DURATION, useLessMotion } from "../../ui/motion";
import { Busy, Skeleton } from "../../ui/Skeleton";

/**
 * One reminder is asked about at a time (one main action, CLAUDE.md section 4), so its answer
 * buttons are always on screen at 375 × 812; the next appears when it is answered.
 */
export const MAX_ACTION_BUTTONS = 3;

/** Compact: the icon and the title on one line (the time is in the question). */
function ReminderTitle({ reminder }: { reminder: TodayReminder }) {
  return (
    <p className="flex items-center gap-3 text-2xl font-semibold">
      <ReminderIcon type={reminder.type} className="size-8 shrink-0" />
      <span className="min-w-0">{reminder.title}</span>
    </p>
  );
}

function ReminderLine({ reminder }: { reminder: TodayReminder }) {
  const r = copy.reminders;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 text-2xl">
      <ReminderIcon type={reminder.type} className="size-8 shrink-0 self-center" />
      <span className="font-semibold">{r.time(reminder.time_of_day)}</span>
      <span>{reminder.title}</span>
      <span className="text-xl text-ink-soft">({r.types[reminder.type]})</span>
    </p>
  );
}

/** A tick that draws itself once (static under reduced motion). */
function DrawnCheck() {
  const less = useLessMotion();
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-9 shrink-0 text-calm">
      <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.14" />
      <motion.path
        d="M6.5 12.5l3.6 3.6L17.6 8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: less ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={calm(less ? 0 : DURATION.slow)}
      />
    </svg>
  );
}

type LocalAnswer = { kind: "done" } | { kind: "unsure"; medicine: boolean };

export function Reminders() {
  const r = copy.reminders;
  const { speak } = useReadAloud();
  const { cue } = useFeedback();
  const less = useLessMotion();
  const queryClient = useQueryClient();
  const today = useQuery({ queryKey: ["todayReminders"], queryFn: getTodayReminders, staleTime: 0 });
  // Answers given on this visit stay where they were tapped (no jumping to another list) until next time.
  const [answered, setAnswered] = useState<ReadonlyMap<number, LocalAnswer>>(new Map());
  const [failedId, setFailedId] = useState<number | null>(null);
  // The order of the "Now" list is fixed on first sight, so nothing reshuffles while the patient reads.
  const order = useRef<number[]>([]);

  const answer = useMutation({
    mutationFn: ({ id, kind }: { id: number; kind: "done" | "unsure" }) =>
      kind === "done" ? markReminderDone(id) : markReminderUnsure(id),
    onMutate: ({ id }) => setFailedId((f) => (f === id ? null : f)),
    onSuccess: (_, { id, kind }) => {
      const reminder = today.data?.find((x) => x.id === id);
      const medicine = reminder?.type === "medicine";
      setAnswered((prev) => new Map(prev).set(id, kind === "done" ? { kind: "done" } : { kind: "unsure", medicine }));
      cue(kind === "done" ? "success" : "gentle");
      speak(kind === "done" ? r.thanks : medicine ? r.askFamilyMedicine : r.askFamilyOther);
      void queryClient.invalidateQueries({ queryKey: ["todayReminders"] });
    },
    onError: (_, { id }) => setFailedId(id),
  });

  if (today.isPending) {
    return (
      <Layout title={r.title}>
        <Busy label={copy.common.loading} className="flex flex-col gap-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </Busy>
      </Layout>
    );
  }
  if (today.isError) {
    return (
      <Layout title={r.title}>
        <Card>
          <p className="mb-6 text-2xl">{r.loadFailed}</p>
          <BigButton label={r.retry} icon={<RotateCcw />} onClick={() => void today.refetch()} />
        </Card>
      </Layout>
    );
  }

  const all = today.data;
  const isNow = (x: TodayReminder) => answered.has(x.id) || x.phase === "due" || x.phase === "overdue" || x.phase === "unsure";
  for (const x of all) if (isNow(x) && !order.current.includes(x.id)) order.current.push(x.id);
  const nowList = all.filter(isNow).sort((a, b) => order.current.indexOf(a.id) - order.current.indexOf(b.id));
  const later = all.filter((x) => x.phase === "upcoming" && !answered.has(x.id));
  const finished = all.filter((x) => x.phase === "done" && !answered.has(x.id));

  // One reminder is asked about at a time: the first unanswered one gets its buttons.
  const waiting = nowList.filter((x) => !answered.has(x.id) && x.phase !== "unsure");
  const withButtons = new Set<number>(waiting.slice(0, 1).map((x) => x.id));
  const moreAfter = Math.max(0, waiting.length - 1);

  // Cards that would have no button wait their turn (one thing at a time, CLAUDE.md section 4).
  const shownNow = nowList.filter((x) => answered.has(x.id) || x.phase === "unsure" || withButtons.has(x.id));
  const open = all.filter((x) => x.phase !== "done" && x.phase !== "unsure" && !answered.has(x.id));
  const anyUnsure = all.some((x) => x.phase === "unsure") || [...answered.values()].some((a) => a.kind === "unsure");
  const intro =
    all.length === 0 ? r.nothingToday : open.length === 0 ? (anyUnsure ? r.familyWillHelp : r.allDone) : undefined;
  const heading = shownNow.some((x) => x.phase === "due") || (shownNow.length === 0 && later.length > 0) ? r.nowHeading : r.earlierHeading;

  return (
    <Layout title={r.title} spokenIntro={intro}>
      {intro && (
        <Card>
          <p className="text-2xl">{intro}</p>
        </Card>
      )}

      {(shownNow.length > 0 || later.length > 0) && (
        <section aria-labelledby="now-heading" className="flex flex-col gap-4">
          <h2 id="now-heading" className="text-3xl font-bold">
            {heading}
          </h2>
          {shownNow.length === 0 && <p className="text-2xl">{r.nothingNow}</p>}
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {shownNow.map((reminder) => {
                const local = answered.get(reminder.id);
                const isDone = local?.kind === "done";
                const isUnsure = local?.kind === "unsure" || reminder.phase === "unsure";
                return (
                  <motion.section
                    key={reminder.id}
                    layout={!less}
                    transition={calm(DURATION.base)}
                    aria-label={reminder.title}
                    className={`flex flex-col gap-3 rounded-2xl border-4 p-4 transition-colors duration-300 ${
                      isDone ? "border-calm bg-calm-soft" : isUnsure ? "border-line-strong bg-surface" : "border-brand bg-surface"
                    }`}
                  >
                    {reminder.phase === "overdue" && !isDone && !isUnsure ? <ReminderTitle reminder={reminder} /> : <ReminderLine reminder={reminder} />}
                    {isDone ? (
                      <p role="status" className="flex items-center gap-3 text-2xl font-semibold text-calm">
                        <DrawnCheck />
                        {r.thanks}
                      </p>
                    ) : isUnsure ? (
                      <p role="status" className="flex items-start gap-3 text-2xl">
                        <CircleHelp aria-hidden="true" className="mt-1 size-8 shrink-0 text-brand" />
                        {local?.kind === "unsure"
                          ? local.medicine
                            ? r.askFamilyMedicine
                            : r.askFamilyOther
                          : r.familyKnows}
                      </p>
                    ) : reminder.phase === "overdue" ? (
                      <>
                        <p className="text-2xl font-semibold">{r.overdueAsk(r.time(reminder.time_of_day))}</p>
                        {withButtons.has(reminder.id) && (
                          <div className="flex flex-col gap-3">
                            <BigButton
                              label={r.yesDone}
                              icon={<Check />}
                              size="compact"
                              busy={answer.isPending && answer.variables?.id === reminder.id && answer.variables.kind === "done"}
                              onClick={() => answer.mutate({ id: reminder.id, kind: "done" })}
                            />
                            <BigButton
                              label={r.notSure}
                              icon={<CircleHelp />}
                              variant="secondary"
                              size="compact"
                              busy={answer.isPending && answer.variables?.id === reminder.id && answer.variables.kind === "unsure"}
                              onClick={() => answer.mutate({ id: reminder.id, kind: "unsure" })}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xl">{r.timeForThis}</p>
                        {withButtons.has(reminder.id) && (
                          <BigButton
                            label={r.done}
                            icon={<Check />}
                            size="compact"
                            busy={answer.isPending && answer.variables?.id === reminder.id}
                            onClick={() => answer.mutate({ id: reminder.id, kind: "done" })}
                          />
                        )}
                      </>
                    )}
                    {failedId === reminder.id && (
                      <p role="alert" className="rounded-xl border-4 border-accent bg-accent-soft p-3 text-2xl">
                        {r.saveFailed}
                      </p>
                    )}
                  </motion.section>
                );
              })}
            </AnimatePresence>
          </div>
          {moreAfter > 0 && <p className="text-xl text-ink-soft">{r.moreAfter(moreAfter)}</p>}
        </section>
      )}

      {later.length > 0 && (
        <section aria-labelledby="later-heading" className="flex flex-col gap-3">
          <h2 id="later-heading" className="text-3xl font-bold">
            {r.laterHeading}
          </h2>
          <ul className="flex flex-col gap-3">
            {later.map((reminder) => (
              <li key={reminder.id} className="rounded-2xl border-2 border-line-strong bg-surface p-4">
                <ReminderLine reminder={reminder} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <section aria-labelledby="done-heading" className="flex flex-col gap-3">
          <h2 id="done-heading" className="text-3xl font-bold">
            {r.doneHeading}
          </h2>
          <ul className="flex flex-col gap-3">
            {finished.map((reminder) => (
              <li key={reminder.id} className="rounded-2xl border-2 border-calm bg-calm-soft p-4">
                <ReminderLine reminder={reminder} />
                <p className="mt-1 text-xl font-semibold text-calm">{r.doneMark}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Layout>
  );
}
