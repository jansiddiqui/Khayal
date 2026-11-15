import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { acceptShare, checkInvite, errorStatus, PASSWORD_MIN, resetPassword } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Logo } from "../components/brand/Logo";

const input = "rounded-md border border-line-strong bg-surface px-3 py-2";
const primary = "rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60";

/** A quiet page for invite, share and reset links (caregiver style: Inter, near-white). */
function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="caregiver min-h-screen bg-desk text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-xl items-center px-4 py-3">
          <Link to="/" aria-label="Khayal, home">
            <Logo size={30} />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  );
}

function Invalid() {
  return (
    <Frame title="This link is not valid any more">
      <p>Invite and share links work once and for 14 days. Please ask the person who sent it for a new one.</p>
      <p>
        New to Khayal? <Link to="/" className="text-brand-dark underline">Request an invite</Link>. Already have an account?{" "}
        <Link to="/login" className="text-brand-dark underline">Sign in</Link>.
      </p>
    </Frame>
  );
}

/** Create a caregiver account with an invite link, or with a family share link (which also joins the elder). */
function SignUp({ token, elderName, intro }: { token?: string; elderName: string | null; intro?: string }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const signUp = useMutation({
    mutationFn: () => register({ name, email, password, consent: true, ...(token ? { invite_token: token } : {}) }),
    onSuccess: () => navigate("/caregiver", { replace: true }),
  });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (consent) signUp.mutate();
  }
  const status = errorStatus(signUp.error);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <p className="text-ink-soft">
        {intro ?? (elderName ? `Create your account to look after ${elderName} together.` : "You are invited to the Khayal pilot. Create your account.")}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Your name</span>
        <input required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Password (at least {PASSWORD_MIN} characters)</span>
        <input type="password" required minLength={PASSWORD_MIN} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-brand" />
        <span>
          I agree that Khayal processes my information as described in the{" "}
          <Link to="/privacy" target="_blank" className="text-brand-dark underline">privacy policy</Link>, and I accept the{" "}
          <Link to="/terms" target="_blank" className="text-brand-dark underline">terms</Link>.
        </span>
      </label>
      <button type="submit" disabled={!consent || signUp.isPending} className={primary + " self-start"}>
        {signUp.isPending ? "Creating…" : "Create account"}
      </button>
      {signUp.isError && (
        <p role="alert" className="text-danger">
          {status === 409
            ? "This email already has an account. Sign in, then open the link again."
            : status === 403
              ? token
                ? "This link is not valid any more. Please ask for a new one."
                : "This email is not on the admin list (KHAYAL_ADMIN_EMAILS)."
              : `Please check the details (password at least ${PASSWORD_MIN} characters) and try again.`}
        </p>
      )}
      <p className="text-ink-muted">
        Already have an account? <Link to="/login" state={{ from: elderName ? `/share/${token}` : undefined }} className="text-brand-dark underline">Sign in</Link>
        {elderName ? " and come back to this link." : "."}
      </p>
    </form>
  );
}

function JoinElder({ token, elderName }: { token: string; elderName: string }) {
  const navigate = useNavigate();
  const join = useMutation({ mutationFn: () => acceptShare(token), onSuccess: (p) => navigate(`/caregiver/patients/${p.id}`, { replace: true }) });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <p>You have been invited to look after {elderName} together with their family.</p>
      <button type="button" onClick={() => join.mutate()} disabled={join.isPending} className={primary + " self-start"}>
        Join {elderName}
      </button>
      {join.isError && <p role="alert" className="text-danger">This link is not valid any more. Please ask for a new one.</p>}
    </div>
  );
}

/** /join/:token (invite to the pilot) and /share/:token (join an elder's family). */
export function JoinPage() {
  const { token = "" } = useParams();
  const { state } = useAuth();
  const check = useQuery({ queryKey: ["invite", token], queryFn: () => checkInvite(token), retry: false });

  if (check.isPending || state.status === "loading") return <Frame title="Just a moment…">{null}</Frame>;
  if (check.isError) return <Invalid />;
  const { kind, elder_name } = check.data;

  if (state.status === "authenticated") {
    if (kind === "share" && state.user.role === "caregiver") {
      return (
        <Frame title={`Join ${elder_name ?? "the family"}`}>
          <JoinElder token={token} elderName={elder_name ?? "them"} />
        </Frame>
      );
    }
    return <Navigate to="/" replace />;
  }
  return (
    <Frame title={kind === "share" ? `Join ${elder_name ?? "the family"} on Khayal` : "Welcome to the Khayal pilot"}>
      <SignUp token={token} elderName={kind === "share" ? elder_name ?? "them" : null} />
    </Frame>
  );
}

/** /reset/:token: an admin-made password reset link. */
export function ResetPasswordPage() {
  const { token = "" } = useParams();
  const { adopt } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const reset = useMutation({
    mutationFn: () => resetPassword(token, password),
    onSuccess: (response) => {
      adopt(response);
      navigate("/caregiver", { replace: true });
    },
  });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    reset.mutate();
  }
  return (
    <Frame title="Choose a new password">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">New password (at least {PASSWORD_MIN} characters)</span>
          <input type="password" required minLength={PASSWORD_MIN} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </label>
        <p className="text-ink-muted">This signs you out on every other device.</p>
        <button type="submit" disabled={reset.isPending} className={primary + " self-start"}>
          Save new password
        </button>
        {reset.isError && (
          <p role="alert" className="text-danger">
            {errorStatus(reset.error) === 404 ? "This reset link is not valid any more. Please ask for a new one." : `Use at least ${PASSWORD_MIN} characters, then try again.`}
          </p>
        )}
      </form>
    </Frame>
  );
}

/** /setup: the first admin creates their account without an invite (only emails in KHAYAL_ADMIN_EMAILS). */
export function AdminSetupPage() {
  const { state } = useAuth();
  if (state.status === "authenticated") return <Navigate to="/" replace />;
  return (
    <Frame title="Set up an admin account">
      <SignUp elderName={null} intro="Only for the pilot's admins: this works only with an email listed in KHAYAL_ADMIN_EMAILS on the server. Everyone else needs an invite link." />
    </Frame>
  );
}

/** /register: Khayal is invite-only. */
export function InviteOnlyPage() {
  return (
    <Frame title="Khayal is invite-only for now">
      <p>We are opening slowly, to a small group of families, doctors and care homes, so we can look after everyone well.</p>
      <p>
        <Link to="/#invite" className="text-brand-dark underline">Request an invite</Link>. If someone sent you an invite or share link, open that link to create your account.
      </p>
      <p>
        Already have an account? <Link to="/login" className="text-brand-dark underline">Sign in</Link>.
      </p>
    </Frame>
  );
}
