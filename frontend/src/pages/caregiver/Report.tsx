import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getReport, serverDate, type DoctorReport, type IndexStatus, type ReportGame } from "../../api/client";
import { formatZ } from "../../components/caregiver/Status";
import { LoadError } from "../../components/caregiver/LoadError";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { cgEn } from "../../i18n/caregiver/en";
import { applyCaregiverDocument, CG_LANGUAGE, gameName, LOCALE, serverText, t } from "../../t";

const R = t.report;

const PERIODS = [30, 90] as const;
const STATUS_WORD: Record<IndexStatus, string> = t.common.status;

export const REPORT_STATEMENT = R.statement;

/** In Hindi the doctor also sees the clinical English name: "जोड़ी मिलान (Memory Match)". */
const reportGameName = (g: ReportGame["game_type"]) =>
  CG_LANGUAGE === "en" ? gameName(g) : `${gameName(g)} (${cgEn.common.games[g]})`;

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });

/** A small line of the session scores, for print (no interaction, no colour meaning). */
function Sparkline({ game }: { game: ReportGame }) {
  const values = game.points.map((p) => p.composite);
  if (values.length < 2) return <span className="text-ink-muted">—</span>;
  const w = 120;
  const h = 28;
  // From 0, so a small dip looks small (no auto-zoom on the range).
  const lo = 0;
  const hi = Math.max(...values) * 1.1 || 1;
  const span = hi - lo;
  const points = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={R.sparkline(values.length)}>
      <polyline points={points.join(" ")} fill="none" stroke="var(--color-brand-dark)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** The longest run of consecutive "not so good" answers (days without an answer break it). */
export function notSoGoodRun(days: DoctorReport["mood_days"]): number {
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const t = new Date(`${d.date}T00:00:00`).getTime() / 86_400_000;
    run = d.mood === "not_so_good" ? (prev !== null && Math.round(t - prev) === 1 && run > 0 ? run + 1 : 1) : 0;
    prev = t;
    best = Math.max(best, run);
  }
  return best;
}

function averages(g: ReportGame): string {
  const f = (x: number | null) => (x === null ? "—" : x.toFixed(2));
  if (g.first_half === null && g.second_half === null) return "—";
  return `${f(g.first_half)} → ${f(g.second_half)}`;
}

function StatusCell({ game: g }: { game: ReportGame }) {
  if (g.z === null) {
    return (
      <>
        {R.learning}
        {g.sessions_to_baseline > 0 && <span className="block text-ink-muted">{R.toBaseline(g.sessions_to_baseline)}</span>}
      </>
    );
  }
  return (
    <>
      {STATUS_WORD[g.status]} <span className="whitespace-nowrap text-ink-muted">(z {formatZ(g.z)})</span>
    </>
  );
}

export function ReportBody({ report, notes }: { report: DoctorReport; notes: string }) {
  const r = report;
  const d = r.doses;
  const doseTotal = d.taken + d.missed + d.unsure;
  return (
    <article className="report-sheet mx-auto flex max-w-[210mm] flex-col gap-5 bg-surface p-8 text-ink print:max-w-none print:p-0">
      <header className="flex flex-col gap-1 border-b border-line pb-3">
        <p className="text-sm text-ink-muted">{R.kicker}</p>
        <h1 className="text-2xl font-semibold">{r.name}</h1>
        <p>
          {R.period(longDate(r.start), longDate(r.end), r.days, serverDate(r.generated_at).toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" }))}
        </p>
      </header>

      <section aria-labelledby="r-overall">
        <h2 id="r-overall" className="mb-1 text-lg font-semibold">{R.overallTitle}</h2>
        <p>
          {R.overallStatus}
          <strong>{STATUS_WORD[r.cognitive_status]}</strong>
          {r.cognitive_index !== null && R.index(formatZ(r.cognitive_index))}
          {R.played(r.days_played, r.days)}
        </p>
        <p className="text-sm text-ink-muted">
          {R.overallHelp}
        </p>
      </section>

      <section aria-labelledby="r-games">
        <h2 id="r-games" className="mb-2 text-lg font-semibold">{R.gamesTitle}</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line-strong text-ink-muted">
              <th className="py-1.5 pr-3 font-medium">{R.colGame}</th>
              <th className="py-1.5 pr-3 font-medium">{R.colSessions}</th>
              <th className="py-1.5 pr-3 font-medium">{R.colScore}</th>
              <th className="py-1.5 pr-3 font-medium">{R.colStatus}</th>
              <th className="py-1.5 font-medium">{R.colSpark}</th>
            </tr>
          </thead>
          <tbody>
            {r.games.map((g) => (
              <tr key={g.game_type} className="break-inside-avoid border-b border-line">
                <td className="py-1.5 pr-3">{reportGameName(g.game_type)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{g.sessions}</td>
                <td className="py-1.5 pr-3 tabular-nums">{averages(g)}</td>
                <td className="py-1.5 pr-3">
                  <StatusCell game={g} />
                </td>
                <td className="py-1.5">
                  <Sparkline game={g} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-sm text-ink-muted">{R.scoreHelp}</p>
      </section>

      <section aria-labelledby="r-adherence" className="break-inside-avoid">
        <h2 id="r-adherence" className="mb-1 text-lg font-semibold">{R.adherenceTitle}</h2>
        {doseTotal === 0 ? (
          <p>{R.noMedicines}</p>
        ) : (
          <p>
            {R.doses(d.taken, doseTotal)}
            {d.taken_late > 0 && R.confirmedLater(d.taken_late)}
            {R.dosesRest(d.missed, d.unsure)}
          </p>
        )}
        <p>
          {R.allReminders(r.reminders_done, r.reminders_total)}
        </p>
      </section>

      <section aria-labelledby="r-alerts" className="break-inside-avoid">
        <h2 id="r-alerts" className="mb-1 text-lg font-semibold">{R.alertsTitle}</h2>
        {r.alerts.length === 0 ? (
          <p>{R.none}</p>
        ) : (
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {r.alerts.map((a) => (
              <li key={a.id}>
                {serverDate(a.created_at).toLocaleDateString(LOCALE, { day: "numeric", month: "short" })} ({t.common.severity[a.severity]}):{" "}
                {serverText(a.message, a.message_i18n)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="r-mood" className="break-inside-avoid">
        <h2 id="r-mood" className="mb-1 text-lg font-semibold">{R.moodTitle}</h2>
        {r.mood.good + r.mood.okay + r.mood.not_so_good + r.mood.skipped === 0 ? (
          <p>{R.moodNone}</p>
        ) : (
          <p>
            {R.moodCounts(r.mood.good, r.mood.okay, r.mood.not_so_good, r.mood.skipped, r.mood_days.length, r.days)}
            {notSoGoodRun(r.mood_days) >= 3 && R.moodRun(notSoGoodRun(r.mood_days))}
          </p>
        )}
      </section>

      <section aria-labelledby="r-voice" className="break-inside-avoid">
        <h2 id="r-voice" className="mb-1 text-lg font-semibold">{R.voiceTitle}</h2>
        <p>
          {R.recordings(r.recordings)}
        </p>
      </section>

      <section aria-labelledby="r-notes" className="break-inside-avoid">
        <h2 id="r-notes" className="mb-1 text-lg font-semibold">{R.notesTitle}</h2>
        <p className="min-h-16 whitespace-pre-wrap">{notes.trim() || "—"}</p>
      </section>

      <footer className="break-inside-avoid border-t border-line pt-3 text-sm">
        <p className="font-medium">{REPORT_STATEMENT}</p>
      </footer>
    </article>
  );
}

/**
 * The doctor report: a print-optimised 1–2 page summary. "Download PDF" opens the browser's print
 * dialog (choose "Save as PDF"); no PDF library. Notes typed here print with it and are not saved.
 */
export function DoctorReportPage() {
  const patientId = Number(useParams().patientId);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [notes, setNotes] = useState("");
  const report = useQuery({ queryKey: ["report", patientId, days], queryFn: () => getReport(patientId, days) });
  // Outside CaregiverLayout: set the caregiver's language on <html> here too.
  useEffect(applyCaregiverDocument, []);

  return (
    <div className="caregiver min-h-screen bg-desk text-sm text-ink print:bg-white">
      <style>{"@page { size: A4; margin: 14mm; } @media print { .report-sheet { box-shadow: none; } .demo-banner { display: none !important; } }"}</style>
      <div className="mx-auto flex max-w-[210mm] flex-col gap-3 px-4 py-4 print:hidden">
        <Link to={`/caregiver/patients/${patientId}`} className="inline-flex items-center gap-1 self-start rounded text-brand-dark underline underline-offset-2">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {R.back}
        </Link>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">{R.periodLabel}</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value) as (typeof PERIODS)[number])} className="rounded-md border border-line bg-surface px-2 py-1.5">
              {PERIODS.map((d) => (
                <option key={d} value={d}>
                  {R.lastDays(d)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" icon={<Download />} onClick={() => window.print()} disabled={!report.isSuccess}>
            {R.download}
          </Button>
        </div>
        <p className="text-ink-muted">{R.downloadHelp}</p>
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">{R.notesLabel}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1500}
            className="rounded-md border border-line bg-surface p-2"
            placeholder={R.notesPlaceholder}
          />
        </label>
      </div>
      <div className="px-4 pb-8 print:p-0">
        {report.isPending && (
          <div role="status" aria-busy="true" aria-label={R.loading} className="mx-auto flex max-w-[210mm] flex-col gap-3 bg-surface p-8">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {report.isError && <LoadError message={R.loadFailed} onRetry={() => void report.refetch()} />}
        {report.isSuccess && <ReportBody report={report.data} notes={notes} />}
      </div>
    </div>
  );
}
