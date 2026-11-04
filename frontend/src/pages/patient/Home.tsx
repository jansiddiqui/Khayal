import { useAuth } from "../../auth/AuthContext";
import { BigButton } from "../../components/BigButton";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";

/** Patient Home layout is fixed by CLAUDE.md section 4: reminder card + exactly 3 buttons. */
export function PatientHome() {
  const { state } = useAuth();
  const firstName = state.status === "authenticated" ? state.user.name.split(" ")[0] : "";
  // Reminders arrive in Milestone 5; until then the card shows the empty message.
  const nextReminder: string | null = null;

  return (
    <Layout title={copy.patientHome.greeting(firstName)}>
      <section
        aria-labelledby="next-reminder"
        className="rounded-2xl border-4 border-calm bg-emerald-50 p-6"
      >
        <h2 id="next-reminder" className="flex items-center gap-3 text-2xl font-bold">
          <span aria-hidden="true">⏰</span>
          {copy.patientHome.nextReminderLabel}
        </h2>
        <p className="mt-2 text-2xl">{nextReminder ?? copy.patientHome.noReminder}</p>
      </section>
      <nav aria-label="Main actions" className="flex flex-col gap-5">
        <BigButton to="/patient/games" icon="🧩" label={copy.patientHome.playGames} />
        <BigButton to="/patient/reminders" icon="📋" label={copy.patientHome.todaysReminders} />
        <BigButton to="/patient/who-is-this" icon="👪" label={copy.patientHome.whoIsThis} />
      </nav>
    </Layout>
  );
}
