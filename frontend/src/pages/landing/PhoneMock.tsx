import { AlarmClock, Gamepad2, ListChecks, Users } from "lucide-react";
import { PhoneFrame, TopBar } from "./ProductScreens";

/**
 * The patient Home screen, drawn at small scale inside a phone: the same layout the app ships
 * (top bar, greeting, next reminder, three big buttons). An illustration with a sample name,
 * not a screenshot; decorative, described by the hero's label.
 */
export function PhoneMock() {
  return (
    <PhoneFrame className="sm:w-[17rem]">
      <TopBar />
      <p className="mt-3 text-[1.6em] leading-tight font-bold">Hello, Kamala!</p>
      <div className="mt-2.5 flex items-start gap-2 rounded-xl border-2 border-calm bg-calm-soft px-2.5 py-2">
        <AlarmClock className="mt-0.5 size-[1.4em] shrink-0 text-calm" />
        <span>
          <span className="block font-bold">Next reminder</span>
          <span className="block text-[1.15em] leading-snug">9:00 · Blood pressure tablet</span>
        </span>
      </div>
      <div className="mt-2.5 flex flex-col gap-2">
        {[
          { icon: Gamepad2, label: "Play a game", note: "1 of 3 done today" },
          { icon: ListChecks, label: "Today's reminders" },
          { icon: Users, label: "Who is this?" },
        ].map(({ icon: Icon, label, note }) => (
          <span key={label} className="flex min-h-[3.4em] items-center justify-center gap-2 rounded-xl bg-brand px-2 text-[1.2em] font-bold text-white">
            <Icon className="size-[1.1em] shrink-0" />
            <span className="flex flex-col items-center leading-tight">
              {label}
              {note && <span className="text-[0.75em] font-normal">{note}</span>}
            </span>
          </span>
        ))}
      </div>
    </PhoneFrame>
  );
}
