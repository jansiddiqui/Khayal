import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { addElder, errorDetail, listPatients, uploadElderPhoto, type AddElderInput, type Patient } from "../../api/client";
import { Disclaimer } from "../../components/caregiver/Disclaimer";
import { LoadError } from "../../components/caregiver/LoadError";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { formatZ, StatusBadge } from "../../components/caregiver/Status";

const input = "rounded-md border border-line-strong bg-surface px-3 py-2";

/**
 * Add the elder you look after (CLAUDE.md section 11): no email for them; their device pairs
 * with a 6-digit code. The consents are recorded with the policy version.
 */
function AddElderForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [guardian, setGuardian] = useState(false);
  const [basis, setBasis] = useState<AddElderInput["basis"] | "">("");
  const [photos, setPhotos] = useState(false);
  const [voice, setVoice] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [added, setAdded] = useState<Patient | null>(null);

  const add = useMutation({
    mutationFn: async (body: AddElderInput) => {
      const elder = await addElder(body);
      return photo && body.photos ? uploadElderPhoto(elder.id, photo) : elder;
    },
    onSuccess: (elder) => {
      setAdded(elder);
      setName("");
      setCity("");
      setGuardian(false);
      setBasis("");
      setPhotos(false);
      setVoice(false);
      setPhoto(null);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  const first = name.trim().split(/\s+/)[0] || "they";
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!guardian || !basis) return;
    add.mutate({ name, city: city || undefined, is_family_or_guardian: true, basis, photos, voice });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-labelledby="add-elder-title">
      <h2 id="add-elder-title" className="text-lg font-semibold">
        Add the person you look after
      </h2>
      <p className="text-ink-muted">No email is needed for them. Their phone or tablet signs in with a 6-digit code you make on their page.</p>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Their name</span>
        <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">City (for the daily “About Today” game)</span>
        <input maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} className={input} />
      </label>

      <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
        <legend className="px-1 font-medium">Consent</legend>
        <label className="flex items-start gap-2">
          <input type="checkbox" required checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="mt-1 size-4 accent-brand" />
          <span>I am a family member or the legal guardian of this person.</span>
        </label>
        <div role="radiogroup" aria-label="On what basis" className="flex flex-col gap-1.5 pl-6">
          <label className="flex items-start gap-2">
            <input type="radio" name="basis" required checked={basis === "elder_agreed"} onChange={() => setBasis("elder_agreed")} className="mt-1 accent-brand" />
            <span>{first === "they" ? "They" : first} agreed to use Khayal.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="basis" checked={basis === "legal_authority"} onChange={() => setBasis("legal_authority")} className="mt-1 accent-brand" />
            <span>I am legally authorised to decide for them (for example a guardian appointed under Indian law).</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
        <legend className="px-1 font-medium">Optional (you can change these later)</legend>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="mt-1 size-4 accent-brand" />
          <span>Family photos, for “Who is this?” (stored privately; only linked family can see them).</span>
        </label>
        {photos && (
          <label className="flex flex-col gap-1 pl-6">
            <span className="text-ink-soft">A photo of them (optional)</span>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="mt-1 size-4 accent-brand" />
          <span>Weekly voice task: a short recording of them describing a picture.</span>
        </label>
      </fieldset>

      <p className="text-ink-muted">
        By adding them you agree to the <Link to="/privacy" className="underline">privacy policy</Link> on their behalf.
      </p>
      <button
        type="submit"
        disabled={add.isPending || !guardian || !basis}
        className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted"
      >
        {add.isPending ? "Adding…" : "Add"}
      </button>
      {add.isError && (
        <p role="alert" className="text-danger">
          {errorDetail(add.error) ?? "Could not add them. Try again."}
        </p>
      )}
      {added && (
        <p className="text-calm">
          Added {added.name}.{" "}
          <Link to={`/caregiver/patients/${added.id}#settings`} className="underline">
            Pair their device
          </Link>
        </p>
      )}
    </form>
  );
}

export function CaregiverDashboard() {
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });

  return (
    <CaregiverLayout title="Dashboard">
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold">The people you look after</h2>
          {patients.isPending && <p className="text-ink-muted">Loading…</p>}
          {patients.isError && <LoadError message="Could not load the people you look after." onRetry={() => void patients.refetch()} />}
          {patients.isSuccess && patients.data.length === 0 && (
            <p className="text-ink-muted">Nobody yet. Add the person you look after with the form.</p>
          )}
          {patients.isSuccess && patients.data.length > 0 && (
            <table role="table" className="stack-table w-full text-left">
              <thead role="rowgroup" className="border-b border-line text-ink-muted">
                <tr role="row">
                  <th role="columnheader" className="py-2 pr-4 font-medium">Name</th>
                  <th role="columnheader" className="py-2 pr-4 font-medium">Status</th>
                  <th role="columnheader" className="py-2 pr-4 font-medium">Index</th>
                  <th role="columnheader" className="py-2 font-medium">City</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {patients.data.map((p) => (
                  <tr role="row" key={p.id} className="border-b border-line last:border-0">
                    <td role="cell" data-label="Name" className="py-2 pr-4">
                      <Link to={`/caregiver/patients/${p.id}`} className="text-brand-dark underline">
                        {p.name}
                      </Link>
                    </td>
                    <td role="cell" data-label="Status" className="py-2 pr-4">
                      <StatusBadge status={p.cognitive_status} />
                    </td>
                    <td role="cell" data-label="Index" className="py-2 pr-4 tabular-nums">{p.cognitive_index === null ? "—" : formatZ(p.cognitive_index)}</td>
                    <td role="cell" data-label="City" className="py-2 text-ink-soft">{p.city ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-sm text-ink-muted">
            Status comes from the overall cognitive index (mean z-score across games): Stable, Watch below −0.5, Declining
            below −1.5.
          </p>
          <Disclaimer />
        </section>

        <section className="rounded-lg border border-line bg-surface p-4">
          <AddElderForm />
        </section>
      </div>
    </CaregiverLayout>
  );
}
