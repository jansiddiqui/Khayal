import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { admin, serverDate, type AdminFeedback, type FeedbackStatus } from "../../api/client";
import { LoadError } from "../../components/caregiver/LoadError";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { card } from "./Overview";

export const KIND_LABEL = { hard: "Something was hard", liked: "I liked this", other: "Other" } as const;
const STATUS_LABEL: Record<FeedbackStatus, string> = { new: "New", read: "Read", resolved: "Resolved" };
const when = (iso: string) => serverDate(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function VoiceNote({ id }: { id: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const load = useMutation({ mutationFn: () => admin.feedbackVoiceUrl(id), onSuccess: setUrl });
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  if (url) return <audio controls src={url} className="h-9 max-w-full" />;
  return (
    <Button size="sm" icon={<Play />} loading={load.isPending} onClick={() => load.mutate()}>
      Play voice note
    </Button>
  );
}

function Item({ item }: { item: AdminFeedback }) {
  const queryClient = useQueryClient();
  const set = useMutation({
    mutationFn: (status: FeedbackStatus) => admin.setFeedbackStatus(item.id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "feedback"] }),
  });
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={`font-semibold ${item.kind === "hard" ? "text-accent-strong" : ""}`}>{KIND_LABEL[item.kind]}</span>
        <span className="text-ink-muted">
          {item.role === "patient" ? "Elder" : "Family"} · {item.sender ?? "deleted account"} · {when(item.created_at)}
          {item.page && <> · {item.page}</>}
        </span>
        <span className={`ml-auto rounded px-1.5 text-xs ${item.status === "new" ? "bg-accent-soft" : "bg-sunken"}`}>{STATUS_LABEL[item.status]}</span>
      </p>
      {item.text && <p className="whitespace-pre-wrap">{item.text}</p>}
      {item.has_voice && <VoiceNote id={item.id} />}
      <div className="flex flex-wrap gap-2">
        {item.status === "new" && (
          <Button size="sm" variant="quiet" disabled={set.isPending} onClick={() => set.mutate("read")}>
            Mark read
          </Button>
        )}
        {item.status !== "resolved" ? (
          <Button size="sm" disabled={set.isPending} onClick={() => set.mutate("resolved")}>
            Resolve
          </Button>
        ) : (
          <Button size="sm" variant="quiet" disabled={set.isPending} onClick={() => set.mutate("new")}>
            Reopen
          </Button>
        )}
      </div>
    </li>
  );
}

/** Feedback from caregivers (header) and elders (Settings sheet); admins mark it read or resolved. */
export function FeedbackInbox() {
  const [filter, setFilter] = useState<FeedbackStatus | "">("new");
  const q = useQuery({ queryKey: ["admin", "feedback", filter], queryFn: () => admin.feedback(filter || undefined) });
  return (
    <section className={card} aria-labelledby="feedback-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="feedback-title" className="text-lg font-semibold">
          Feedback
        </h2>
        <label className="flex items-center gap-2 text-ink-soft">
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value as FeedbackStatus | "")} className="rounded-md border border-line bg-surface px-2 py-1">
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="resolved">Resolved</option>
            <option value="">All</option>
          </select>
        </label>
      </div>
      {q.isPending && <Skeleton className="h-24 w-full" />}
      {q.isError && <LoadError message="Could not load the feedback." onRetry={() => void q.refetch()} />}
      {q.isSuccess && q.data.length === 0 && <p className="text-ink-muted">Nothing here.</p>}
      {q.isSuccess && q.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {q.data.map((item) => (
            <Item key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export const ACTION_LABEL: Record<string, string> = {
  invite_request_approved: "Approved an invite request",
  invite_request_declined: "Declined an invite request",
  invite_created: "Made an invite link",
  invite_revoked: "Revoked an invite link",
  reset_link: "Made a password reset link",
  demo_accounts_removed: "Removed demo accounts",
  backup: "Downloaded a full backup",
  research_export: "Downloaded a research export",
  feedback_status: "Changed a feedback status",
};

/** Every admin action, newest first (backend services/admin_log.py). */
export function ActivityLog() {
  const [action, setAction] = useState("");
  const q = useQuery({ queryKey: ["admin", "log", action], queryFn: () => admin.log(action || undefined) });
  return (
    <section className={card} aria-labelledby="log-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="log-title" className="text-lg font-semibold">
          Admin activity log
        </h2>
        <label className="flex items-center gap-2 text-ink-soft">
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1">
            <option value="">All</option>
            {Object.entries(ACTION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {q.isPending && <Skeleton className="h-24 w-full" />}
      {q.isError && <LoadError message="Could not load the log." onRetry={() => void q.refetch()} />}
      {q.isSuccess && q.data.length === 0 && <p className="text-ink-muted">No admin actions yet.</p>}
      {q.isSuccess && q.data.length > 0 && (
        <table className="w-full text-left">
          <thead className="border-b border-line text-ink-muted">
            <tr>
              <th className="py-1.5 pr-3 font-medium">When</th>
              <th className="py-1.5 pr-3 font-medium">Who</th>
              <th className="py-1.5 pr-3 font-medium">What</th>
              <th className="py-1.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((e) => (
              <tr key={e.id} className="border-b border-line align-top last:border-0">
                <td className="py-1.5 pr-3 whitespace-nowrap text-ink-soft">{when(e.at)}</td>
                <td className="py-1.5 pr-3">{e.admin_email}</td>
                <td className="py-1.5 pr-3">{ACTION_LABEL[e.action] ?? e.action}</td>
                <td className="py-1.5 text-ink-soft">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
