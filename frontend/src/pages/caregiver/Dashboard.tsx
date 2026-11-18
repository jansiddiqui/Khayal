import { UserPlus, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { addElder, errorDetail, getGlance, uploadElderPhoto, type AddElderInput, type Glance, type Patient } from "../../api/client";
import { Disclaimer } from "../../components/caregiver/Disclaimer";
import { LoadError } from "../../components/caregiver/LoadError";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { GlanceCard } from "../../components/caregiver/GlanceCard";
import { LastUpdated } from "../../components/caregiver/LiveState";
import { Button } from "../../ui/Button";
import { TextInput } from "../../ui/Field";
import { calm, DURATION, useLessMotion } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { t } from "../../t";

const D = t.dashboard;

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
      toast.show({ message: D.addElder.addedToast(elder.name) });
      onAdded?.();
      setName("");
      setCity("");
      setGuardian(false);
      setBasis("");
      setPhotos(false);
      setVoice(false);
      setPhoto(null);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      void queryClient.invalidateQueries({ queryKey: ["glance"] });
    },
  });

  const first = name.trim().split(/\s+/)[0] || null;
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!name.trim() || !guardian || !basis) return;
    add.mutate({ name, city: city || undefined, is_family_or_guardian: true, basis, photos, voice });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-labelledby="add-elder-title">
      <h2 id="add-elder-title" className="text-lg font-semibold">
        {D.addElder.title}
      </h2>
      <p className="text-ink-muted">{D.addElder.intro}</p>
      <TextInput
        label={D.addElder.nameLabel}
        required
        maxLength={120}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={name.trim() ? null : D.addElder.nameError}
        forceError={tried}
        autoComplete="off"
      />
      <TextInput
        label={D.addElder.cityLabel}
        maxLength={80}
        value={city}
        onChange={(e) => setCity(e.target.value)}
        hint={D.addElder.cityHint}
      />

      <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
        <legend className="px-1 font-medium">{D.addElder.consentLegend}</legend>
        <label className="flex items-start gap-2">
          <input type="checkbox" required checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="mt-1 size-4 accent-brand" />
          <span>{D.addElder.guardian}</span>
        </label>
        <div role="radiogroup" aria-label={D.addElder.basisLabel} className="flex flex-col gap-1.5 pl-6">
          <label className="flex items-start gap-2">
            <input type="radio" name="basis" required checked={basis === "elder_agreed"} onChange={() => setBasis("elder_agreed")} className="mt-1 accent-brand" />
            <span>{D.addElder.agreed(first)}</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="basis" checked={basis === "legal_authority"} onChange={() => setBasis("legal_authority")} className="mt-1 accent-brand" />
            <span>{D.addElder.legal}</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
        <legend className="px-1 font-medium">{D.addElder.optionalLegend}</legend>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="mt-1 size-4 accent-brand" />
          <span>{D.addElder.photos}</span>
        </label>
        {photos && (
          <label className="flex flex-col gap-1 pl-6">
            <span className="text-ink-soft">{D.addElder.photoOfThem}</span>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="mt-1 size-4 accent-brand" />
          <span>{D.addElder.voice}</span>
        </label>
      </fieldset>

      <p className="text-ink-muted">
        {D.addElder.privacyBefore}
        <Link to="/privacy" className="underline">
          {D.addElder.privacyLink}
        </Link>
        {D.addElder.privacyAfter}
      </p>
      <Button type="submit" variant="primary" icon={<UserPlus />} loading={add.isPending} disabled={!guardian || !basis} className="self-start">
        {D.addElder.add}
      </Button>
      {tried && (!guardian || !basis) && (
        <p className="text-sm text-danger">{D.addElder.consentMissing}</p>
      )}
      {add.isError && (
        <p role="alert" className="text-danger">
          {errorDetail(add.error) ?? D.addElder.addFailed}
        </p>
      )}
      {added && (
        <p className="text-calm">
          {D.addElder.added(added.name)}{" "}
          <Link to={`/caregiver/patients/${added.id}#settings`} className="underline">
            {D.addElder.pairDevice}
          </Link>
        </p>
      )}
    </form>
  );
}

/** Who needs you first: a dose to check, a missed dose or new alerts; then Declining, Watch, Stable, Learning. */
const ACTION_ORDER = { check_dose: 0, missed_dose: 1, alerts: 2, pair: 3, add_reminders: 4, inactive: 5, all_good: 6 } as const;
const STATUS_ORDER = { declining: 0, watch: 1, stable: 2, insufficient: 3 } as const;

export function sortGlances(cards: readonly Glance[]): Glance[] {
  return [...cards].sort(
    (a, b) =>
      Math.min(ACTION_ORDER[a.next_action.kind], 3) - Math.min(ACTION_ORDER[b.next_action.kind], 3) ||
      STATUS_ORDER[a.cognitive_status] - STATUS_ORDER[b.cognitive_status] ||
      a.name.localeCompare(b.name),
  );
}

export function CaregiverDashboard() {
  const patients = useQuery({ queryKey: ["glance"], queryFn: getGlance, refetchInterval: 60_000 });
  const less = useLessMotion();
  const [adding, setAdding] = useState(false);
  const none = patients.isSuccess && patients.data.length === 0;
  // With nobody added yet the form is the next step, so it is open; otherwise it waits behind a button.
  const showForm = none || adding;

  return (
    <CaregiverLayout
      title={D.page.title}
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
              {D.page.glanceTitle}
            </h2>
            {!showForm && (
              <Button size="sm" icon={<UserPlus />} onClick={() => setAdding(true)}>
                {D.page.addAnother}
              </Button>
            )}
          </div>
          {patients.isPending && (
            <div role="status" aria-busy="true" aria-label={D.page.loadingPeople} className="flex flex-col gap-3 py-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}
          {patients.isError && <LoadError message={D.page.loadFailed} onRetry={() => void patients.refetch()} />}
          {none && (
            <EmptyState icon={<Users />} title={D.page.emptyTitle}>
              {D.page.emptyBody}
            </EmptyState>
          )}
          {patients.isSuccess && patients.data.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {sortGlances(patients.data).map((g) => (
                <GlanceCard key={g.patient_id} glance={g} />
              ))}
            </div>
          )}
          <p className="text-sm text-ink-muted">
            {D.page.statusHelp}
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
                  {D.page.close}
                </Button>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </CaregiverLayout>
  );
}
