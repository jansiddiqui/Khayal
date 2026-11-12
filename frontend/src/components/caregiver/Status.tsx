import { CircleArrowDown, CircleCheck, CircleDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import type { IndexStatus } from "../../api/client";

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

/**
 * One scale for every game and for the overall index (z of the last 5 sessions against the
 * patient's own baseline): Stable at −0.5 or above, Watch below −0.5, Declining below −1.5.
 */
export const STATUS_SCALE_TEXT = "Stable at −0.5 or above, Watch below −0.5, Declining below −1.5.";

const STATUS: Record<IndexStatus, StatusLook> = {
  stable: { label: "Stable", color: STATUS_COLORS.good, icon: CircleCheck },
  watch: { label: "Watch", color: STATUS_COLORS.warning, icon: TriangleAlert },
  declining: { label: "Declining", color: STATUS_COLORS.critical, icon: CircleArrowDown },
  insufficient: { label: "Learning", color: STATUS_COLORS.none, icon: CircleDashed },
};

const RANK: Record<IndexStatus, number> = { stable: 0, watch: 1, declining: 2, insufficient: -1 };

/** "Overall: Watch" or "This game: Stable", with a shape and a colour beside the words. */
export function StatusBadge({ status, scope }: { status: IndexStatus; scope?: "Overall" | "This game" }) {
  const { label, color, icon: Icon } = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft">
      <Icon aria-hidden="true" style={{ color }} className="size-4 shrink-0" strokeWidth={2.5} />
      <span>
        {scope && <span className="text-ink-muted">{scope}: </span>}
        <span className="font-medium text-ink">{label}</span>
      </span>
    </span>
  );
}

/** One line saying why a game's status differs from the overall one, or null when they agree. */
export function statusDifference(game: IndexStatus, overall: IndexStatus): string | null {
  if (game === overall || game === "insufficient" || overall === "insufficient") return null;
  return RANK[game] < RANK[overall]
    ? `This game is steadier than the overall status (${STATUS[overall].label}), which averages all games.`
    : `This game is lower than the overall status (${STATUS[overall].label}), which averages all games.`;
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
