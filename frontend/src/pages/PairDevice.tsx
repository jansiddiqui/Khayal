import { Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { errorStatus } from "../api/client";
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
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const p = copy.pair;

  if (state.status === "authenticated") return <Navigate to={homePathFor(state.user)} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await pair(code);
      navigate(homePathFor(user), { replace: true });
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
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            required
            className="min-h-20 rounded-2xl border-4 border-line-strong bg-surface px-4 text-center font-mono text-5xl tracking-[0.3em] text-ink"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl border-4 border-accent bg-accent-soft p-4 text-xl">
            {error}
          </p>
        )}
        <BigButton type="submit" label={submitting ? p.submitting : p.submit} icon={<Smartphone />} />
      </form>
      <Link to="/login" className="text-xl text-brand-dark underline">
        {p.caregiverLink}
      </Link>
    </main>
  );
}
