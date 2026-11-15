import { AlarmClock, Gamepad2, House, ListChecks, Users, VolumeX } from "lucide-react";

/**
 * The patient Home screen, drawn at small scale inside a phone: the same layout the app ships
 * (top bar, greeting, next reminder, three big buttons). An illustration with a sample name,
 * not a screenshot; decorative, described by the hero's label.
 */
export function PhoneMock() {
  return (
    <div className="relative mx-auto w-[13.75rem] rounded-[2.4rem] border-[0.55rem] border-teal-950 bg-teal-950 shadow-[0_30px_60px_-20px_rgb(0_20_22_/_0.55),0_12px_24px_-12px_rgb(0_20_22_/_0.4)] sm:w-[17rem]">
      <div className="absolute top-2 left-1/2 z-10 h-[0.9rem] w-[4.5rem] -translate-x-1/2 rounded-full bg-teal-950" />
      <div className="overflow-hidden rounded-[1.85rem] bg-paper px-3 pt-8 pb-5 text-ink" style={{ fontSize: "0.62rem" }}>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <span className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-ink px-2.5 py-1.5 font-bold">
            <House className="size-[1.1em]" aria-hidden="true" />
            Home
          </span>
          <span className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-ink px-2 py-1.5 font-bold">
            <VolumeX className="size-[1.1em]" aria-hidden="true" />
            Read aloud: Off
          </span>
        </div>
        <p className="mt-3 text-[1.6em] leading-tight font-bold">Hello, Kamala!</p>
        <div className="mt-2.5 flex items-start gap-2 rounded-xl border-2 border-calm bg-calm-soft px-2.5 py-2">
          <AlarmClock className="mt-0.5 size-[1.4em] shrink-0 text-calm" aria-hidden="true" />
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
              <Icon className="size-[1.1em] shrink-0" aria-hidden="true" />
              <span className="flex flex-col items-center leading-tight">
                {label}
                {note && <span className="text-[0.75em] font-normal">{note}</span>}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
