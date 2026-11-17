import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
import { appNow, cleanInput, defaultRepeat, emptyReminder, formProblem, IST_MINUTES, scheduleSummary } from "./reminderSchedule";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // 0 = Monday
const TYPES: ReminderType[] = ["medicine", "meal", "appointment", "other"];

function todayLabel(r: Reminder): string {
  if (r.today_status === null) return "—";
  if (r.today_status === "done") return r.today_marked_by === "caregiver" ? "Done (by caregiver)" : "Done";
  return r.today_status === "missed" ? "Missed" : "Pending";
}

function AdherenceSummary({ patientId, patientName }: { patientId: number; patientName: string }) {
  const adherence = useQuery({ queryKey: ["adherence", patientId], queryFn: () => getAdherence(patientId) });
  if (!adherence.isSuccess) return null;
  const a = adherence.data;
  return (
    <section className="mb-6 rounded-lg border border-line bg-surface p-4" aria-labelledby="adherence-heading">
      <h2 id="adherence-heading" className="text-lg font-semibold">
        Adherence, last {a.days} days
      </h2>
      <p className="text-3xl font-semibold">{a.rate === null ? "—" : `${Math.round(a.rate * 100)}%`}</p>
      <p className="text-ink-soft">
        {a.done_by_patient} done by {patientName} · {a.done_by_caregiver} done by caregiver · {a.missed} missed
      </p>
      <p className="text-ink-muted">Only reminders the patient marked done themself count toward the rate.</p>
    </section>
  );
}

const REPEATS: { value: ReminderRepeat; label: string }[] = [
  { value: "once", label: "Just once" },
  { value: "daily", label: "Every day" },
  { value: "weekly_days", label: "On some days" },
];
const field = "rounded-md border border-line-strong bg-surface px-3 py-2";

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
  const problem = formProblem(form, offset);
  const valid = form.title.trim().length > 0 && problem === null;
  const set = (change: Partial<ReminderInput>) => setForm((f) => ({ ...f, ...change }));

  function toggleDay(day: number) {
    const days = form.days_of_week.includes(day) ? form.days_of_week.filter((d) => d !== day) : [...form.days_of_week, day];
    set({ days_of_week: days.sort((a, b) => a - b) });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) onSubmit(cleanInput(form));
  }

  const name = `repeat-${submitLabel.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={submitLabel}>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Title</span>
          <input value={form.title} maxLength={120} required onChange={(e) => set({ title: e.target.value })} className={`w-64 ${field}`} />
        </label>
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

      {problem && <p className="text-accent-strong">{problem}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!valid || busy}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-md border border-line-strong px-4 py-2 hover:bg-sunken">
            Cancel
          </button>
        )}
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
  };
}

export function CaregiverReminders() {
  const patientId = Number(useParams().patientId);
  const queryClient = useQueryClient();
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const reminders = useQuery({ queryKey: ["reminders", patientId], queryFn: () => listReminders(patientId) });
  const patient = patients.data?.find((p) => p.id === patientId);
  const [editing, setEditing] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["reminders", patientId] });
    void queryClient.invalidateQueries({ queryKey: ["adherence", patientId] });
  };
  const create = useMutation({
    mutationFn: (input: ReminderInput) => createReminder(patientId, input),
    onSuccess: () => {
      setFormKey((k) => k + 1); // reset the form
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: ReminderInput }) => updateReminder(patientId, id, input),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: number) => deleteReminder(patientId, id), onSuccess: refresh });

  const failure = [create, update, remove].find((m) => m.isError)?.error;
  const offset = useAppConfig()?.utc_offset_minutes ?? IST_MINUTES;
  const today = appNow(offset).date;
  const current = reminders.data?.filter((r) => !r.past) ?? [];
  const past = reminders.data?.filter((r) => r.past) ?? [];

  const deleteButton = (r: Reminder) => (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(`Delete the reminder "${r.title}"? Its done and missed history goes too.`)) remove.mutate(r.id);
      }}
      className="text-danger underline"
      aria-label={`Delete ${r.title}`}
    >
      Delete
    </button>
  );

  return (
    <CaregiverLayout title={`Reminders${patient ? ` · ${patient.name}` : ""}`}>
      <Link to={`/caregiver/patients/${patientId}`} className="mb-4 inline-flex items-center gap-1 text-brand-dark underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to patient
      </Link>

      {failure !== undefined && (
        <p role="alert" className="mb-4 text-danger">
          Could not save the change. {errorDetail(failure) ?? "Try again."}
        </p>
      )}

      <AdherenceSummary patientId={patientId} patientName={patient?.name.split(" ")[0] ?? "patient"} />

      <section className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">Add a reminder</h2>
        <ReminderForm
          key={`${formKey}-${today}`}
          initial={emptyReminder(today)}
          isNew
          submitLabel="Add reminder"
          busy={create.isPending}
          onSubmit={(input) => create.mutate(input)}
        />
      </section>

      <section className="mb-6 overflow-x-auto rounded-lg border border-line bg-surface p-4" aria-labelledby="current-reminders">
        <h2 id="current-reminders" className="mb-3 text-lg font-semibold">Reminders</h2>
        {reminders.isPending && <p className="text-ink-muted">Loading reminders…</p>}
        {reminders.isError && <LoadError message="Could not load reminders." onRetry={() => void reminders.refetch()} />}
        {reminders.isSuccess && current.length === 0 && <p className="text-ink-muted">No reminders yet.</p>}
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
                  <tr role="row" key={r.id} className="border-b border-line">
                    <td role="cell" colSpan={5} className="py-3">
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
                  <tr role="row" key={r.id} className={`border-b border-line last:border-0 ${r.active ? "" : "text-ink-muted"}`}>
                    <td role="cell" data-label="Title" className="py-2 pr-3">
                      {r.title}
                      {!r.active && " (paused)"}
                    </td>
                    <td role="cell" data-label="Type" className="py-2 pr-3">{copy.reminders.types[r.type]}</td>
                    <td role="cell" data-label="When" className="py-2 pr-3">{scheduleSummary(r, today)}</td>
                    <td role="cell" data-label="Today" className={`py-2 pr-3 ${r.today_status === "missed" ? "font-medium text-accent-strong" : ""}`}>
                      {todayLabel(r)}
                    </td>
                    <td role="cell" className="flex gap-2 py-2">
                      <button type="button" onClick={() => setEditing(r.id)} className="text-brand-dark underline" aria-label={`Edit ${r.title}`}>
                        Edit
                      </button>
                      {deleteButton(r)}
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
                <tr role="row" key={r.id} className="border-b border-line text-ink-soft last:border-0">
                  <td role="cell" data-label="Title" className="py-2 pr-3">{r.title}</td>
                  <td role="cell" data-label="Type" className="py-2 pr-3">{copy.reminders.types[r.type]}</td>
                  <td role="cell" data-label="When" className="py-2 pr-3">{scheduleSummary(r, today)}</td>
                  <td role="cell" className="py-2">{deleteButton(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </CaregiverLayout>
  );
}
