import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  createReminder,
  deleteReminder,
  getAdherence,
  listPatients,
  listReminders,
  updateReminder,
  type Reminder,
  type ReminderInput,
  type ReminderType,
} from "../../api/client";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { copy } from "../../copy";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // 0 = Monday
const TYPES: ReminderType[] = ["medicine", "meal", "appointment", "other"];
const EMPTY: ReminderInput = { title: "", type: "medicine", time_of_day: "09:00", days_of_week: [0, 1, 2, 3, 4, 5, 6], active: true };

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
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="adherence-heading">
      <h2 id="adherence-heading" className="text-lg font-semibold">
        Adherence, last {a.days} days
      </h2>
      <p className="text-3xl font-semibold">{a.rate === null ? "—" : `${Math.round(a.rate * 100)}%`}</p>
      <p className="text-gray-700">
        {a.done_by_patient} done by {patientName} · {a.done_by_caregiver} done by caregiver · {a.missed} missed
      </p>
      <p className="text-gray-500">Only reminders the patient marked done themself count toward the rate.</p>
    </section>
  );
}

function daysLabel(days: number[]): string {
  if (days.length === 7) return "Every day";
  return days.map((d) => WEEKDAYS[d]).join(", ");
}

function ReminderForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: ReminderInput;
  submitLabel: string;
  onSubmit: (input: ReminderInput) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<ReminderInput>(initial);
  const valid = form.title.trim().length > 0 && form.days_of_week.length > 0 && form.time_of_day !== "";

  function toggleDay(day: number) {
    const days = form.days_of_week.includes(day) ? form.days_of_week.filter((d) => d !== day) : [...form.days_of_week, day];
    setForm({ ...form, days_of_week: days.sort((a, b) => a - b) });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) onSubmit({ ...form, title: form.title.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={submitLabel}>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-gray-700">Title</span>
          <input
            value={form.title}
            maxLength={120}
            required
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-64 rounded-md border border-gray-400 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-700">Type</span>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as ReminderType })}
            className="rounded-md border border-gray-400 bg-white px-3 py-2"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {copy.reminders.types[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-700">Time</span>
          <input
            type="time"
            required
            value={form.time_of_day}
            onChange={(e) => setForm({ ...form, time_of_day: e.target.value })}
            className="rounded-md border border-gray-400 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
      </div>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-gray-700">Days</legend>
        {WEEKDAYS.map((name, day) => (
          <label key={name} className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1">
            <input type="checkbox" checked={form.days_of_week.includes(day)} onChange={() => toggleDay(day)} />
            {name}
          </label>
        ))}
      </fieldset>
      {form.days_of_week.length === 0 && <p className="text-amber-800">Choose at least one day.</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!valid || busy}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-md border border-gray-400 px-4 py-2 hover:bg-gray-100">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function toInput(r: Reminder): ReminderInput {
  return { title: r.title, type: r.type, time_of_day: r.time_of_day.slice(0, 5), days_of_week: r.days_of_week, active: r.active };
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

  const failed = create.isError || update.isError || remove.isError;

  return (
    <CaregiverLayout title={`Reminders${patient ? ` · ${patient.name}` : ""}`}>
      <Link to={`/caregiver/patients/${patientId}`} className="mb-4 inline-block text-brand-dark underline">
        ← Back to patient
      </Link>

      {failed && (
        <p role="alert" className="mb-4 text-red-700">
          Could not save the change. Try again.
        </p>
      )}

      <AdherenceSummary patientId={patientId} patientName={patient?.name.split(" ")[0] ?? "patient"} />

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Add a reminder</h2>
        <ReminderForm key={formKey} initial={EMPTY} submitLabel="Add reminder" busy={create.isPending} onSubmit={(input) => create.mutate(input)} />
      </section>

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">All reminders</h2>
        {reminders.isPending && <p className="text-gray-600">Loading reminders…</p>}
        {reminders.isError && <p className="text-red-700">Could not load reminders.</p>}
        {reminders.isSuccess && reminders.data.length === 0 && <p className="text-gray-600">No reminders yet.</p>}
        {reminders.isSuccess && reminders.data.length > 0 && (
          <table className="w-full text-left">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Title</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Days</th>
                <th className="py-2 pr-3 font-medium">Today</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reminders.data.map((r) =>
                editing === r.id ? (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td colSpan={6} className="py-3">
                      <ReminderForm
                        initial={toInput(r)}
                        submitLabel="Save changes"
                        busy={update.isPending}
                        onSubmit={(input) => update.mutate({ id: r.id, input })}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id} className={`border-b border-gray-100 last:border-0 ${r.active ? "" : "text-gray-500"}`}>
                    <td className="py-2 pr-3">{copy.reminders.time(r.time_of_day)}</td>
                    <td className="py-2 pr-3">
                      {r.title}
                      {!r.active && " (paused)"}
                    </td>
                    <td className="py-2 pr-3">{copy.reminders.types[r.type]}</td>
                    <td className="py-2 pr-3">{daysLabel(r.days_of_week)}</td>
                    <td className={`py-2 pr-3 ${r.today_status === "missed" ? "font-medium text-amber-800" : ""}`}>
                      {todayLabel(r)}
                    </td>
                    <td className="flex gap-2 py-2">
                      <button type="button" onClick={() => setEditing(r.id)} className="text-brand-dark underline">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete the reminder "${r.title}"?`)) remove.mutate(r.id);
                        }}
                        className="text-red-700 underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>
    </CaregiverLayout>
  );
}
