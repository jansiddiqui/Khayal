import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { errorStatus, type Role } from "../api/client";
import { homePathFor, useAuth } from "../auth/AuthContext";
import { BigButton } from "../components/BigButton";
import { TextField } from "../components/TextField";
import { copy } from "../copy";

const roleOptions: { value: Role; label: string }[] = [
  { value: "patient", label: copy.register.rolePatient },
  { value: "caregiver", label: copy.register.roleCaregiver },
];

export function Register() {
  const { state, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("patient");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "authenticated") return <Navigate to={homePathFor(state.user)} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await register({ name, email, password, role });
      navigate(homePathFor(user), { replace: true });
    } catch (err) {
      setError(errorStatus(err) === 409 ? copy.register.emailTaken : copy.register.invalid);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 pt-8 pb-4 sm:px-8 sm:py-8">
      <h1 className="text-4xl font-bold">{copy.register.title}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        {/* Who the account is for comes first: it is the one choice that is easy to miss. */}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-xl font-semibold">{copy.register.roleLegend}</legend>
          {roleOptions.map((option) => (
            <label
              key={option.value}
              className="flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border-4 border-gray-500 bg-white px-4 text-xl has-[:checked]:border-brand"
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                className="h-6 w-6"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <TextField label={copy.register.name} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label={copy.register.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label={copy.register.password}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-xl border-4 border-amber-500 bg-amber-50 p-4 text-xl">
            {error}
          </p>
        )}
        {/* Pinned to the bottom of the screen so "Create account" is always visible on a phone. */}
        <div className="sticky bottom-0 -mx-4 border-t-2 border-gray-300 bg-paper px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0">
          <BigButton type="submit" label={submitting ? copy.register.submitting : copy.register.submit} icon="✅" />
        </div>
      </form>
      <Link to="/login" className="text-xl text-brand-dark underline">
        {copy.register.toLogin}
      </Link>
    </main>
  );
}
