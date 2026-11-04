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

const INDEX_STATUS: Record<IndexStatus, { label: string; color: string; icon: string }> = {
  stable: { label: "Stable", color: STATUS_COLORS.good, icon: "●" },
  watch: { label: "Watch", color: STATUS_COLORS.warning, icon: "▲" },
  declining: { label: "Declining", color: STATUS_COLORS.critical, icon: "▼" },
  insufficient: { label: "Not enough data", color: STATUS_COLORS.none, icon: "○" },
};

const GAME_STATUS: Record<DeclineStatus, { label: string; color: string; icon: string }> = {
  stable: { label: "Stable", color: STATUS_COLORS.good, icon: "●" },
  warning: { label: "Warning", color: STATUS_COLORS.warning, icon: "▲" },
  critical: { label: "Critical", color: STATUS_COLORS.critical, icon: "▼" },
  insufficient: { label: "No baseline yet", color: STATUS_COLORS.none, icon: "○" },
};

function Badge({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-800">
      <span aria-hidden="true" style={{ color }} className="text-base leading-none">
        {icon}
      </span>
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
