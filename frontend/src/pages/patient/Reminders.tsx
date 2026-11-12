import { RotateCcw, Check } from "lucide-react";
import { ReminderIcon } from "../../components/ReminderIcon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTodayReminders, markReminderDone, type TodayReminder } from "../../api/client";
import { BigButton } from "../../components/BigButton";
import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";
import { useReadAloud } from "../../readAloud/ReadAloudContext";

/** CLAUDE.md section 4: at most 3 buttons; later reminders show once their time comes. */
const MAX_DONE_BUTTONS = 3;

function ReminderLine({ reminder }: { reminder: TodayReminder }) {
  const r = copy.reminders;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 text-2xl">
      <ReminderIcon type={reminder.type} className="size-8 shrink-0" />
      <span className="font-semibold">{r.time(reminder.time_of_day)}</span>
      <span>{reminder.title}</span>
      <span className="text-xl text-ink-soft">({r.types[reminder.type]})</span>
    </p>
  );
}

export function Reminders() {
  const r = copy.reminders;
  const { speak } = useReadAloud();
  const queryClient = useQueryClient();
  const today = useQuery({ queryKey: ["todayReminders"], queryFn: getTodayReminders, staleTime: 0 });
  const done = useMutation({
    mutationFn: markReminderDone,
    onSuccess: () => {
      speak(r.thanks);
      void queryClient.invalidateQueries({ queryKey: ["todayReminders"] });
    },
  });

  if (today.isPending) {
    return (
      <Layout title={r.title}>
        <p className="text-2xl">{copy.common.loading}</p>
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
  const open = all.filter((x) => x.status !== "done");
  const now = open.filter((x) => x.due).slice(0, MAX_DONE_BUTTONS);
  const later = open.filter((x) => !x.due);
  const finished = all.filter((x) => x.status === "done");

  const intro = all.length === 0 ? r.nothingToday : open.length === 0 ? r.allDone : undefined;

  return (
    <Layout title={r.title} spokenIntro={intro}>
      {done.isSuccess && !done.isPending && (
        <p role="status" className="rounded-xl border-4 border-calm bg-calm-soft p-4 text-2xl">
          {r.thanks}
        </p>
      )}
      {done.isError && (
        <p role="alert" className="rounded-xl border-4 border-accent bg-accent-soft p-4 text-2xl">
          {r.saveFailed}
        </p>
      )}

      {intro && (
        <Card>
          <p className="text-2xl">
            {intro}
          </p>
        </Card>
      )}

      {open.length > 0 && (
        <section aria-labelledby="now-heading" className="flex flex-col gap-4">
          <h2 id="now-heading" className="text-3xl font-bold">
            {r.nowHeading}
          </h2>
          {now.length === 0 && <p className="text-2xl">{r.nothingNow}</p>}
          {now.map((reminder) => (
            <section
              key={reminder.id}
              aria-label={reminder.title}
              className="flex flex-col gap-4 rounded-2xl border-4 border-brand bg-surface p-5"
            >
              <ReminderLine reminder={reminder} />
              <p className="text-xl">{reminder.status === "missed" ? r.letsDoItNow : r.timeForThis}</p>
              <BigButton label={r.done} icon={<Check />} onClick={() => done.mutate(reminder.id)} />
            </section>
          ))}
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
