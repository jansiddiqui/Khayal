import { ChevronRight, UserPlus, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { addElder, errorDetail, listPatients, uploadElderPhoto, type AddElderInput, type Patient } from "../../api/client";
import { Disclaimer } from "../../components/caregiver/Disclaimer";
import { LoadError } from "../../components/caregiver/LoadError";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { formatZ, StatusBadge } from "../../components/caregiver/Status";
import { ActiveState, LastUpdated } from "../../components/caregiver/LiveState";
import { Button } from "../../ui/Button";
import { TextInput } from "../../ui/Field";
import { calm, DURATION, useLessMotion } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState } from "../../ui/States";
import { useToast } from "../../ui/Toast";

/**
 * Add the elder you look after (CLAUDE.md section 11): no email for them; their device pairs
 * with a 6-digit code. The consents are recorded with the policy version.
 */
function AddElderForm({ onAdded }: { onAdded?: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tried, setTried] = useState(false);
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
      setTried(false);
      toast.show({ message: `Added ${elder.name}. Next, pair their phone on their page.` });
      onAdded?.();
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
    setTried(true);
    if (!name.trim() || !guardian || !basis) return;
    add.mutate({ name, city: city || undefined, is_family_or_guardian: true, basis, photos, voice });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-labelledby="add-elder-title">
      <h2 id="add-elder-title" className="text-lg font-semibold">
        Add the person you look after
      </h2>
      <p className="text-ink-muted">No email is needed for them. Their phone or tablet signs in with a 6-digit code you make on their page.</p>
      <TextInput
        label="Their name"
        required
        maxLength={120}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={name.trim() ? null : "Please write their name, as the family calls them."}
        forceError={tried}
        autoComplete="off"
      />
      <TextInput
        label="City (for the daily “About Today” game)"
        maxLength={80}
        value={city}
        onChange={(e) => setCity(e.target.value)}
        hint="Optional. Used for the question “Which city are you in?”."
      />

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
      <Button type="submit" variant="primary" icon={<UserPlus />} loading={add.isPending} disabled={!guardian || !basis} className="self-start">
        Add
      </Button>
      {tried && (!guardian || !basis) && (
        <p className="text-sm text-danger">Please confirm the consent above (both parts) before adding them.</p>
      )}
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

/** Declining first, then Watch, Stable and Learning: the people who need attention come first. */
const STATUS_ORDER = { declining: 0, watch: 1, stable: 2, insufficient: 3 } as const;

export function CaregiverDashboard() {
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients, refetchInterval: 60_000 });
  const navigate = useNavigate();
  const less = useLessMotion();
  const [adding, setAdding] = useState(false);
  const none = patients.isSuccess && patients.data.length === 0;
  // With nobody added yet the form is the next step, so it is open; otherwise it waits behind a button.
  const showForm = none || adding;

  return (
    <CaregiverLayout
      title="Dashboard"
      meta={
        patients.isSuccess && (
          <LastUpdated updatedAt={patients.dataUpdatedAt} fetching={patients.isFetching} onRefresh={() => void patients.refetch()} />
        )
      }
    >
      <div className={`grid gap-6 ${showForm ? "md:grid-cols-[2fr_1fr]" : ""}`}>
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4" aria-labelledby="people-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="people-title" className="text-lg font-semibold">
              The people you look after
            </h2>
            {!showForm && (
              <Button size="sm" icon={<UserPlus />} onClick={() => setAdding(true)}>
                Add another person
              </Button>
            )}
          </div>
          {patients.isPending && (
            <div role="status" aria-busy="true" aria-label="Loading the people you look after" className="flex flex-col gap-3 py-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}
          {patients.isError && <LoadError message="Could not load the people you look after." onRetry={() => void patients.refetch()} />}
          {none && (
            <EmptyState icon={<Users />} title="Nobody here yet">
              Add the person you look after with the form. Then pair their phone with a 6-digit code.
            </EmptyState>
          )}
          {patients.isSuccess && patients.data.length > 0 && (
            <table role="table" className="stack-table w-full text-left">
              <thead role="rowgroup" className="border-b border-line text-ink-muted">
                <tr role="row">
                  <th role="columnheader" className="py-2 pr-4 font-medium">Name</th>
                  <th role="columnheader" className="py-2 pr-4 font-medium">Status</th>
                  <th role="columnheader" className="py-2 pr-4 font-medium">Index</th>
                  <th role="columnheader" className="py-2 pr-4 font-medium">Today</th>
                  <th role="columnheader" className="py-2 font-medium">City</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {[...patients.data].sort((a, b) => STATUS_ORDER[a.cognitive_status] - STATUS_ORDER[b.cognitive_status]).map((p) => (
                  <tr
                    role="row"
                    key={p.id}
                    onClick={(event) => {
                      // The whole row opens their page for a mouse; the name stays the real link.
                      if ((event.target as HTMLElement).closest("a")) return;
                      navigate(`/caregiver/patients/${p.id}`);
                    }}
                    className="group cursor-pointer border-b border-line transition-colors duration-150 ease-calm last:border-0 hover:bg-brand-soft"
                  >
                    <td role="cell" data-label="Name" className="py-2.5 pr-4 pl-1">
                      <Link
                        to={`/caregiver/patients/${p.id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-dark underline-offset-2 hover:underline"
                      >
                        {p.name}
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
                        />
                      </Link>
                    </td>
                    <td role="cell" data-label="Status" className="py-2.5 pr-4">
                      <StatusBadge status={p.cognitive_status} />
                    </td>
                    <td role="cell" data-label="Index" className="py-2.5 pr-4 tabular-nums">
                      {p.cognitive_index === null ? "—" : formatZ(p.cognitive_index)}
                    </td>
                    <td role="cell" data-label="Today" className="py-2.5 pr-4">
                      <ActiveState lastActiveAt={p.last_active_at} />
                    </td>
                    <td role="cell" data-label="City" className="py-2.5 text-ink-soft">{p.city ?? "—"}</td>
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

        <AnimatePresence initial={false}>
          {showForm && (
            <motion.section
              key="add"
              initial={less ? { opacity: 0 } : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={calm(DURATION.base)}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
            >
              <AddElderForm onAdded={() => setAdding(false)} />
              {!none && (
                <Button size="sm" variant="quiet" className="self-start" onClick={() => setAdding(false)}>
                  Close
                </Button>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </CaregiverLayout>
  );
}
