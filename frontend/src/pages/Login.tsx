import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { errorStatus } from "../api/client";
import { homePathFor, useAuth } from "../auth/AuthContext";
import { BigButton } from "../components/BigButton";
import { TextField } from "../components/TextField";
import { copy } from "../copy";

export function Login() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "authenticated") return <Navigate to={homePathFor(state.user)} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith(homePathFor(user)) ? from : homePathFor(user), { replace: true });
    } catch (err) {
      setError(errorStatus(err) === 401 ? copy.login.failed : copy.login.unavailable);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-8 sm:px-8">
      <h1 className="text-4xl font-bold">{copy.login.title}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <TextField label={copy.login.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label={copy.login.password}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-xl border-4 border-amber-500 bg-amber-50 p-4 text-xl">
            {error}
          </p>
        )}
        <BigButton type="submit" label={submitting ? copy.login.submitting : copy.login.submit} icon={<LogIn />} />
      </form>
      <Link to="/register" className="text-xl text-brand-dark underline">
        {copy.login.toRegister}
      </Link>
    </main>
  );
}
