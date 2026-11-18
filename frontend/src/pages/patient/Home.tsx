import { AlarmClock, ClipboardList, Puzzle, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMoodToday, getTodayReminders, getTodaysGames, type TodayReminder } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { BigButton } from "../../components/BigButton";
import { Layout } from "../../components/Layout";
import { MoodCheckin } from "../../components/MoodCheckin";
import { ProgressRing } from "../../components/ProgressRing";
import { copy } from "../../copy";
import { Skeleton } from "../../ui/Skeleton";

/**
 * Something within its on-time window comes first ("Now"); otherwise the next one later today.
 * An overdue reminder is never shown here as "Now" (CLAUDE.md section 6, "Overdue reminders").
 */
export function nextReminderText(reminders: TodayReminder[] | undefined): string {
  const list = reminders ?? [];
  const dueNow = list.find((r) => r.phase === "due");
  if (dueNow) return copy.patientHome.reminderNow(dueNow.title);
  const upcoming = list.find((r) => r.phase === "upcoming");
  if (upcoming) return copy.patientHome.nextReminder(copy.reminders.time(upcoming.time_of_day), upcoming.title);
  return copy.patientHome.noReminder;
}

/**
 * Patient Home (CLAUDE.md section 4): a greeting for the time of day, the next reminder card, and
 * exactly 3 big buttons; "Play a game" and "Today's reminders" show today's progress (words + ring).
 */
export function PatientHome() {
  const { state } = useAuth();
  const firstName = state.status === "authenticated" ? state.user.name.split(" ")[0] ?? "" : "";
  const reminders = useQuery({ queryKey: ["todayReminders"], queryFn: getTodayReminders, staleTime: 0 });
  const games = useQuery({ queryKey: ["todaysGames"], queryFn: getTodaysGames, staleTime: 0 });
  const gamesDone = games.data?.games.filter((g) => g.done_today).length ?? 0;
  const gamesTotal = games.data?.games.length ?? 0;
  const remindersDone = reminders.data?.filter((r) => r.phase === "done").length ?? 0;
  const remindersTotal = reminders.data?.length ?? 0;
  const progress = games.data ? copy.patientHome.gamesProgress(gamesDone, gamesTotal) : undefined;
  const remindersProgress =
    reminders.isSuccess && remindersTotal > 0 ? copy.patientHome.gamesProgress(remindersDone, remindersTotal) : undefined;
  // Once a day, the first time Home opens: "How are you feeling today?" (optional; a failed check never blocks Home).
  const mood = useQuery({ queryKey: ["moodToday"], queryFn: getMoodToday, staleTime: 0 });
  if (mood.isSuccess && !mood.data.asked) return <MoodCheckin />;

  return (
    <Layout title={copy.patientHome.greetingAt(firstName, new Date().getHours())} snug>
      <section
        aria-labelledby="next-reminder"
        className="flex items-start gap-3 rounded-2xl border-4 border-calm bg-calm-soft px-4 py-2.5"
      >
        <AlarmClock aria-hidden="true" className="mt-1 size-8 shrink-0 text-calm" />
        <div className="min-w-0 flex-1">
          {/* A label for the card, not a heading: section 4 keeps headings at 32px or more. */}
          <p id="next-reminder" className="text-xl font-bold">
            {copy.patientHome.nextReminderLabel}
          </p>
          {reminders.isPending ? (
            <Skeleton className="mt-1 h-8 w-4/5" />
          ) : (
            <p className="text-2xl leading-snug">
              {reminders.isError ? copy.patientHome.reminderUnavailable : nextReminderText(reminders.data)}
            </p>
          )}
        </div>
      </section>
      <nav aria-label="Main actions" className="flex flex-col gap-3">
        {/* Today's progress lives in the buttons it belongs to: words, plus a ring that fills. */}
        <BigButton
          to="/patient/games"
          icon={<Puzzle />}
          label={copy.patientHome.playGames}
          note={progress}
          size="home"
          noteMark={games.isSuccess && gamesTotal > 0 ? <ProgressRing done={gamesDone} total={gamesTotal} /> : undefined}
        />
        <BigButton
          to="/patient/reminders"
          icon={<ClipboardList />}
          label={copy.patientHome.todaysReminders}
          note={remindersProgress}
          size="home"
          noteMark={remindersProgress ? <ProgressRing done={remindersDone} total={remindersTotal} /> : undefined}
        />
        <BigButton to="/patient/who-is-this" icon={<Users />} label={copy.patientHome.whoIsThis} size="home" />
      </nav>
    </Layout>
  );
}
