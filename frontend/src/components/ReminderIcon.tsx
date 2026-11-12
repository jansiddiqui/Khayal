import { Bell, Pill, Stethoscope, Utensils, type LucideIcon } from "lucide-react";
import type { ReminderType } from "../api/client";

const ICONS: Record<ReminderType, LucideIcon> = {
  medicine: Pill,
  meal: Utensils,
  appointment: Stethoscope,
  other: Bell,
};

/** The icon for a reminder type. Always shown next to the reminder's words. */
export function ReminderIcon({ type, className }: { type: ReminderType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon aria-hidden="true" className={className} />;
}
