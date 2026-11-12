import { AlarmClock, ClipboardList, Puzzle, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTodayReminders, type TodayReminder } from "../../api/client";
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

/** Patient Home layout is fixed by CLAUDE.md section 4: reminder card + exactly 3 buttons. */
export function PatientHome() {
  const { state } = useAuth();
  const firstName = state.status === "authenticated" ? state.user.name.split(" ")[0] : "";
  const reminders = useQuery({ queryKey: ["todayReminders"], queryFn: getTodayReminders, staleTime: 0 });

  return (
    <Layout title={copy.patientHome.greeting(firstName)}>
      <section
        aria-labelledby="next-reminder"
        className="rounded-2xl border-4 border-calm bg-emerald-50 p-6"
      >
        <h2 id="next-reminder" className="flex items-center gap-3 text-2xl font-bold">
          <AlarmClock aria-hidden="true" className="size-8 shrink-0 text-calm" />
          {copy.patientHome.nextReminderLabel}
        </h2>
        <p className="mt-2 text-2xl">
          {reminders.isPending ? copy.common.loading : nextReminderText(reminders.data)}
        </p>
      </section>
      <nav aria-label="Main actions" className="flex flex-col gap-4">
        <BigButton to="/patient/games" icon={<Puzzle />} label={copy.patientHome.playGames} />
        <BigButton to="/patient/reminders" icon={<ClipboardList />} label={copy.patientHome.todaysReminders} />
        <BigButton to="/patient/who-is-this" icon={<Users />} label={copy.patientHome.whoIsThis} />
      </nav>
    </Layout>
  );
}
