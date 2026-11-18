import { BookHeart, Users } from "lucide-react";
import { NavLink } from "react-router";
import { copy } from "../copy";
import { pressable } from "../ui/motion";

/**
 * "People" (the family photo grid) or "Memories" (the memory book), at the top of "Who is this?"
 * (Round 2 batch 4). Home keeps its 3 buttons; this two-way switch is the screen's navigation.
 */
export function PeopleMemoriesSwitch() {
  const m = copy.memories;
  const item = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-16 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl border-4 px-1.5 text-xl font-bold ${pressable} ${
      isActive ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink hover:border-brand"
    }`;
  return (
    <nav aria-label={m.switchLabel} className="flex gap-3">
      <NavLink to="/patient/who-is-this" end className={item}>
        <Users aria-hidden="true" className="size-6 shrink-0" />
        {m.people}
      </NavLink>
      <NavLink to="/patient/who-is-this/memories" className={item}>
        <BookHeart aria-hidden="true" className="size-6 shrink-0" />
        {m.memories}
      </NavLink>
    </nav>
  );
}
