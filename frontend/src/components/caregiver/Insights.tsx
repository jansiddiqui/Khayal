import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";
import type { Insight, Tone } from "../../api/client";
import { serverText, t } from "../../t";

/** Tone of a plain-language line: an icon and a colour beside the words, never colour alone. */
export const TONE: Record<Tone, { icon: LucideIcon; className: string; label: string }> = {
  good: { icon: CircleCheck, className: "text-success", label: t.elderPanels.insights.toneGood },
  neutral: { icon: Info, className: "text-ink-muted", label: t.elderPanels.insights.toneNeutral },
  attention: { icon: CircleAlert, className: "text-accent-strong", label: t.elderPanels.insights.toneAttention },
};

/**
 * Plain-language insights ("Memory games steady this month", "2 doses unsure this week"). The
 * numbers behind each line open on tap, so the page reads without z-scores.
 */
export function InsightsList({ insights }: { insights: readonly Insight[] }) {
  if (insights.length === 0) return <p className="text-ink-muted">{t.elderPanels.insights.empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {insights.map((i) => {
        const tone = TONE[i.tone];
        return (
          <li key={i.key} className="py-1.5 first:pt-0 last:pb-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md py-1 [&::-webkit-details-marker]:hidden hover:bg-brand-soft/50">
                <tone.icon aria-label={tone.label} role="img" className={`mt-0.5 size-4 shrink-0 ${tone.className}`} strokeWidth={2.25} />
                <span className="flex-1 font-medium text-ink">{serverText(i.text, i.text_i18n)}</span>
                <span className="shrink-0 text-sm text-brand-dark underline underline-offset-2 group-open:hidden">{t.elderPanels.insights.numbers}</span>
                <span className="hidden shrink-0 text-sm text-brand-dark underline underline-offset-2 group-open:inline">{t.elderPanels.insights.hide}</span>
              </summary>
              <p className="mt-1 mb-1 ml-6 text-ink-soft">{serverText(i.detail, i.detail_i18n)}</p>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
