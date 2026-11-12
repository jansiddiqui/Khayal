import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  createFamilyMember,
  deleteFamilyMember,
  deleteFamilyPhoto,
  errorDetail,
  listFamily,
  listPatients,
  updateFamilyMember,
  uploadFamilyPhoto,
  type FamilyMember,
  type FamilyMemberInput,
} from "../../api/client";
import { AuthedImage } from "../../components/AuthedImage";
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
          <span className="text-gray-700">Name</span>
          <input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} className="w-56 rounded-md border border-gray-400 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-700">Relation</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="rounded-md border border-gray-400 bg-white px-3 py-2">
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {choice === OTHER && (
          <label className="flex flex-col gap-1">
            <span className="text-gray-700">Relation (your words)</span>
            <input
              value={custom}
              maxLength={40}
              placeholder="e.g. Neighbour"
              onChange={(e) => setCustom(e.target.value)}
              className="w-48 rounded-md border border-gray-400 px-3 py-2"
            />
          </label>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-gray-700">Note (optional, read aloud to the patient)</span>
        <input
          value={note}
          maxLength={300}
          placeholder="e.g. Lives in Pune, visits on Sundays."
          onChange={(e) => setNote(e.target.value)}
          className="max-w-xl rounded-md border border-gray-400 px-3 py-2"
        />
      </label>
      <div className="flex gap-3">
        <button type="submit" disabled={!valid || busy} className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60">
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
  const upload = useMutation({
    mutationFn: (file: File) => uploadFamilyPhoto(patientId, member.id, file),
    onSuccess: refresh,
    onError: (error) => setProblem(errorDetail(error) ?? "Could not upload the photo."),
  });
  const removePhoto = useMutation({ mutationFn: (photoId: string) => deleteFamilyPhoto(patientId, member.id, photoId), onSuccess: refresh });

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;
    const issue = photoProblem(file);
    setProblem(issue);
    if (!issue) upload.mutate(file);
  }

  const full = member.photos.length >= MAX_PHOTOS;

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4" aria-label={member.name}>
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
              {member.name} <span className="font-normal text-gray-600">· {member.relation}</span>
            </p>
            {member.note && <p className="text-gray-700">{member.note}</p>}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="text-brand-dark underline">
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete ${member.name} and all their photos?`)) remove.mutate();
            }}
            className="text-red-700 underline"
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
              className="text-sm text-red-700 underline"
            >
              Remove
            </button>
          </figure>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className={`rounded-md border border-gray-400 px-3 py-1 ${full ? "opacity-60" : "cursor-pointer hover:bg-gray-100"}`}>
          {upload.isPending ? "Uploading…" : "Add photo"}
          <input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={full || upload.isPending} onChange={onFile} />
        </label>
        <span className="text-gray-600">
          {member.photos.length} / {MAX_PHOTOS} photos · JPG or PNG, up to 5 MB
        </span>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-red-700">
          {problem}
        </p>
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
      <p className="mb-4 text-gray-600">
        These photos are private: they are only shown to this patient and their linked caregivers.
      </p>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Add a person</h2>
        <MemberForm key={formKey} initial={{ name: "", relation: "Son", note: null }} submitLabel="Add person" busy={create.isPending} onSubmit={(input) => create.mutate(input)} />
        {create.isError && (
          <p role="alert" className="mt-2 text-red-700">
            Could not add the person.
          </p>
        )}
      </section>

      {family.isPending && <p className="text-gray-600">Loading family…</p>}
      {family.isError && <p className="text-red-700">Could not load the family list.</p>}
      {family.isSuccess && family.data.length === 0 && <p className="text-gray-600">No one added yet.</p>}
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
