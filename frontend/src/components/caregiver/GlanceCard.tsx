import { ArrowRight, Bell, Gamepad2, Pill } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Glance, NextActionKind } from "../../api/client";
import { ActiveState } from "./LiveState";
import { StatusBadge } from "./Status";
import { serverText, t } from "../../t";

const G = t.dashboard.glance;

/** Where each "next action" goes. Hash targets open that section of the elder's page. */
export function nextActionHref(patientId: number, kind: NextActionKind): string {
  const page = `/caregiver/patients/${patientId}`;
  switch (kind) {
    case "check_dose":
    case "missed_dose":
    case "add_reminders":
      return `${page}/reminders`;
    case "alerts":
      return `${page}#alerts`;
    case "pair":
      return `${page}#settings`;
    case "inactive":
      return `${page}#timeline`;
    case "all_good":
      return `${page}#week`;
  }
}

const URGENT: ReadonlySet<NextActionKind> = new Set(["check_dose", "missed_dose", "alerts"]);

export function medicinesText(m: Glance["medicines"]): string {
  const parts = [
    m.taken > 0 && G.taken(m.taken),
    m.unsure > 0 && G.notSure(m.unsure),
    m.missed > 0 && G.missed(m.missed),
    m.to_come > 0 && G.toCome(m.to_come),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : G.noneToday;
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-0.5 text-ink-muted [&>svg]:size-4">
        {icon}
      </span>
      <dt className="sr-only">{label}</dt>
      <dd className="text-ink-soft">{children}</dd>
    </div>
  );
}

/**
 * "Today at a glance" for one elder: games done, medicines, alerts needing action and the ONE
 * next action (Round 2 batch 2). Mobile first: one card per row on a phone.
 */
export function GlanceCard({ glance }: { glance: Glance }) {
  const g = glance;
  const urgent = URGENT.has(g.next_action.kind);
  const doses = g.medicines;
  return (
    <article aria-labelledby={`glance-${g.patient_id}`} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`glance-${g.patient_id}`} className="text-lg font-semibold">
          <Link to={`/caregiver/patients/${g.patient_id}`} className="text-brand-dark underline-offset-2 hover:underline">
            {g.name}
          </Link>
        </h3>
        <StatusBadge status={g.cognitive_status} scope="Overall" />
      </header>
      <dl className="flex flex-col gap-1.5">
        <Row icon={<Gamepad2 />} label={G.gamesLabel}>
          {g.games_total === 0 ? G.noGames : G.gamesDone(g.games_done, g.games_total)}
        </Row>
        <Row icon={<Pill />} label={G.medicinesLabel}>
          <span className={doses.unsure + doses.missed > 0 ? "font-medium text-ink" : ""}>{G.medicines(medicinesText(doses))}</span>
        </Row>
        <Row icon={<Bell />} label={G.alertsLabel}>
          {g.alerts_open === 0 ? G.noAlerts : G.alertsOpen(g.alerts_open)}
        </Row>
      </dl>
      <Link
        to={nextActionHref(g.patient_id, g.next_action.kind)}
        className={`mt-auto flex min-h-11 items-center justify-between gap-2 rounded-md px-3 py-2 font-medium transition-colors duration-150 ease-calm ${
          urgent
            ? "bg-accent-soft text-ink hover:bg-saffron-200"
            : "bg-brand-soft text-brand-dark hover:bg-teal-100"
        }`}
      >
        <span>
          <span className="sr-only">{G.next}</span>
          {serverText(g.next_action.text, g.next_action.text_i18n)}
        </span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
      </Link>
      <p className="text-sm">
        <ActiveState lastActiveAt={g.last_active_at} />
      </p>
    </article>
  );
}
