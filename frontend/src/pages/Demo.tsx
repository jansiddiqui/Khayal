import { LayoutDashboard, PlayCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { errorStatus, type DemoStart } from "../api/client";
import { useAppConfig } from "../api/useAppConfig";
import { useAuth } from "../auth/AuthContext";
import { BigButton } from "../components/BigButton";
import { copy } from "../copy";

const d = copy.demo;

/**
 * "Try the demo" (public demo only): makes a private demo caregiver with three demo patients,
 * signs in, and shows a pairing code so the visitor can also try the patient side.
 */
export function Demo() {
  const config = useAppConfig();
  const { state, startDemo } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // "Try the demo" on the welcome page comes here with autostart: start at once.
  const autostart = (location.state as { autostart?: boolean } | null)?.autostart === true;
  const [started, setStarted] = useState<DemoStart | null>(null);
  const [busy, setBusy] = useState(autostart);
  const [error, setError] = useState<string | null>(null);
  const kickedOff = useRef(false);

  // Already signed in (and not by this page, which signs in while it starts a demo): nothing to set up.
  if (!started && !busy && state.status === "authenticated") return <Navigate to="/" replace />;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setStarted(await startDemo());
    } catch (err) {
      const status = errorStatus(err);
      setError(status === 429 ? d.tooMany : status === 404 ? d.notAvailable : d.failed);
      setBusy(false);
    }
  }

  function onStart() {
    if (!busy) void run();
  }

  useEffect(() => {
    if (!autostart || kickedOff.current) return; // once, also under React's StrictMode
    kickedOff.current = true;
    navigate(location.pathname, { replace: true, state: null }); // a reload must not start another demo
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart]);

  if (started) {
    const pairAddress = `${window.location.origin}/pair`;
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-8 sm:px-8">
        <h1 className="text-4xl font-bold">{d.readyTitle}</h1>
        <p className="text-xl">{d.patientSide(started.patient_name)}</p>
        <p className="rounded-xl border-2 border-line bg-surface px-4 py-3 text-xl break-all">{pairAddress}</p>
        <div className="rounded-2xl border-4 border-brand bg-brand-soft p-4 text-center">
          <p className="text-xl font-semibold">{d.codeLabel}</p>
          <p className="mt-1 font-mono text-5xl font-bold tracking-[0.2em]" aria-label={started.pairing.code.split("").join(" ")}>
            {started.pairing.code}
          </p>
        </div>
        <p className="text-xl text-ink-soft">{d.codeExpires}</p>
        <BigButton to="/caregiver" label={d.toDashboard} icon={<LayoutDashboard />} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-8 sm:px-8">
      <h1 className="text-4xl font-bold">{d.title}</h1>
      <p className="text-xl">{d.intro}</p>
      <p className="text-xl">{d.deleted(config?.demo_account_days ?? 7)}</p>
      {error && (
        <p role="alert" className="rounded-xl border-4 border-accent bg-accent-soft p-4 text-xl">
          {error}
        </p>
      )}
      <BigButton onClick={onStart} label={busy ? d.starting : d.start} icon={<PlayCircle />} />
    </main>
  );
}
