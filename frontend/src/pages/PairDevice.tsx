import { ArrowRight, CircleCheck, Smartphone } from "lucide-react";
import { motion } from "motion/react";
import type { User } from "../api/client";
import { calm, DURATION, useLessMotion } from "../ui/motion";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { errorStatus } from "../api/client";
import { useAppConfig } from "../api/useAppConfig";
import { homePathFor, useAuth } from "../auth/AuthContext";
import { BigButton } from "../components/BigButton";
import { copy } from "../copy";

/**
 * The patient's start page when the device is not signed in (CLAUDE.md section 4): the
 * caregiver shows a 6-digit code on their patient page; it is typed here once and the
 * device stays signed in for 90 days. No email or password to remember.
 */
export function PairDevice() {
  const { state, pair } = useAuth();
  const config = useAppConfig();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paired, setPaired] = useState<User | null>(null);
  const less = useLessMotion();
  const p = copy.pair;

  if (paired) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-8 sm:px-8">
        <motion.div
          initial={less ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={calm(DURATION.slow)}
          className="flex flex-col gap-4 rounded-2xl border-4 border-calm bg-calm-soft p-6"
          role="status"
        >
          <h1 className="flex items-center gap-3 text-4xl font-bold">
            <CircleCheck aria-hidden="true" className="size-10 shrink-0 text-calm" />
            {p.readyTitle}
          </h1>
          <p className="text-2xl">{p.ready(paired.name.split(" ")[0] ?? paired.name)}</p>
        </motion.div>
        <BigButton label={p.readyStart} icon={<ArrowRight />} onClick={() => navigate(homePathFor(paired), { replace: true })} />
      </main>
    );
  }
  if (state.status === "authenticated") return <Navigate to={homePathFor(state.user)} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setPaired(await pair(code));
    } catch (err) {
      const status = errorStatus(err);
      setError(status === 429 ? p.tooMany : status === 400 || status === 422 ? p.failed : p.unavailable);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-8 sm:px-8">
      <h1 className="flex items-center gap-3 text-4xl font-bold">
        <Smartphone aria-hidden="true" className="size-10 shrink-0" />
        {p.title}
      </h1>
      <p className="text-2xl">{p.intro}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <label className="flex flex-col gap-2 text-xl font-semibold">
          {p.codeLabel}
          <input
            aria-describedby="code-typed"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            required
            className="min-h-20 rounded-2xl border-4 border-line-strong bg-surface px-4 text-center font-mono text-5xl tracking-[0.3em] text-ink transition-colors focus:border-brand"
          />
        </label>
        <p id="code-typed" className="-mt-4 text-xl text-ink-soft" aria-live="polite">
          {p.typed(code.length)}
        </p>
        {error && (
          <p role="alert" className="rounded-xl border-4 border-accent bg-accent-soft p-4 text-xl">
            {error}
          </p>
        )}
        <BigButton type="submit" label={submitting ? p.submitting : p.submit} icon={<Smartphone />} busy={submitting} />
      </form>
      <Link to="/login" className="text-xl text-brand-dark underline">
        {p.caregiverLink}
      </Link>
      {config?.demo_mode && (
        <Link to="/demo" className="text-xl text-brand-dark underline">
          {copy.demo.pairLink}
        </Link>
      )}
    </main>
  );
}
