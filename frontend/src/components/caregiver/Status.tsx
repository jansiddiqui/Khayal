import { CircleArrowDown, CircleCheck, CircleDashed, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { DeclineStatus, IndexStatus } from "../../api/client";

/**
 * Reserved status colours (dataviz reference palette) - always shown with an icon and a
 * word, never colour alone.
 */
export const STATUS_COLORS = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
  none: "#9a9890",
} as const;

interface StatusLook {
  label: string;
  color: string;
  icon: LucideIcon;
}

const INDEX_STATUS: Record<IndexStatus, StatusLook> = {
  stable: { label: "Stable", color: STATUS_COLORS.good, icon: CircleCheck },
  watch: { label: "Watch", color: STATUS_COLORS.warning, icon: TriangleAlert },
  declining: { label: "Declining", color: STATUS_COLORS.critical, icon: CircleArrowDown },
  insufficient: { label: "Not enough data", color: STATUS_COLORS.none, icon: CircleDashed },
};

const GAME_STATUS: Record<DeclineStatus, StatusLook> = {
  stable: { label: "Stable", color: STATUS_COLORS.good, icon: CircleCheck },
  warning: { label: "Warning", color: STATUS_COLORS.warning, icon: TriangleAlert },
  critical: { label: "Critical", color: STATUS_COLORS.critical, icon: OctagonAlert },
  insufficient: { label: "Learning", color: STATUS_COLORS.none, icon: CircleDashed },
};

function Badge({ label, color, icon: Icon }: StatusLook) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-800">
      <Icon aria-hidden="true" style={{ color }} className="size-4 shrink-0" strokeWidth={2.5} />
      <span>{label}</span>
    </span>
  );
}

export function IndexStatusBadge({ status }: { status: IndexStatus }) {
  return <Badge {...INDEX_STATUS[status]} />;
}

export function GameStatusBadge({ status }: { status: DeclineStatus }) {
  return <Badge {...GAME_STATUS[status]} />;
}

/** "−1.2" with a real minus sign. */
export function formatZ(z: number): string {
  return z.toFixed(1).replace("-", "−");
}

/** "z = −1.2", or "z ≤ −4.0" when the server clipped it. */
export function formatGameZ(z: number, zRaw: number | null): string {
  const clipped = zRaw !== null && Math.abs(zRaw) > Math.abs(z);
  return `z ${clipped ? (z < 0 ? "≤" : "≥") : "="} ${formatZ(z)}`;
}
