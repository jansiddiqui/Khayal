import { AlarmClock, ClipboardList, Puzzle, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTodayReminders, getTodaysGames, type TodayReminder } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { BigButton } from "../../components/BigButton";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";

/** Something due now and not done comes first; otherwise the next one later today. */
function nextReminderText(reminders: TodayReminder[] | undefined): string {
  const open = (reminders ?? []).filter((r) => r.status !== "done");
  const dueNow = open.find((r) => r.due);
  if (dueNow) return copy.patientHome.reminderNow(dueNow.title);
  const upcoming = open.find((r) => !r.due);
  if (upcoming) return copy.patientHome.nextReminder(copy.reminders.time(upcoming.time_of_day), upcoming.title);
  return copy.patientHome.noReminder;
}

/**
 * Patient Home layout is fixed by CLAUDE.md section 4: reminder card + exactly 3 buttons.
 * Compact enough to fit a 375 × 667 phone without scrolling; "Play a game" shows today's progress.
 */
export function PatientHome() {
  const { state } = useAuth();
  const firstName = state.status === "authenticated" ? state.user.name.split(" ")[0] : "";
  const reminders = useQuery({ queryKey: ["todayReminders"], queryFn: getTodayReminders, staleTime: 0 });
  const games = useQuery({ queryKey: ["todaysGames"], queryFn: getTodaysGames, staleTime: 0 });
  const progress = games.data
    ? copy.patientHome.gamesProgress(games.data.games.filter((g) => g.done_today).length, games.data.games.length)
    : undefined;

  return (
    <Layout title={copy.patientHome.greeting(firstName)} snug>
      <section
        aria-labelledby="next-reminder"
        className="flex items-start gap-3 rounded-2xl border-4 border-calm bg-calm-soft px-4 py-3"
      >
        <AlarmClock aria-hidden="true" className="mt-1 size-8 shrink-0 text-calm" />
        <div>
          <h2 id="next-reminder" className="text-xl font-bold">
            {copy.patientHome.nextReminderLabel}
          </h2>
          <p className="text-2xl leading-snug">
            {reminders.isPending ? copy.common.loading : nextReminderText(reminders.data)}
          </p>
        </div>
      </section>
      <nav aria-label="Main actions" className="flex flex-col gap-3">
        <BigButton to="/patient/games" icon={<Puzzle />} label={copy.patientHome.playGames} note={progress} size="home" />
        <BigButton to="/patient/reminders" icon={<ClipboardList />} label={copy.patientHome.todaysReminders} size="home" />
        <BigButton to="/patient/who-is-this" icon={<Users />} label={copy.patientHome.whoIsThis} size="home" />
      </nav>
    </Layout>
  );
}
