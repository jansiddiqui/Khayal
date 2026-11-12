import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { errorStatus, linkPatient, listPatients } from "../../api/client";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { formatZ, StatusBadge } from "../../components/caregiver/Status";

function linkErrorMessage(error: unknown): string {
  switch (errorStatus(error)) {
    case 404:
      return "No patient account uses that email.";
    case 400:
      return "That account is not a patient account.";
    case 422:
      return "Enter a valid email address.";
    default:
      return "Could not link the patient. Try again.";
  }
}

export function CaregiverDashboard() {
  const queryClient = useQueryClient();
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const [email, setEmail] = useState("");

  const link = useMutation({
    mutationFn: linkPatient,
    onSuccess: () => {
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    link.mutate(email);
  }

  return (
    <CaregiverLayout title="Dashboard">
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 text-lg font-semibold">My patients</h2>
          {patients.isPending && <p className="text-ink-muted">Loading patients…</p>}
          {patients.isError && <p className="text-danger">Could not load patients.</p>}
          {patients.isSuccess && patients.data.length === 0 && (
            <p className="text-ink-muted">No linked patients yet. Link one using their account email.</p>
          )}
          {patients.isSuccess && patients.data.length > 0 && (
            <table className="w-full text-left">
              <thead className="border-b border-line text-ink-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Index</th>
                  <th className="py-2 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {patients.data.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4">
                      <Link to={`/caregiver/patients/${p.id}`} className="text-brand-dark underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={p.cognitive_status} />
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{p.cognitive_index === null ? "—" : formatZ(p.cognitive_index)}</td>
                    <td className="py-2 text-ink-soft">{p.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-sm text-ink-muted">
            Status comes from the overall cognitive index (mean z-score across games): Stable, Watch below −0.5, Declining
            below −1.5.
          </p>
        </section>

        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 text-lg font-semibold">Link a patient</h2>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label htmlFor="patient-email" className="text-ink-soft">
              Patient's account email
            </label>
            <input
              id="patient-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-line-strong px-3 py-2"
            />
            <button
              type="submit"
              disabled={link.isPending}
              className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted"
            >
              {link.isPending ? "Linking…" : "Link patient"}
            </button>
            {link.isError && (
              <p role="alert" className="text-danger">
                {linkErrorMessage(link.error)}
              </p>
            )}
            {link.isSuccess && <p className="text-calm">Linked {link.data.name}.</p>}
          </form>
        </section>
      </div>
    </CaregiverLayout>
  );
}
