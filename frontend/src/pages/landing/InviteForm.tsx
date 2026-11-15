import { Send } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState, type FormEvent } from "react";
import { errorStatus, requestInvite, type InviteRole } from "../../api/client";
import { LogoMark } from "../../components/brand/Logo";
import { landing } from "./content";
import { primaryButton } from "./styles";
import { EASE_OUT } from "./motion";

const t = landing.invite;

const field =
  "mt-1.5 block w-full rounded-xl border-2 border-line-strong bg-surface px-4 py-2.5 text-ink placeholder:text-ink-muted " +
  "transition-colors duration-150 hover:border-teal-600 focus:border-teal-700 focus:outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2";
const label = "block font-bold text-ink";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** "Request an invite": stored for the team to review (rate-limited, honeypot against bots). */
export function InviteForm() {
  const id = useId();
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [role, setRole] = useState<InviteRole>("family");
  const [touched, setTouched] = useState(false);
  const thanksRef = useRef<HTMLDivElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setTouched(true);
    if (!form.checkValidity()) {
      setStatus({ kind: "error", message: t.errorInvalid });
      (form.querySelector(":invalid") as HTMLElement | null)?.focus();
      return;
    }
    const data = new FormData(form);
    setStatus({ kind: "sending" });
    try {
      await requestInvite({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        role,
        city: String(data.get("city") ?? ""),
        message: String(data.get("message") ?? "") || undefined,
        consent: true,
        website: String(data.get("website") ?? "") || undefined,
      });
      setStatus({ kind: "sent" });
      requestAnimationFrame(() => thanksRef.current?.focus());
    } catch (err) {
      const code = errorStatus(err);
      setStatus({ kind: "error", message: code === 429 ? t.errorBusy : code === 422 ? t.errorInvalid : t.errorDown });
    }
  }

  const appear = reduce
    ? {}
    : { initial: { opacity: 0, scale: 0.98, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.35, ease: EASE_OUT } };

  return (
    <div className="rounded-[1.6rem] bg-paper p-6 text-ink shadow-[0_30px_60px_-30px_rgb(0_0_0_/_0.6)] sm:p-8">
      <AnimatePresence mode="wait" initial={false}>
        {status.kind === "sent" ? (
          <motion.div key="thanks" {...appear} ref={thanksRef} tabIndex={-1} role="status" className="flex flex-col items-start gap-4 py-6 outline-none">
            <LogoMark size={64} drawIn />
            <h3 className="text-[1.6rem] leading-tight font-bold">{t.thanksTitle}</h3>
            <p className="max-w-[40ch] leading-relaxed text-ink-soft">{t.thanksText}</p>
          </motion.div>
        ) : (
          <motion.form key="form" {...appear} onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`} data-touched={touched || undefined} className="invite-form flex flex-col gap-5">
            <div>
              <h3 id={`${id}-title`} className="text-[1.6rem] leading-tight font-bold">
                {t.title}
              </h3>
              <p className="mt-2 max-w-[48ch] text-ink-soft">{t.intro}</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className={label}>
                {t.name}
                <input name="name" required maxLength={120} autoComplete="name" className={field} />
              </label>
              <label className={label}>
                {t.email}
                <input name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" className={field} />
              </label>
            </div>

            <fieldset>
              <legend className={label}>{t.role}</legend>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {t.roles.map((r) => (
                  <label
                    key={r.value}
                    className="flex min-h-[2.6rem] cursor-pointer items-center gap-2.5 rounded-xl whitespace-nowrap border-2 border-line-strong bg-surface px-3 font-bold transition-colors duration-150 hover:border-teal-600 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                      className="size-4 accent-teal-700 focus:outline-none"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={label}>
              {t.city}
              <input name="city" required maxLength={80} autoComplete="address-level2" className={`${field} sm:max-w-[60%]`} />
            </label>

            <label className={label}>
              {t.message}
              <textarea name="message" rows={3} maxLength={1000} className={`${field} resize-y`} />
            </label>

            {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <label className="flex cursor-pointer items-start gap-3 leading-snug">
              <input name="consent" type="checkbox" required className="mt-1 size-5 shrink-0 accent-teal-700" />
              <span>{t.consent}</span>
            </label>

            {status.kind === "error" && (
              <p role="alert" className="rounded-xl border-2 border-saffron-600 bg-saffron-100 px-4 py-3 font-bold text-saffron-900">
                {status.message}
              </p>
            )}

            <button type="submit" disabled={status.kind === "sending"} className={`${primaryButton} min-h-[2.8rem] w-full px-4 text-[1.05rem] whitespace-nowrap disabled:cursor-wait disabled:opacity-80 sm:w-auto sm:self-start sm:px-7`}>
              {status.kind === "sending" ? (
                t.submitting
              ) : (
                <>
                  <Send className="size-[1em]" aria-hidden="true" />
                  {t.submit}
                </>
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
