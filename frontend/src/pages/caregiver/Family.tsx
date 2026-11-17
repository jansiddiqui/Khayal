import { ArrowLeft, ImagePlus, Images, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  createFamilyMember,
  deleteFamilyMember,
  deleteFamilyPhoto,
  describeRequestError,
  listFamily,
  listPatients,
  setElderConsent,
  updateFamilyMember,
  uploadFamilyPhoto,
  type FamilyMember,
  type FamilyMemberInput,
} from "../../api/client";
import { shrinkPhoto } from "../../api/photoResize";
import { AuthedImage } from "../../components/AuthedImage";
import { LoadError } from "../../components/caregiver/LoadError";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { Button } from "../../ui/Button";
import { SelectInput, TextInput } from "../../ui/Field";
import { calm, DURATION, useLessMotion } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { useUndoable } from "../../ui/undo";

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

/**
 * Choose photos by dropping them here or with "Add photos" (one or several). Highlights while a
 * file is dragged over it. The input stays the real control, so keyboard and screen readers work.
 */
function PhotoDrop({
  label,
  disabled,
  onFiles,
  note,
}: {
  label: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  note: string;
}) {
  const id = useId();
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files));
  };
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed px-3 py-2.5 transition-colors duration-150 ease-calm ${
        over ? "border-brand bg-brand-soft" : "border-line-strong/50 bg-desk"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <label
        htmlFor={id}
        className={`inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium transition-[transform,background-color,border-color] duration-150 ease-calm ${
          disabled ? "cursor-not-allowed" : "cursor-pointer hover:-translate-y-px hover:border-brand hover:bg-brand-soft active:scale-[0.97]"
        }`}
      >
        <ImagePlus aria-hidden="true" className="size-4 text-brand" />
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = ""; // allow choosing the same files again
          if (files.length) onFiles(files);
        }}
      />
      <span className="text-ink-muted">{over ? "Drop the photos here" : note}</span>
    </div>
  );
}

/** Sends photos one after another with a thumbnail and percentage; stops at a failure for "Try again". */
function usePhotoUploads(patientId: number, onSaved: (count: number) => void) {
  const queryClient = useQueryClient();
  const [job, setJob] = useState<UploadJob | null>(null);
  const [failed, setFailed] = useState<{ memberId: number; files: File[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function uploadAll(memberId: number, files: File[]) {
    setFailed(null);
    let saved = 0;
    for (const [i, file] of files.entries()) {
      const step = { index: i + 1, total: files.length };
      setJob({ ...step, preview: null, percent: 0 });
      const photo = await shrinkPhoto(file);
      const preview = URL.createObjectURL(photo);
      setJob({ ...step, preview, percent: 0 });
      try {
        await uploadFamilyPhoto(patientId, memberId, photo, (fraction) =>
          setJob((current) => (current ? { ...current, percent: Math.round(fraction * 100) } : current)),
        );
        saved += 1;
        void queryClient.invalidateQueries({ queryKey: ["family", patientId] });
      } catch (error) {
        setProblem(`Could not upload ${files.length > 1 ? file.name : "the photo"}. ${describeRequestError(error)}`);
        setFailed({ memberId, files: files.slice(i) });
        if (saved) onSaved(saved);
        return;
      } finally {
        URL.revokeObjectURL(preview);
        setJob(null);
      }
    }
    if (saved) onSaved(saved);
  }

  return { job, failed, problem, setProblem, uploadAll, busy: job !== null };
}

function MemberForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  children,
}: {
  initial: FamilyMemberInput;
  submitLabel: string;
  busy: boolean;
  onSubmit: (input: FamilyMemberInput) => void;
  onCancel?: () => void;
  children?: ReactNode;
}) {
  const known = (RELATIONS as readonly string[]).includes(initial.relation);
  const [name, setName] = useState(initial.name);
  const [choice, setChoice] = useState<string>(known || !initial.relation ? initial.relation || "Son" : OTHER);
  const [custom, setCustom] = useState(known ? "" : initial.relation);
  const [note, setNote] = useState(initial.note ?? "");
  const [tried, setTried] = useState(false);

  const relation = choice === OTHER ? custom.trim() || OTHER : choice;
  const valid = name.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (valid) onSubmit({ name: name.trim(), relation, note: note.trim() || null });
  }

  return (
    <form onSubmit={submit} aria-label={submitLabel} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <TextInput
          label="Name"
          value={name}
          maxLength={80}
          required
          onChange={(e) => setName(e.target.value)}
          error={valid ? null : "Write their name, as the patient knows them."}
          forceError={tried}
          wrapperClassName="w-56"
          autoComplete="off"
        />
        <SelectInput label="Relation" value={choice} onChange={(e) => setChoice(e.target.value)} wrapperClassName="w-44">
          {RELATIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectInput>
        {choice === OTHER && (
          <TextInput
            label="Relation (your words)"
            value={custom}
            maxLength={40}
            placeholder="e.g. Neighbour"
            onChange={(e) => setCustom(e.target.value)}
            wrapperClassName="w-48"
          />
        )}
      </div>
      <TextInput
        label="Note (optional, read aloud to the patient)"
        value={note}
        maxLength={300}
        placeholder="e.g. Lives in Pune, visits on Sundays."
        onChange={(e) => setNote(e.target.value)}
        wrapperClassName="max-w-xl"
      />
      {children}
      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={!valid} loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

/** Photos queued in the "Add a person" form, before the person exists: thumbnails with Remove. */
function QueuedPhotos({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-3" aria-label="Photos to add">
      {files.map((file, i) => (
        <li key={`${file.name}-${i}`} className="relative">
          <img src={urls[i]} alt={file.name} className="h-20 w-20 rounded-md object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${file.name}`}
            className="absolute -top-2 -right-2 rounded-full border border-line bg-surface p-1 text-ink-soft shadow-lift transition-colors hover:text-danger"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function MemberCard({
  patientId,
  patientFirstName,
  photosOn,
  member,
  onDelete,
}: {
  patientId: number;
  patientFirstName: string;
  photosOn: boolean;
  member: FamilyMember;
  onDelete: (member: FamilyMember) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const undoable = useUndoable();
  const [editing, setEditing] = useState(false);
  const key = ["family", patientId] as const;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const uploads = usePhotoUploads(patientId, (n) => toast.show({ message: n === 1 ? "Photo saved." : `${n} photos saved.` }));

  // Optimistic: the card shows the new name at once and goes back if the server refuses.
  const update = useMutation({
    mutationFn: (input: FamilyMemberInput) => updateFamilyMember(patientId, member.id, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<FamilyMember[]>(key);
      queryClient.setQueryData<FamilyMember[]>(key, before?.map((m) => (m.id === member.id ? { ...m, ...input } : m)));
      setEditing(false);
      return { before };
    },
    onError: (_e, _input, context) => {
      queryClient.setQueryData(key, context?.before);
      toast.show({ tone: "error", message: `Could not save the change to ${member.name}. Try again.` });
    },
    onSuccess: (saved) => toast.show({ message: `Saved: ${saved.name}.` }),
    onSettled: refresh,
  });

  function removePhoto(photoId: string, index: number) {
    const before = queryClient.getQueryData<FamilyMember[]>(key);
    undoable({
      message: `Photo ${index + 1} of ${member.name} removed.`,
      apply: () =>
        queryClient.setQueryData<FamilyMember[]>(
          key,
          before?.map((m) => (m.id === member.id ? { ...m, photos: m.photos.filter((p) => p.id !== photoId) } : m)),
        ),
      revert: () => queryClient.setQueryData(key, before),
      commit: () => deleteFamilyPhoto(patientId, member.id, photoId),
      failureMessage: "Could not remove the photo. It is back.",
      onCommitted: refresh,
    });
  }

  function onFiles(chosen: File[]) {
    const { accepted, notes } = pickPhotos(chosen, MAX_PHOTOS - member.photos.length);
    uploads.setProblem(notes.length ? notes.join(" ") : null);
    if (accepted.length) void uploads.uploadAll(member.id, accepted);
  }

  const full = member.photos.length >= MAX_PHOTOS;

  return (
    <div className="rounded-lg border border-line bg-surface p-4 transition-shadow duration-150 hover:shadow-lift">
      {editing ? (
        <MemberForm
          initial={{ name: member.name, relation: member.relation, note: member.note }}
          submitLabel="Save changes"
          busy={update.isPending}
          onSubmit={(input) => update.mutate(input)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">
              {member.name} <span className="font-normal text-ink-muted">· {member.relation}</span>
            </p>
            {member.note && <p className="text-ink-soft">{member.note}</p>}
          </div>
          <Button size="sm" variant="quiet" icon={<Pencil />} onClick={() => setEditing(true)} aria-label={`Edit ${member.name}`}>
            Edit
          </Button>
          <Button size="sm" variant="danger-quiet" icon={<Trash2 />} onClick={() => onDelete(member)} aria-label={`Delete ${member.name}`}>
            Delete
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        {member.photos.map((photo, i) => (
          <figure key={photo.id} className="group flex w-28 flex-col gap-1">
            <AuthedImage src={photo.url} alt={`${member.name}, photo ${i + 1}`} className="h-28 w-28 rounded-md object-cover" />
            <Button
              size="sm"
              variant="danger-quiet"
              onClick={() => removePhoto(photo.id, i)}
              aria-label={`Remove ${member.name} photo ${i + 1}`}
              className="self-start"
            >
              Remove
            </Button>
          </figure>
        ))}
        {uploads.job && <UploadPreview job={uploads.job} />}
      </div>
      {photosOn && member.photos.length === 0 && !uploads.job && (
        <p className="mt-2 text-accent-strong">
          Add a photo so {patientFirstName} can see {member.name} in “Who is this?”.
        </p>
      )}
      {photosOn && (
        <div className="mt-3">
          <PhotoDrop
            label={uploads.busy ? "Uploading…" : "Add photos"}
            disabled={full || uploads.busy}
            onFiles={onFiles}
            note={`${member.photos.length} / ${MAX_PHOTOS} photos · JPG or PNG, up to 5 MB each · or drop them here`}
          />
        </div>
      )}
      {uploads.problem && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-danger">
            {uploads.problem}
          </p>
          {uploads.failed && !uploads.busy && (
            <Button
              size="sm"
              onClick={() => {
                uploads.setProblem(null);
                void uploads.uploadAll(uploads.failed!.memberId, uploads.failed!.files);
              }}
            >
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** "Add a person", with their photos chosen in the same form (when photos are on). */
function AddPerson({ patientId, photosOn, onDone }: { patientId: number; photosOn: boolean; onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formKey, setFormKey] = useState(0);
  const [queued, setQueued] = useState<File[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const uploads = usePhotoUploads(patientId, () => undefined);

  const create = useMutation({
    mutationFn: (input: FamilyMemberInput) => createFamilyMember(patientId, input),
    onSuccess: async (member) => {
      void queryClient.invalidateQueries({ queryKey: ["family", patientId] });
      const photos = queued;
      setQueued([]);
      setFormKey((k) => k + 1);
      if (photos.length) await uploads.uploadAll(member.id, photos);
      toast.show({
        message: photos.length
          ? `${member.name} added with ${photos.length === 1 ? "a photo" : `${photos.length} photos`}.`
          : `${member.name} added.`,
      });
      onDone();
    },
    onError: () => toast.show({ tone: "error", message: "Could not add the person. Try again." }),
  });

  return (
    <MemberForm
      key={formKey}
      initial={{ name: "", relation: "Son", note: null }}
      submitLabel="Add person"
      busy={create.isPending || uploads.busy}
      onSubmit={(input) => create.mutate(input)}
      onCancel={onDone}
    >
      {photosOn && (
        <div className="flex flex-col gap-2">
          <span className="font-medium text-ink-soft">Photos (optional)</span>
          <PhotoDrop
            label="Choose photos"
            disabled={create.isPending || uploads.busy}
            note={`Up to ${MAX_PHOTOS} · JPG or PNG · or drop them here`}
            onFiles={(files) => {
              const { accepted, notes: why } = pickPhotos(files, MAX_PHOTOS - queued.length);
              setNotes(why.length ? why.join(" ") : null);
              setQueued((q) => [...q, ...accepted]);
            }}
          />
          <QueuedPhotos files={queued} onRemove={(i) => setQueued((q) => q.filter((_, j) => j !== i))} />
          {uploads.job && <UploadPreview job={uploads.job} />}
          {(notes || uploads.problem) && (
            <p role="alert" className="text-danger">
              {notes ?? uploads.problem}
            </p>
          )}
        </div>
      )}
    </MemberForm>
  );
}

export function CaregiverFamily() {
  const patientId = Number(useParams().patientId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const undoable = useUndoable();
  const less = useLessMotion();
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const key = ["family", patientId] as const;
  const family = useQuery({ queryKey: key, queryFn: () => listFamily(patientId) });
  const patient = patients.data?.find((p) => p.id === patientId);
  const first = patient?.name.split(" ")[0] ?? "the patient";
  const photosOn = patient?.photos_enabled ?? false;
  const [adding, setAdding] = useState(false);
  const none = family.isSuccess && family.data.length === 0;

  const turnOnPhotos = useMutation({
    mutationFn: () => setElderConsent(patientId, "photos", true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.show({ message: `Family photos are on for ${first}.` });
    },
    onError: () => toast.show({ tone: "error", message: "Could not turn on family photos. Try again." }),
  });

  function deletePerson(member: FamilyMember) {
    const before = queryClient.getQueryData<FamilyMember[]>(key);
    undoable({
      message: `${member.name} deleted, with ${member.photos.length === 1 ? "1 photo" : `${member.photos.length} photos`}.`,
      apply: () => queryClient.setQueryData<FamilyMember[]>(key, before?.filter((m) => m.id !== member.id)),
      revert: () => queryClient.setQueryData(key, before),
      commit: () => deleteFamilyMember(patientId, member.id),
      failureMessage: `Could not delete ${member.name}. They are back in the list.`,
      onCommitted: () => void queryClient.invalidateQueries({ queryKey: key }),
    });
  }

  return (
    <CaregiverLayout title={`Family photos${patient ? ` · ${patient.name}` : ""}`}>
      <Link to={`/caregiver/patients/${patientId}`} className="mb-4 inline-flex items-center gap-1 text-brand-dark underline-offset-2 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to patient
      </Link>
      <p className="mb-4 text-ink-muted">
        These photos are private: they are only shown to this patient and their linked caregivers.
      </p>

      {patients.isSuccess && !photosOn && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-accent bg-accent-soft px-4 py-3">
          <Images aria-hidden="true" className="size-5 shrink-0 text-accent-strong" />
          <p className="min-w-0 flex-1">
            Family photos are off for {first}. Turn them on to add photos for “Who is this?”. This records your consent;
            turning them off later deletes every photo.
          </p>
          <Button variant="primary" size="sm" loading={turnOnPhotos.isPending} onClick={() => turnOnPhotos.mutate()}>
            Turn on family photos
          </Button>
        </div>
      )}

      <section className="mb-6 rounded-lg border border-line bg-surface p-4" aria-labelledby="add-person-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {adding || none ? (
            <h2 id="add-person-title" className="text-lg font-semibold">
              Add a person
            </h2>
          ) : (
            <p id="add-person-title" className="text-ink-soft">
              Add the people {first} sees often, each with a photo.
            </p>
          )}
          {!(adding || none) && (
            <Button variant="primary" size="sm" icon={<UserPlus />} onClick={() => setAdding(true)}>
              Add a person
            </Button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {(adding || none) && (
            <motion.div
              key="add"
              initial={less ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={calm(DURATION.base)}
              className="mt-3"
            >
              <AddPerson patientId={patientId} photosOn={photosOn} onDone={() => setAdding(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {family.isPending && (
        <div role="status" aria-busy="true" aria-label="Loading family" className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}
      {family.isError && <LoadError message="Could not load the family list." onRetry={() => void family.refetch()} />}
      {none && (
        <EmptyState icon={<Images />} title="No one added yet">
          Add the people {first} sees often, with a photo each. They appear in “Who is this?” and in the daily “About Today”
          game once three people have photos.
        </EmptyState>
      )}
      {family.isSuccess && family.data.length > 0 && (
        <ul className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {family.data.map((member) => (
              <motion.li
                key={member.id}
                aria-label={member.name}
                layout={!less}
                initial={less ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={calm(DURATION.base)}
              >
                <MemberCard patientId={patientId} patientFirstName={first} photosOn={photosOn} member={member} onDelete={deletePerson} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </CaregiverLayout>
  );
}
