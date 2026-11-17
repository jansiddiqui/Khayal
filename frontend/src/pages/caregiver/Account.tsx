import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { changePassword, deleteMyAccount, errorStatus, exportMyData, myConsents, PASSWORD_MIN } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { Button } from "../../ui/Button";

const input = "rounded-md border border-line-strong bg-surface px-3 py-2";
const card = "flex flex-col gap-3 rounded-lg border border-line bg-surface p-4";
const KIND: Record<string, string> = {
  processing: "Privacy policy and terms",
  elder_on_behalf: "Adding a person you look after",
  photos: "Family photos",
  voice: "Weekly voice task",
};
const BASIS: Record<string, string> = { elder_agreed: "they agreed", legal_authority: "legally authorised" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function ChangePassword() {
  const { adopt } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: (response) => {
      adopt(response);
      setCurrent("");
      setNext("");
    },
  });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    change.mutate();
  }
  return (
    <form onSubmit={onSubmit} className={card} aria-labelledby="pw-title">
      <h2 id="pw-title" className="flex items-center gap-2 text-lg font-semibold">
        <KeyRound className="size-5 text-brand" aria-hidden="true" />
        Change password
      </h2>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Current password</span>
        <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">New password (at least {PASSWORD_MIN} characters)</span>
        <input type="password" required minLength={PASSWORD_MIN} maxLength={72} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
      </label>
      <p className="text-ink-muted">Changing it signs you out everywhere else.</p>
      <Button type="submit" variant="primary" loading={change.isPending} successLabel={change.isSuccess && "Password changed"} className="self-start">
        Change password
      </Button>
      {change.isError && (
        <p role="alert" className="text-danger">
          {errorStatus(change.error) === 403 ? "The current password is not right." : `Use at least ${PASSWORD_MIN} characters, then try again.`}
        </p>
      )}
      {change.isSuccess && <p className="text-calm">Password changed. Other devices are signed out.</p>}
    </form>
  );
}

function ExportData() {
  const download = useMutation({
    mutationFn: exportMyData,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `khayal-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  return (
    <section className={card} aria-labelledby="export-title">
      <h2 id="export-title" className="flex items-center gap-2 text-lg font-semibold">
        <Download className="size-5 text-brand" aria-hidden="true" />
        Export my data
      </h2>
      <p className="text-ink-muted">
        A zip with everything Khayal holds about you and the people you look after: your account and consents, their games, reminders, alerts and devices (as JSON), and their photos and recordings.
      </p>
      <Button onClick={() => download.mutate()} loading={download.isPending} successLabel={download.isSuccess && "Downloaded"} className="self-start">
        Download my data
      </Button>
      {download.isError && <p role="alert" className="text-danger">Could not prepare the export. Try again.</p>}
    </section>
  );
}

function Consents() {
  const consents = useQuery({ queryKey: ["myConsents"], queryFn: myConsents });
  return (
    <section className={card} aria-labelledby="consent-title">
      <h2 id="consent-title" className="text-lg font-semibold">Your consents</h2>
      <p className="text-ink-muted">
        Photos and the voice task can be turned off on each person's page (that deletes them). To withdraw everything, delete your account.{" "}
        <Link to="/privacy" className="underline">Privacy policy</Link>
      </p>
      {consents.isSuccess && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {consents.data.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-x-3 px-3 py-2">
              <span className="font-medium">{KIND[c.kind] ?? c.kind}</span>
              {c.basis && <span className="text-ink-soft">({BASIS[c.basis] ?? c.basis})</span>}
              <span className="text-ink-muted">
                given {day(c.granted_at)} · policy {c.policy_version}
                {c.withdrawn_at && ` · withdrawn ${day(c.withdrawn_at)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeleteAccount() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const remove = useMutation({
    mutationFn: () => deleteMyAccount(password),
    onSuccess: () => {
      logout();
      navigate("/", { replace: true });
    },
  });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (typed === "DELETE") remove.mutate();
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-danger bg-surface p-4" aria-labelledby="delete-title">
      <h2 id="delete-title" className="flex items-center gap-2 text-lg font-semibold text-danger">
        <Trash2 className="size-5" aria-hidden="true" />
        Delete my account
      </h2>
      <p>
        This removes your account and, for every person you look after whom no other family member looks after, their account with all games, reminders, photos and recordings. People shared with another family member stay with them. This cannot be undone; download your data first if you want a copy.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Type DELETE to confirm</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Your password</span>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={input} />
      </label>
      <Button type="submit" variant="danger" disabled={typed !== "DELETE" || !password} loading={remove.isPending} className="self-start">
        Delete my account
      </Button>
      {remove.isError && <p role="alert" className="text-danger">{errorStatus(remove.error) === 403 ? "The password is not right." : "Could not delete the account. Try again."}</p>}
    </form>
  );
}

export function CaregiverAccount() {
  const { state } = useAuth();
  return (
    <CaregiverLayout title="Account">
      {state.status === "authenticated" && (
        <p className="mb-4 text-ink-soft">
          Signed in as {state.user.name} ({state.user.email})
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChangePassword />
        <ExportData />
        <Consents />
        <DeleteAccount />
      </div>
    </CaregiverLayout>
  );
}
