import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { admin, errorStatus, linkUrl, type SecretLink } from "../../api/client";
import { LoadError } from "../../components/caregiver/LoadError";
import { CopyLink } from "../../components/caregiver/PrivacyPanel";
import { CaregiverLayout } from "../../components/CaregiverLayout";

const card = "flex flex-col gap-3 rounded-lg border border-line bg-surface p-4";
const button = "rounded-md border border-line-strong bg-surface px-3 py-1 hover:bg-sunken disabled:opacity-60";
const primary = "rounded-md bg-brand px-3 py-1 font-medium text-white hover:bg-brand-dark disabled:opacity-60";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const ROLE: Record<string, string> = { family: "Family member", doctor: "Doctor", care_home: "Care home" };
const STATE: Record<string, string> = { open: "Open", used: "Used", revoked: "Revoked", expired: "Expired" };

type Made = { label: string; url: string } | null;

function Requests({ onLink }: { onLink: (made: Made) => void }) {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ["admin", "requests"], queryFn: admin.requests });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };
  const approve = useMutation({
    mutationFn: (id: number) => admin.approve(id),
    onSuccess: (link: SecretLink, id) => {
      const r = requests.data?.find((x) => x.id === id);
      onLink({ label: `Invite link for ${r?.name ?? "them"} (${r?.email ?? ""})`, url: linkUrl("join", link.token) });
      refresh();
    },
  });
  const reject = useMutation({ mutationFn: (id: number) => admin.reject(id), onSuccess: refresh });
  return (
    <section className={card} aria-labelledby="requests-title">
      <h2 id="requests-title" className="text-lg font-semibold">Invite requests</h2>
      {requests.isPending && <p className="text-ink-muted">Loading…</p>}
      {requests.isError && <LoadError message="Could not load the requests." onRetry={() => void requests.refetch()} />}
      {requests.isSuccess && requests.data.length === 0 && <p className="text-ink-muted">No requests yet.</p>}
      {requests.isSuccess && requests.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {requests.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-semibold">{r.name}</span> · {r.email} · {ROLE[r.role]} · {r.city}
                </p>
                {r.message && <p className="mt-1 text-ink-soft">“{r.message}”</p>}
                <p className="mt-1 text-ink-muted">
                  {day(r.created_at)} · {r.status === "new" ? "New" : r.status === "invited" ? "Invited" : "Rejected"}
                </p>
              </div>
              {r.status === "new" && (
                <div className="flex gap-2">
                  <button type="button" className={primary} disabled={approve.isPending} onClick={() => approve.mutate(r.id)}>
                    Approve
                  </button>
                  <button type="button" className={button} disabled={reject.isPending} onClick={() => reject.mutate(r.id)}>
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Invites({ onLink }: { onLink: (made: Made) => void }) {
  const queryClient = useQueryClient();
  const invites = useQuery({ queryKey: ["admin", "invites"], queryFn: admin.invites });
  const [note, setNote] = useState("");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin"] });
  const make = useMutation({
    mutationFn: () => admin.invite(note),
    onSuccess: (link) => {
      onLink({ label: `Invite link for ${note}`, url: linkUrl("join", link.token) });
      setNote("");
      refresh();
    },
  });
  const revoke = useMutation({ mutationFn: (id: number) => admin.revokeInvite(id), onSuccess: refresh });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    make.mutate();
  }
  return (
    <section className={card} aria-labelledby="invites-title">
      <h2 id="invites-title" className="text-lg font-semibold">Invite links</h2>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-ink-soft">Invite someone directly (who is it for?)</span>
          <input required maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-md border border-line-strong px-3 py-2" />
        </label>
        <button type="submit" className={primary} disabled={make.isPending}>
          Create invite link
        </button>
      </form>
      {invites.isSuccess && invites.data.length > 0 && (
        <table className="w-full text-left">
          <thead className="border-b border-line text-ink-muted">
            <tr>
              <th className="py-1.5 pr-3 font-medium">For</th>
              <th className="py-1.5 pr-3 font-medium">Made</th>
              <th className="py-1.5 pr-3 font-medium">State</th>
              <th className="py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {invites.data.map((i) => (
              <tr key={i.id} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3">{i.note}</td>
                <td className="py-1.5 pr-3 text-ink-soft">{day(i.created_at)}</td>
                <td className="py-1.5 pr-3">
                  {STATE[i.state]}
                  {i.used_by_email && <span className="text-ink-muted"> · {i.used_by_email}</span>}
                  {i.state === "open" && <span className="text-ink-muted"> · until {day(i.expires_at)}</span>}
                </td>
                <td className="py-1.5 text-right">
                  {i.state === "open" && (
                    <button type="button" className={button} disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Users({ onLink }: { onLink: (made: Made) => void }) {
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: admin.users });
  const reset = useMutation({
    mutationFn: (id: number) => admin.resetLink(id),
    onSuccess: (link, id) => {
      const u = users.data?.find((x) => x.id === id);
      onLink({ label: `Password reset link for ${u?.email ?? "them"} (48 hours)`, url: linkUrl("reset", link.token) });
    },
  });
  return (
    <section className={card} aria-labelledby="users-title">
      <h2 id="users-title" className="text-lg font-semibold">Users</h2>
      {users.isSuccess && (
        <table className="w-full text-left">
          <thead className="border-b border-line text-ink-muted">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Name</th>
              <th className="py-1.5 pr-3 font-medium">Account</th>
              <th className="py-1.5 pr-3 font-medium">Joined</th>
              <th className="py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3">
                  {u.name}
                  {u.is_admin && <span className="ml-2 rounded bg-brand-soft px-1.5 text-xs text-brand-dark">admin</span>}
                  {u.is_demo && <span className="ml-2 rounded bg-sunken px-1.5 text-xs">demo</span>}
                </td>
                <td className="py-1.5 pr-3 text-ink-soft">
                  {u.role === "caregiver" ? `${u.email} · looks after ${u.elders}` : "Elder (pairs a device)"}
                </td>
                <td className="py-1.5 pr-3 text-ink-soft">{day(u.created_at)}</td>
                <td className="py-1.5 text-right">
                  {u.role === "caregiver" && (
                    <button type="button" className={button} disabled={reset.isPending} onClick={() => reset.mutate(u.id)}>
                      Reset link
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DemoAccounts() {
  const queryClient = useQueryClient();
  const count = useQuery({ queryKey: ["admin", "demo"], queryFn: admin.demoCount });
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: (n: number) => admin.removeDemo(n),
    onSuccess: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
  const n = count.data ?? 0;
  return (
    <section className={card} aria-labelledby="demo-title">
      <h2 id="demo-title" className="text-lg font-semibold">Demo accounts</h2>
      <p className="text-ink-muted">Accounts made while the public demo was on (“Try the demo” and sign-ups then). With demo mode off they no longer expire on their own.</p>
      {count.isSuccess && <p>{n === 0 ? "There are no demo accounts." : `${n} demo account${n === 1 ? "" : "s"} (caregivers and elders).`}</p>}
      {n > 0 && !confirming && (
        <button type="button" className={button + " self-start"} onClick={() => setConfirming(true)}>
          Remove all demo accounts…
        </button>
      )}
      {confirming && (
        <div role="alertdialog" aria-label="Remove all demo accounts" className="flex flex-wrap items-center gap-3 rounded-md border border-danger bg-danger-soft p-3">
          <p className="min-w-0 flex-1">This deletes {n} demo accounts with all their data and files. Real accounts are not touched. This cannot be undone.</p>
          <button type="button" className="rounded-md bg-danger px-3 py-1 font-medium text-white" disabled={remove.isPending} onClick={() => remove.mutate(n)}>
            Remove {n} demo accounts
          </button>
          <button type="button" className={button} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {remove.isSuccess && <p className="text-calm">Removed {remove.data} demo accounts.</p>}
      {remove.isError && <p role="alert" className="text-danger">The number changed in the meantime; check again.</p>}
    </section>
  );
}

/** Admin → Download full backup: the free database has no backups of its own (docs/BACKUP-RESTORE.md). */
function Backup() {
  const download = useMutation({
    mutationFn: admin.backup,
    onSuccess: ({ blob, fileName }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  return (
    <section className={card} aria-labelledby="backup-title">
      <h2 id="backup-title" className="flex items-center gap-2 text-lg font-semibold">
        <Download className="size-5 text-brand" aria-hidden="true" />
        Full backup
      </h2>
      <p className="text-ink-muted">
        Every table, photo and recording in one zip. Download it every week, save it in <code>{"data\\backups\\voroa\\"}</code> and keep the newest 8. It holds personal data: keep it on your own computer only.
      </p>
      <button type="button" className={primary + " self-start"} disabled={download.isPending} onClick={() => download.mutate()}>
        {download.isPending ? "Preparing the backup…" : "Download full backup"}
      </button>
      {download.isSuccess && <p className="text-calm">Saved as {download.data.fileName}.</p>}
      {download.isError && (
        <p role="alert" className="text-danger">
          {errorStatus(download.error) === 429
            ? "A backup was made in the last 10 minutes. Try again a little later."
            : "Could not make the backup. Try again."}
        </p>
      )}
    </section>
  );
}

/** The pilot's admin page (KHAYAL_ADMIN_EMAILS): requests, invites, users, demo clean-up, backups. */
export function AdminPage() {
  const [made, setMade] = useState<Made>(null);
  return (
    <CaregiverLayout title="Admin">
      {made && (
        <div className="mb-6">
          <CopyLink label={made.label} url={made.url} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Requests onLink={setMade} />
        <Invites onLink={setMade} />
        <Users onLink={setMade} />
        <DemoAccounts />
        <Backup />
      </div>
    </CaregiverLayout>
  );
}
