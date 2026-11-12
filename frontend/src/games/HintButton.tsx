import { Eye } from "lucide-react";
import { BigButton } from "../components/BigButton";
import { copy } from "../copy";

/** One "Show me again" per round; it disappears once used. */
export function HintButton({ used, available, onUse }: { used: boolean; available: boolean; onUse: () => void }) {
  if (used || !available) return null;
  return <BigButton label={copy.games.showMeAgain} icon={<Eye />} variant="secondary" size="compact" onClick={onUse} />;
}
