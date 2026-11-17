import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { copy } from "../copy";
import { useFeedback } from "../ui/feedback";
import { calm, DURATION, pressable, useLessMotion } from "../ui/motion";
import { BigButton } from "./BigButton";

/**
 * The small settings sheet next to Read aloud: gentle vibration and soft sound, each one big
 * switch with its state in words. At most 3 controls (two switches and Done), CLAUDE.md section 4.
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, set, canVibrate, cue } = useFeedback();
  const less = useLessMotion();
  const ref = useRef<HTMLDialogElement>(null);
  const s = copy.settings;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // a tap on the dimmed background closes it
      }}
      className="mx-auto mt-auto mb-0 w-full max-w-xl bg-transparent p-0 backdrop:bg-[rgb(16_35_37/0.4)] sm:mb-auto"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={less ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={calm(DURATION.page)}
            className="flex flex-col gap-4 rounded-t-3xl border-4 border-b-0 border-ink bg-paper p-5 text-ink sm:rounded-3xl sm:border-b-4"
          >
            <h2 id="settings-title" className="text-3xl font-bold">
              {s.title}
            </h2>
            <p className="text-2xl">{s.intro}</p>
            {canVibrate ? (
              <Switch
                label={s.vibration}
                on={settings.vibration}
                onToggle={() => {
                  set({ vibration: !settings.vibration });
                  if (!settings.vibration && navigator.vibrate) navigator.vibrate(12);
                }}
              />
            ) : (
              <p className="text-xl text-ink-soft">{s.noVibration}</p>
            )}
            <Switch
              label={s.sound}
              on={settings.sound}
              onToggle={() => {
                set({ sound: !settings.sound });
                if (!settings.sound) setTimeout(() => cue("success"), 0);
              }}
            />
            <BigButton label={s.done} icon={<Check />} onClick={onClose} />
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}

function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`flex min-h-16 items-center justify-between gap-4 rounded-2xl border-4 px-4 py-2 text-2xl font-bold ${
        on ? "border-brand bg-brand-soft" : "border-line-strong bg-surface"
      } ${pressable}`}
    >
      <span>{label}</span>
      <span className="flex items-center gap-3">
        <span className="text-xl">{on ? copy.settings.on : copy.settings.off}</span>
        <span
          aria-hidden="true"
          className={`relative h-9 w-16 rounded-full border-2 transition-colors duration-200 ${on ? "border-brand bg-brand" : "border-line-strong bg-sunken"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-7 rounded-full bg-surface shadow-lift transition-transform duration-200 ease-calm ${on ? "translate-x-7" : "translate-x-0"}`}
          />
        </span>
      </span>
    </button>
  );
}
