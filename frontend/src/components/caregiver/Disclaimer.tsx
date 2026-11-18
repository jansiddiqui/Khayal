import { Info } from "lucide-react";
import { t } from "../../t";

/** Repeated on the dashboard, under every alert and in the Terms (CLAUDE.md section 11). */
export const NOT_A_MEDICAL_DEVICE = t.elderPage.disclaimer;

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) return <p className="mt-2 text-xs text-ink-muted">{NOT_A_MEDICAL_DEVICE}</p>;
  return (
    <p role="note" className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2 text-ink-soft">
      <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
      {NOT_A_MEDICAL_DEVICE}
    </p>
  );
}
