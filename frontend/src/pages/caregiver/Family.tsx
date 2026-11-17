import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  createFamilyMember,
  deleteFamilyMember,
  deleteFamilyPhoto,
  describeRequestError,
  listFamily,
  listPatients,
  updateFamilyMember,
  uploadFamilyPhoto,
  type FamilyMember,
  type FamilyMemberInput,
} from "../../api/client";
import { shrinkPhoto } from "../../api/photoResize";
import { AuthedImage } from "../../components/AuthedImage";
import { LoadError } from "../../components/caregiver/LoadError";
import { CaregiverLayout } from "../../components/CaregiverLayout";

export const RELATIONS = ["Son", "Daughter", "Grandson", "Granddaughter", "Wife", "Husband", "Friend", "Other"] as const;
const OTHER = "Other";
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png"];

/** Checked again by the server; this just gives a quick, clear message. */
export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return "Only JPG and PNG photos are allowed.";
  if (file.size > MAX_PHOTO_BYTES) return "Photos must be 5 MB or smaller.";
  return null;
}

/**
 * Which of the chosen files to upload: the good ones, up to the `free` places left (5 per person),
 * in the order chosen. `notes` says what was left out and why.
 */
export function pickPhotos(files: File[], free: number): { accepted: File[]; notes: string[] } {
  const notes: string[] = [];
  const good: File[] = [];
  for (const file of files) {
    const issue = photoProblem(file);
    if (issue) notes.push(files.length > 1 ? `${file.name}: ${issue}` : issue);
    else good.push(file);
  }
  const accepted = good.slice(0, Math.max(0, free));
  if (good.length > accepted.length) {
    notes.push(
      accepted.length === 0
        ? `This person already has ${MAX_PHOTOS} photos.`
        : `Only ${accepted.length} more photo${accepted.length === 1 ? "" : "s"} fit (${MAX_PHOTOS} per person), so the first ${accepted.length} ${accepted.length === 1 ? "is" : "are"} added.`,
    );
  }
  return { accepted, notes };
}

interface UploadJob {
  index: number;
  total: number;
  /** Object URL of the resized photo, once it is ready. */
  preview: string | null;
  percent: number;
}

/** The photo being uploaded: a thumbnail, "Uploading 2 of 3 · 45%", and a progress bar. */
function UploadPreview({ job }: { job: UploadJob }) {
  const label = job.total > 1 ? `photo ${job.index} of ${job.total}` : "photo";
  return (
    <figure className="flex w-28 flex-col gap-1" aria-live="polite">
      {job.preview ? (
        <img src={job.preview} alt={`Uploading ${label}`} className="h-28 w-28 rounded-md object-cover opacity-80" />
      ) : (
        <div className="h-28 w-28 rounded-md bg-sunken" aria-hidden="true" />
      )}
      <progress value={job.percent} max={100} aria-label={`Uploading ${label}`} className="h-2 w-28 accent-brand" />
      <figcaption className="text-sm text-ink-soft">
        {job.preview ? `Uploading${job.total > 1 ? ` ${job.index} of ${job.total}` : ""} · ${job.percent}%` : "Preparing…"}
      </figcaption>
    </figure>
  );
}

function MemberForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: FamilyMemberInput;
  submitLabel: string;
  busy: boolean;
  onSubmit: (input: FamilyMemberInput) => void;
  onCancel?: () => void;
}) {
  const known = (RELATIONS as readonly string[]).includes(initial.relation);
  const [name, setName] = useState(initial.name);
  const [choice, setChoice] = useState<string>(known || !initial.relation ? initial.relation || "Son" : OTHER);
  const [custom, setCustom] = useState(known ? "" : initial.relation);
  const [note, setNote] = useState(initial.note ?? "");

  const relation = choice === OTHER ? custom.trim() || OTHER : choice;
  const valid = name.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) onSubmit({ name: name.trim(), relation, note: note.trim() || null });
  }

  return (
    <form onSubmit={submit} aria-label={submitLabel} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Name</span>
          <input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} className="w-56 rounded-md border border-line-strong px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Relation</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="rounded-md border border-line-strong bg-surface px-3 py-2">
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {choice === OTHER && (
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Relation (your words)</span>
            <input
              value={custom}
              maxLength={40}
              placeholder="e.g. Neighbour"
              onChange={(e) => setCustom(e.target.value)}
              className="w-48 rounded-md border border-line-strong px-3 py-2"
            />
          </label>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Note (optional, read aloud to the patient)</span>
        <input
          value={note}
          maxLength={300}
          placeholder="e.g. Lives in Pune, visits on Sundays."
          onChange={(e) => setNote(e.target.value)}
          className="max-w-xl rounded-md border border-line-strong px-3 py-2"
        />
      </label>
      <div className="flex gap-3">
        <button type="submit" disabled={!valid || busy} className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted">
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

function MemberCard({ patientId, member }: { patientId: number; member: FamilyMember }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["family", patientId] });

  const update = useMutation({
    mutationFn: (input: FamilyMemberInput) => updateFamilyMember(patientId, member.id, input),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => deleteFamilyMember(patientId, member.id), onSuccess: refresh });
  // The photo being sent now (one at a time), and the ones still to send after a failure ("Try again").
  const [job, setJob] = useState<UploadJob | null>(null);
  const [failed, setFailed] = useState<File[] | null>(null);
  const removePhoto = useMutation({ mutationFn: (photoId: string) => deleteFamilyPhoto(patientId, member.id, photoId), onSuccess: refresh });

  async function uploadAll(files: File[]) {
    setFailed(null);
    for (const [i, file] of files.entries()) {
      const step = { index: i + 1, total: files.length };
      setJob({ ...step, preview: null, percent: 0 });
      const photo = await shrinkPhoto(file);
      const preview = URL.createObjectURL(photo);
      setJob({ ...step, preview, percent: 0 });
      try {
        await uploadFamilyPhoto(patientId, member.id, photo, (fraction) =>
          setJob((current) => (current ? { ...current, percent: Math.round(fraction * 100) } : current)),
        );
        refresh();
      } catch (error) {
        setProblem(`Could not upload ${files.length > 1 ? file.name : "the photo"}. ${describeRequestError(error)}`);
        setFailed(files.slice(i));
        return;
      } finally {
        URL.revokeObjectURL(preview);
        setJob(null);
      }
    }
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow choosing the same files again
    if (chosen.length === 0) return;
    const { accepted, notes } = pickPhotos(chosen, MAX_PHOTOS - member.photos.length);
    setProblem(notes.length ? notes.join(" ") : null);
    if (accepted.length) void uploadAll(accepted);
  }

  const busy = job !== null;
  const full = member.photos.length >= MAX_PHOTOS;

  return (
    <li className="rounded-lg border border-line bg-surface p-4" aria-label={member.name}>
      {editing ? (
        <MemberForm
          initial={{ name: member.name, relation: member.relation, note: member.note }}
          submitLabel="Save changes"
          busy={update.isPending}
          onSubmit={(input) => update.mutate(input)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1">
            <p className="text-lg font-semibold">
              {member.name} <span className="font-normal text-ink-muted">· {member.relation}</span>
            </p>
            {member.note && <p className="text-ink-soft">{member.note}</p>}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="text-brand-dark underline">
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete ${member.name} and all their photos?`)) remove.mutate();
            }}
            className="text-danger underline"
          >
            Delete
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        {member.photos.map((photo, i) => (
          <figure key={photo.id} className="flex w-28 flex-col gap-1">
            <AuthedImage src={photo.url} alt={`${member.name}, photo ${i + 1}`} className="h-28 w-28 rounded-md object-cover" />
            <button
              type="button"
              onClick={() => removePhoto.mutate(photo.id)}
              aria-label={`Remove ${member.name} photo ${i + 1}`}
              className="text-sm text-danger underline"
            >
              Remove
            </button>
          </figure>
        ))}
        {job && <UploadPreview job={job} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className={`rounded-md border border-line-strong px-3 py-1 ${full || busy ? "opacity-60" : "cursor-pointer hover:bg-sunken"}`}>
          {busy ? "Uploading…" : "Add photos"}
          <input type="file" accept="image/jpeg,image/png" multiple className="sr-only" disabled={full || busy} onChange={onFiles} />
        </label>
        <span className="text-ink-muted">
          {member.photos.length} / {MAX_PHOTOS} photos · JPG or PNG, up to 5 MB each
        </span>
      </div>
      {problem && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-danger">
            {problem}
          </p>
          {failed && !busy && (
            <button
              type="button"
              onClick={() => {
                setProblem(null);
                void uploadAll(failed);
              }}
              className="rounded-md border border-line-strong px-3 py-1 hover:bg-sunken"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function CaregiverFamily() {
  const patientId = Number(useParams().patientId);
  const queryClient = useQueryClient();
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const family = useQuery({ queryKey: ["family", patientId], queryFn: () => listFamily(patientId) });
  const patient = patients.data?.find((p) => p.id === patientId);
  const [formKey, setFormKey] = useState(0);

  const create = useMutation({
    mutationFn: (input: FamilyMemberInput) => createFamilyMember(patientId, input),
    onSuccess: () => {
      setFormKey((k) => k + 1);
      void queryClient.invalidateQueries({ queryKey: ["family", patientId] });
    },
  });

  return (
    <CaregiverLayout title={`Family photos${patient ? ` · ${patient.name}` : ""}`}>
      <Link to={`/caregiver/patients/${patientId}`} className="mb-4 inline-flex items-center gap-1 text-brand-dark underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to patient
      </Link>
      <p className="mb-4 text-ink-muted">
        These photos are private: they are only shown to this patient and their linked caregivers.
      </p>

      <section className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">Add a person</h2>
        <MemberForm key={formKey} initial={{ name: "", relation: "Son", note: null }} submitLabel="Add person" busy={create.isPending} onSubmit={(input) => create.mutate(input)} />
        {create.isError && (
          <p role="alert" className="mt-2 text-danger">
            Could not add the person.
          </p>
        )}
      </section>

      {family.isPending && <p className="text-ink-muted">Loading family…</p>}
      {family.isError && <LoadError message="Could not load the family list." onRetry={() => void family.refetch()} />}
      {family.isSuccess && family.data.length === 0 && <p className="text-ink-muted">No one added yet.</p>}
      {family.isSuccess && family.data.length > 0 && (
        <ul className="flex flex-col gap-4">
          {family.data.map((member) => (
            <MemberCard key={member.id} patientId={patientId} member={member} />
          ))}
        </ul>
      )}
    </CaregiverLayout>
  );
}
