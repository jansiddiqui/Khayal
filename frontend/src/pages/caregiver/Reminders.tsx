import { ArrowLeft, BellPlus, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  createReminder,
  deleteReminder,
  errorDetail,
  getAdherence,
  listPatients,
  listReminders,
  updateReminder,
  type Reminder,
  type ReminderInput,
  type ReminderRepeat,
  type ReminderType,
} from "../../api/client";
import { useAppConfig } from "../../api/useAppConfig";
import { LoadError } from "../../components/caregiver/LoadError";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { copy } from "../../copy";
import { Button } from "../../ui/Button";
import { CountUp } from "../../ui/CountUp";
import { SelectInput, TextInput } from "../../ui/Field";
import { calm, DURATION, useLessMotion } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { useUndoable } from "../../ui/undo";
import { appNow, cleanInput, defaultRepeat, emptyReminder, formProblem, IST_MINUTES, scheduleSummary } from "./reminderSchedule";
import { serverDate } from "../../api/client";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // 0 = Monday
const TYPES: ReminderType[] = ["medicine", "meal", "appointment", "other"];

const clock = (iso: string) => serverDate(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * Today's state in words, including "confirmed later" and "not sure" (CLAUDE.md section 6).
 * `nowHHMM` is the app clock's time: a reminder an hour past its time with no answer is "Not
 * answered yet", not "Pending".
 */
export function todayLabel(r: Reminder, nowHHMM?: string): string {
  if (r.today_status === null) return "—";
  if (r.today_status === "done") {
    const by = r.today_marked_by === "caregiver" ? " (by caregiver)" : "";
    return r.today_late && r.today_logged_at ? `Done, confirmed later at ${clock(r.today_logged_at)}${by}` : `Done${by}`;
  }
  if (r.today_status === "unsure") return "Not sure (family told)";
  if (r.today_status === "missed") return "Missed";
  if (nowHHMM && minutes(nowHHMM) >= minutes(r.time_of_day) + 60) return "Not answered yet";
  return "Pending";
}

function minutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Medicine only: how long it may still say "It's time for this" (null = the standard hour). */
const LATE_WINDOWS: { value: string; label: string }[] = [
  { value: "", label: "1 hour (standard)" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
];

function AdherenceSummary({ patientId, patientName }: { patientId: number; patientName: string }) {
  const adherence = useQuery({ queryKey: ["adherence", patientId], queryFn: () => getAdherence(patientId) });
  // The card keeps its place while loading, so nothing below it jumps when it arrives.
  if (!adherence.isSuccess) {
    return (
      <section className="mb-6 flex h-[8.5rem] flex-col gap-2 rounded-lg border border-line bg-surface p-4" aria-busy="true" aria-label="Loading adherence">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </section>
    );
  }
  const a = adherence.data;
  const extra = [a.done_late ? `${a.done_late} confirmed later` : null, a.unsure ? `${a.unsure} not sure` : null].filter(Boolean);
  return (
    <section className="mb-6 flex min-h-[8.5rem] flex-col rounded-lg border border-line bg-surface p-4" aria-labelledby="adherence-heading">
      <h2 id="adherence-heading" className="text-lg font-semibold">
        Adherence, last {a.days} days
      </h2>
      <p className="text-3xl font-semibold tabular-nums">
        {a.rate === null ? "—" : <CountUp value={Math.round(a.rate * 100)} format={(n) => `${Math.round(n)}%`} />}
      </p>
      <p className="text-ink-soft">
        {a.done_by_patient} done by {patientName} · {a.done_by_caregiver} done by caregiver · {a.missed} missed
        {extra.length > 0 && ` · ${extra.join(" · ")}`}
      </p>
      <p className="text-ink-muted">
        Only reminders the patient marked done themself count toward the rate; "confirmed later" counts, and shows that it
        wasn't on time.
      </p>
    </section>
  );
}

const REPEATS: { value: ReminderRepeat; label: string }[] = [
  { value: "once", label: "Just once" },
  { value: "daily", label: "Every day" },
  { value: "weekly_days", label: "On some days" },
];
const field = "rounded-lg border border-line-strong bg-surface px-3 py-2 transition-colors hover:border-teal-600 focus:border-brand";

function ReminderForm({
  initial,
  isNew,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: ReminderInput;
  /** A new reminder: "Repeats" follows the type until the caregiver picks it themself. */
  isNew: boolean;
  submitLabel: string;
  onSubmit: (input: ReminderInput) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const offset = useAppConfig()?.utc_offset_minutes ?? IST_MINUTES;
  const today = appNow(offset).date;
  const [form, setForm] = useState<ReminderInput>(initial);
  const [repeatChosen, setRepeatChosen] = useState(!isNew);
  const [tried, setTried] = useState(false);
  const problem = formProblem(form, offset);
  const valid = form.title.trim().length > 0 && problem === null;
  const set = (change: Partial<ReminderInput>) => setForm((f) => ({ ...f, ...change }));

  function toggleDay(day: number) {
    const days = form.days_of_week.includes(day) ? form.days_of_week.filter((d) => d !== day) : [...form.days_of_week, day];
    set({ days_of_week: days.sort((a, b) => a - b) });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (valid) onSubmit(cleanInput(form));
  }

  const name = `repeat-${submitLabel.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={submitLabel}>
      <div className="flex flex-wrap gap-3">
        <TextInput
          label="Title"
          value={form.title}
          maxLength={120}
          required
          onChange={(e) => set({ title: e.target.value })}
          error={form.title.trim() ? null : "Give it a short name, e.g. “Blood pressure tablet”."}
          forceError={tried}
          wrapperClassName="w-64"
          autoComplete="off"
        />
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Type</span>
          <select
            value={form.type}
            onChange={(e) => {
              const type = e.target.value as ReminderType;
              set(repeatChosen ? { type } : { type, repeat: defaultRepeat(type) });
            }}
            className={field}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {copy.reminders.types[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-ink-soft">Repeats</legend>
        {REPEATS.map(({ value, label }) => (
          <label key={value} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${form.repeat === value ? "border-brand bg-brand-soft" : "border-line"}`}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={form.repeat === value}
              onChange={() => {
                setRepeatChosen(true);
                set({ repeat: value });
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        {form.repeat === "once" && (
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Date</span>
            <input type="date" required min={today} value={form.on_date ?? ""} onChange={(e) => set({ on_date: e.target.value || null })} className={field} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Time</span>
          <input type="time" required value={form.time_of_day} onChange={(e) => set({ time_of_day: e.target.value })} className={field} />
        </label>
        {form.repeat !== "once" && (
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Starts</span>
            <input type="date" required value={form.start_date ?? ""} onChange={(e) => set({ start_date: e.target.value || null })} className={field} />
          </label>
        )}
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
          Active
        </label>
      </div>

      {form.repeat === "weekly_days" && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-1 text-ink-soft">Days</legend>
          {WEEKDAYS.map((dayName, day) => (
            <label key={dayName} className="flex items-center gap-1 rounded-md border border-line px-2 py-1">
              <input type="checkbox" checked={form.days_of_week.includes(day)} onChange={() => toggleDay(day)} />
              {dayName}
            </label>
          ))}
        </fieldset>
      )}

      {form.repeat !== "once" && (
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="mb-1 text-ink-soft">Ends</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name={`${name}-ends`} checked={form.end_date === null} onChange={() => set({ end_date: null })} />
            Until I stop it
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${name}-ends`}
              checked={form.end_date !== null}
              onChange={() => set({ end_date: form.start_date && form.start_date > today ? form.start_date : today })}
            />
            Ends on
          </label>
          {form.end_date !== null && (
            <input
              type="date"
              aria-label="Ends on date"
              min={form.start_date ?? today}
              value={form.end_date}
              onChange={(e) => set({ end_date: e.target.value || null })}
              className={field}
            />
          )}
        </fieldset>
      )}

      {form.type === "medicine" && (
        <SelectInput
          label="Safe late window"
          wrapperClassName="max-w-md"
          value={form.late_window_minutes ? String(form.late_window_minutes) : ""}
          onChange={(e) => set({ late_window_minutes: e.target.value ? Number(e.target.value) : null })}
          hint="How long after its time the reminder may still say “It's time for this”. After that it only asks whether it is done, and never suggests taking it. Ask the doctor if unsure: Khayal gives no medical advice."
        >
          {LATE_WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </SelectInput>
      )}

      {problem && <p className="text-accent-strong">{problem}</p>}
      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={!valid} loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

function toInput(r: Reminder, today: string): ReminderInput {
  return {
    title: r.title,
    type: r.type,
    time_of_day: r.time_of_day.slice(0, 5),
    repeat: r.repeat,
    days_of_week: r.repeat === "weekly_days" ? r.days_of_week : [],
    on_date: r.on_date ?? today,
    start_date: r.start_date ?? today,
    end_date: r.end_date,
    active: r.active,
    late_window_minutes: r.late_window_minutes ?? null,
  };
}

/** What a reminder will look like in the list straight away, before the server has answered. */
function optimisticReminder(id: number, patientId: number, input: ReminderInput, today: string): Reminder {
  const end = input.repeat === "once" ? input.on_date : input.end_date;
  return {
    id,
    patient_id: patientId,
    title: input.title,
    type: input.type,
    time_of_day: `${input.time_of_day}:00`,
    repeat: input.repeat,
    days_of_week: input.days_of_week,
    on_date: input.on_date,
    start_date: input.start_date,
    end_date: input.end_date,
    active: input.active,
    late_window_minutes: input.late_window_minutes ?? null,
    past: end !== null && end < today,
    today_status: null,
    today_marked_by: null,
  };
}

export function CaregiverReminders() {
  const patientId = Number(useParams().patientId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const undoable = useUndoable();
  const less = useLessMotion();
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const key = ["reminders", patientId] as const;
  const reminders = useQuery({ queryKey: key, queryFn: () => listReminders(patientId) });
  const patient = patients.data?.find((p) => p.id === patientId);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // The row just added or changed glows softly for 2 seconds and is scrolled into view.
  const [highlight, setHighlight] = useState<number | null>(null);

  const offset = useAppConfig()?.utc_offset_minutes ?? IST_MINUTES;
  const today = appNow(offset).date;
  const snapshot = () => queryClient.getQueryData<Reminder[]>(key);
  const put = (list: Reminder[] | undefined) => queryClient.setQueryData(key, list);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["adherence", patientId] });
  };
  const failed = (error: unknown) => toast.show({ tone: "error", message: `Could not save the change. ${errorDetail(error) ?? "Try again."}` });

  useEffect(() => {
    if (highlight === null) return;
    const row = document.getElementById(`reminder-${highlight}`);
    if (row && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest", behavior: less ? "auto" : "smooth" });
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(t);
  }, [highlight, less]);

  // Optimistic: the list changes at once and rolls back with a message if the server refuses.
  const create = useMutation({
    mutationFn: (input: ReminderInput) => createReminder(patientId, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = snapshot();
      put([...(before ?? []), optimisticReminder(-Date.now(), patientId, input, today)]);
      return { before };
    },
    onError: (error, _input, context) => {
      put(context?.before);
      failed(error);
    },
    onSuccess: (created) => {
      toast.show({ message: `Reminder added: ${created.title}, ${scheduleSummary(created, today)}.` });
      setHighlight(created.id);
      setAdding(false);
      setFormKey((k) => k + 1);
    },
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: ReminderInput; toggled?: boolean }) => updateReminder(patientId, id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = snapshot();
      put(before?.map((r) => (r.id === id ? { ...optimisticReminder(id, patientId, input, today), today_status: r.today_status, today_marked_by: r.today_marked_by } : r)));
      setEditing(null);
      return { before };
    },
    onError: (error, _vars, context) => {
      put(context?.before);
      failed(error);
    },
    onSuccess: (saved, { input, toggled }) => {
      setHighlight(saved.id);
      toast.show({
        message: !toggled
          ? `Saved: ${saved.title}.`
          : input.active
            ? `Resumed: ${saved.title}.`
            : `Paused: ${saved.title}. It won't be shown until you resume it.`,
      });
    },
    onSettled: refresh,
  });

  function remove(r: Reminder) {
    const before = snapshot();
    undoable({
      message: `Reminder deleted: ${r.title}.`,
      apply: () => put(before?.filter((x) => x.id !== r.id)),
      revert: () => put(before),
      commit: () => deleteReminder(patientId, r.id),
      failureMessage: `Could not delete “${r.title}”. It is back in the list.`,
      onCommitted: refresh,
    });
  }

  const current = reminders.data?.filter((r) => !r.past) ?? [];
  const past = reminders.data?.filter((r) => r.past) ?? [];

  const rowActions = (r: Reminder, withEdit: boolean) => (
    <div className="flex flex-wrap gap-1">
      {withEdit && (
        <Button size="sm" variant="quiet" icon={<Pencil />} onClick={() => setEditing(r.id)} aria-label={`Edit ${r.title}`}>
          Edit
        </Button>
      )}
      {withEdit && (
        <Button
          size="sm"
          variant="quiet"
          icon={r.active ? <Pause /> : <Play />}
          onClick={() => update.mutate({ id: r.id, input: { ...toInput(r, today), active: !r.active }, toggled: true })}
          aria-label={`${r.active ? "Pause" : "Resume"} ${r.title}`}
        >
          {r.active ? "Pause" : "Resume"}
        </Button>
      )}
      <Button size="sm" variant="danger-quiet" icon={<Trash2 />} onClick={() => remove(r)} aria-label={`Delete ${r.title}`}>
        Delete
      </Button>
    </div>
  );

  const rowClass = (r: Reminder) =>
    `border-b border-line transition-colors duration-700 ease-calm last:border-0 hover:bg-brand-soft/60 ${
      highlight === r.id ? "bg-accent-soft" : ""
    } ${r.active ? "" : "text-ink-muted"} ${r.id < 0 ? "opacity-70" : ""}`;

  return (
    <CaregiverLayout title={`Reminders${patient ? ` · ${patient.name}` : ""}`}>
      <Link to={`/caregiver/patients/${patientId}`} className="mb-4 inline-flex items-center gap-1 text-brand-dark underline-offset-2 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to patient
      </Link>

      <AdherenceSummary patientId={patientId} patientName={patient?.name.split(" ")[0] ?? "patient"} />

      <section className="mb-6 overflow-x-auto rounded-lg border border-line bg-surface p-4" aria-labelledby="current-reminders">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="current-reminders" className="text-lg font-semibold">
            Reminders
          </h2>
          {!adding && (
            <Button variant="primary" size="sm" icon={<BellPlus />} onClick={() => setAdding(true)}>
              Add a reminder
            </Button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {adding && (
            <motion.div
              key="add-form"
              initial={less ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={calm(DURATION.base)}
              className="mb-4 rounded-lg border border-line bg-desk p-4"
            >
              <ReminderForm
                key={`${formKey}-${today}`}
                initial={emptyReminder(today)}
                isNew
                submitLabel="Add reminder"
                busy={create.isPending}
                onSubmit={(input) => create.mutate(input)}
                onCancel={() => setAdding(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {reminders.isPending && (
          <div role="status" aria-busy="true" aria-label="Loading reminders" className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}
        {reminders.isError && <LoadError message="Could not load reminders." onRetry={() => void reminders.refetch()} />}
        {reminders.isSuccess && current.length === 0 && !adding && (
          <EmptyState
            icon={<BellPlus />}
            title="No reminders yet"
            action={
              <Button variant="primary" size="sm" icon={<BellPlus />} onClick={() => setAdding(true)}>
                Add the first reminder
              </Button>
            }
          >
            Medicine, meals or an appointment. {patient?.name.split(" ")[0] ?? "They"} sees them on Today's reminders.
          </EmptyState>
        )}
        {current.length > 0 && (
          <table role="table" className="stack-table w-full text-left">
            <thead role="rowgroup" className="border-b border-line text-ink-muted">
              <tr role="row">
                <th role="columnheader" className="py-2 pr-3 font-medium">Title</th>
                <th role="columnheader" className="py-2 pr-3 font-medium">Type</th>
                <th role="columnheader" className="py-2 pr-3 font-medium">When</th>
                <th role="columnheader" className="py-2 pr-3 font-medium">Today</th>
                <th role="columnheader" className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {current.map((r) =>
                editing === r.id ? (
                  <tr role="row" key={r.id} id={`reminder-${r.id}`} className="border-b border-line bg-desk">
                    <td role="cell" colSpan={5} className="p-3">
                      <ReminderForm
                        initial={toInput(r, today)}
                        isNew={false}
                        submitLabel="Save changes"
                        busy={update.isPending}
                        onSubmit={(input) => update.mutate({ id: r.id, input })}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr role="row" key={r.id} id={`reminder-${r.id}`} className={rowClass(r)}>
                    <td role="cell" data-label="Title" className="py-2 pr-3 pl-1">
                      {r.title}
                      {!r.active && " (paused)"}
                    </td>
                    <td role="cell" data-label="Type" className="py-2 pr-3">{copy.reminders.types[r.type]}</td>
                    <td role="cell" data-label="When" className="py-2 pr-3">{scheduleSummary(r, today)}</td>
                    <td
                      role="cell"
                      data-label="Today"
                      className={`py-2 pr-3 ${r.today_status === "missed" || r.today_status === "unsure" ? "font-medium text-accent-strong" : ""}`}
                    >
                      {todayLabel(r, appNow(offset).time)}
                    </td>
                    <td role="cell" className="py-1.5">
                      {rowActions(r, r.id > 0)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>

      {past.length > 0 && (
        <section className="overflow-x-auto rounded-lg border border-line bg-surface p-4" aria-labelledby="past-reminders">
          <h2 id="past-reminders" className="text-lg font-semibold">Past reminders</h2>
          <p className="mb-3 text-ink-muted">Their day or end date has passed. They are kept with their done and missed history until you delete them.</p>
          <table role="table" className="stack-table w-full text-left">
            <thead role="rowgroup" className="border-b border-line text-ink-muted">
              <tr role="row">
                <th role="columnheader" className="py-2 pr-3 font-medium">Title</th>
                <th role="columnheader" className="py-2 pr-3 font-medium">Type</th>
                <th role="columnheader" className="py-2 pr-3 font-medium">When</th>
                <th role="columnheader" className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {past.map((r) => (
                <tr role="row" key={r.id} id={`reminder-${r.id}`} className="border-b border-line text-ink-soft transition-colors last:border-0 hover:bg-brand-soft/60">
                  <td role="cell" data-label="Title" className="py-2 pr-3 pl-1">{r.title}</td>
                  <td role="cell" data-label="Type" className="py-2 pr-3">{copy.reminders.types[r.type]}</td>
                  <td role="cell" data-label="When" className="py-2 pr-3">{scheduleSummary(r, today)}</td>
                  <td role="cell" className="py-1.5">{rowActions(r, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </CaregiverLayout>
  );
}
