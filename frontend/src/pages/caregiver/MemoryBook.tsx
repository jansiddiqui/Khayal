import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookHeart, ImagePlus, Mic, Pencil, Play, Plus, Square, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  addMemoryPhoto,
  createMemory,
  deleteMemory,
  errorDetail,
  fetchPhotoBlob,
  listMemories,
  listPatients,
  removeMemoryPhoto,
  removeMemoryVoice,
  setMemoryVoice,
  updateMemory,
  type Memory,
  type Patient,
} from "../../api/client";
import { AuthedImage } from "../../components/AuthedImage";
import { CaregiverLayout } from "../../components/CaregiverLayout";
import { LoadError } from "../../components/caregiver/LoadError";
import { Button } from "../../ui/Button";
import { TextInput } from "../../ui/Field";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState } from "../../ui/States";
import { useRecorder, type Recording } from "../../voice/useRecorder";

const MAX_PHOTOS = 5;
const VOICE_LIMIT_MS = 5 * 60 * 1000;
const length = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Record a short family voice note in the browser (up to 5 minutes; it stops by itself then). */
function VoiceNoteRecorder({ onRecorded }: { onRecorded: (r: Recording) => void }) {
  const rec = useRecorder(VOICE_LIMIT_MS);
  useEffect(() => {
    if (rec.state.kind === "finished") {
      onRecorded(rec.state.recording);
      rec.reset();
    }
  }, [rec, onRecorded]);
  if (rec.state.kind === "denied") return <p className="text-danger">The microphone is blocked. Allow it in the browser and try again.</p>;
  const recording = rec.state.kind === "recording" || rec.state.kind === "starting";
  return (
    <div className="flex items-center gap-3">
      {recording ? (
        <Button size="sm" icon={<Square />} onClick={rec.stop}>
          Stop
        </Button>
      ) : (
        <Button size="sm" icon={<Mic />} onClick={() => void rec.start()}>
          Record a voice note
        </Button>
      )}
      {recording && (
        <span className="flex items-center gap-2 text-ink-soft" aria-live="polite">
          Recording
          <span className="h-2 w-24 rounded-full bg-sunken" aria-hidden="true">
            <span className="block h-2 rounded-full bg-brand" style={{ width: `${Math.round(rec.level * 100)}%` }} />
          </span>
        </span>
      )}
    </div>
  );
}

function VoicePlayer({ url, ms }: { url: string; ms: number | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const load = useMutation({ mutationFn: () => fetchPhotoBlob(url), onSuccess: (blob) => setSrc(URL.createObjectURL(blob)) });
  useEffect(() => () => {
    if (src) URL.revokeObjectURL(src);
  }, [src]);
  if (src) return <audio controls autoPlay src={src} className="h-9 max-w-full" aria-label="Family voice note" />;
  return (
    <Button size="sm" variant="quiet" icon={<Play />} loading={load.isPending} onClick={() => load.mutate()}>
      Play voice note{ms ? ` (${length(ms)})` : ""}
    </Button>
  );
}

function NewMemory({ patient, onDone }: { patient: Patient; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<Recording | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      let memory = await createMemory(patient.id, title, story);
      for (const photo of photos) memory = await addMemoryPhoto(patient.id, memory.id, photo);
      if (voice) memory = await setMemoryVoice(patient.id, memory.id, voice.audio, voice.durationMs);
      return memory;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memories", patient.id] });
      onDone();
    },
  });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() && photos.length > 0) save.mutate();
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4" aria-labelledby="new-memory-title">
      <h2 id="new-memory-title" className="text-lg font-semibold">
        A new memory
      </h2>
      <TextInput label="Title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} hint="For example: “Our wedding, Lucknow 1972”." />
      <label className="flex flex-col gap-1">
        <span className="font-medium">The story (optional)</span>
        <textarea rows={4} maxLength={2000} value={story} onChange={(e) => setStory(e.target.value)} className="rounded-md border border-line-strong p-2" />
        <span className="text-sm text-ink-muted">A few warm sentences, read aloud to {patient.name} when there is no voice note.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Photos (1 to {MAX_PHOTOS})</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))}
        />
        {photos.length > 0 && <span className="text-sm text-ink-muted">{photos.length} chosen</span>}
      </label>
      {patient.voice_task_enabled ? (
        <div className="flex flex-col gap-1">
          <span className="font-medium">Your voice telling the story (optional)</span>
          {voice ? (
            <span className="flex items-center gap-3">
              Voice note ready ({length(voice.durationMs)})
              <Button size="sm" variant="quiet" icon={<X />} onClick={() => setVoice(null)}>
                Remove
              </Button>
            </span>
          ) : (
            <VoiceNoteRecorder onRecorded={setVoice} />
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Voice notes need the voice opt-in on {patient.name}'s page.</p>
      )}
      {save.isError && (
        <p role="alert" className="text-danger">
          {errorDetail(save.error) ?? "Could not save the memory. Try again."}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!title.trim() || photos.length === 0}>
          Save memory
        </Button>
        <Button type="button" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function MemoryCard({ patient, memory }: { patient: Patient; memory: Memory }) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["memories", patient.id] });
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(memory.title);
  const [story, setStory] = useState(memory.story);
  const edit = useMutation({ mutationFn: () => updateMemory(patient.id, memory.id, title, story), onSuccess: () => { setEditing(false); refresh(); } });
  const addPhoto = useMutation({ mutationFn: (f: File) => addMemoryPhoto(patient.id, memory.id, f), onSuccess: refresh });
  const dropPhoto = useMutation({ mutationFn: (id: string) => removeMemoryPhoto(patient.id, memory.id, id), onSuccess: refresh });
  const voice = useMutation({ mutationFn: (r: Recording) => setMemoryVoice(patient.id, memory.id, r.audio, r.durationMs), onSuccess: refresh });
  const dropVoice = useMutation({ mutationFn: () => removeMemoryVoice(patient.id, memory.id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteMemory(patient.id, memory.id), onSuccess: refresh });
  const error = [edit, addPhoto, dropPhoto, voice, dropVoice, remove].find((m) => m.isError)?.error;

  return (
    <article aria-labelledby={`memory-${memory.id}`} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            edit.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <TextInput label="Title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="flex flex-col gap-1">
            <span className="font-medium">The story</span>
            <textarea rows={4} maxLength={2000} value={story} onChange={(e) => setStory(e.target.value)} className="rounded-md border border-line-strong p-2" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" loading={edit.isPending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={`memory-${memory.id}`} className="text-lg font-semibold">
              {memory.title}
            </h3>
            {memory.story ? <p className="whitespace-pre-wrap text-ink-soft">{memory.story}</p> : <p className="text-ink-muted">No story yet.</p>}
          </div>
          <Button size="sm" variant="quiet" icon={<Pencil />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}

      <ul className="flex flex-wrap gap-2" aria-label="Photos">
        {memory.photos.map((p, i) => (
          <li key={p.id} className="relative">
            <AuthedImage src={p.url} alt={`Photo ${i + 1} of ${memory.title}`} className="size-24 rounded-md object-cover" />
            <button
              type="button"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => dropPhoto.mutate(p.id)}
              className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border border-line bg-surface hover:bg-danger-soft"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </li>
        ))}
        {memory.photos.length < MAX_PHOTOS && (
          <li>
            <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-sm text-ink-soft hover:bg-sunken">
              <ImagePlus aria-hidden="true" className="size-5" />
              {addPhoto.isPending ? "Adding…" : "Add photo"}
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addPhoto.mutate(f);
                  e.target.value = "";
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {memory.photos.length === 0 && <p className="text-sm text-accent-strong">Add a photo: {patient.name} sees a memory only once it has one.</p>}

      <div className="flex flex-wrap items-center gap-3">
        {memory.voice_url ? (
          <>
            <VoicePlayer url={memory.voice_url} ms={memory.voice_ms} />
            <Button size="sm" variant="quiet" icon={<Trash2 />} loading={dropVoice.isPending} onClick={() => dropVoice.mutate()}>
              Remove voice note
            </Button>
          </>
        ) : patient.voice_task_enabled ? (
          voice.isPending ? <span className="text-ink-muted">Saving the voice note…</span> : <VoiceNoteRecorder onRecorded={(r) => voice.mutate(r)} />
        ) : null}
      </div>

      {confirmDelete ? (
        <div role="alertdialog" aria-label="Delete this memory" className="flex flex-wrap items-center gap-3 rounded-md border border-danger bg-danger-soft p-3">
          <p className="min-w-0 flex-1">This deletes the memory with its photos and voice note. It cannot be undone.</p>
          <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete memory
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="quiet" icon={<Trash2 />} className="self-start" onClick={() => setConfirmDelete(true)}>
          Delete memory…
        </Button>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {errorDetail(error) ?? "That didn't work. Try again."}
        </p>
      )}
    </article>
  );
}

/** The memory book (Round 2 batch 4): pages for the elder's "Memories" (photos, a story, a voice note). */
export function MemoryBook() {
  const patientId = Number(useParams().patientId);
  const patients = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const patient = patients.data?.find((p) => p.id === patientId);
  const memories = useQuery({ queryKey: ["memories", patientId], queryFn: () => listMemories(patientId), enabled: !!patient });
  const [adding, setAdding] = useState(false);

  return (
    <CaregiverLayout title={patient ? `Memory book · ${patient.name}` : "Memory book"}>
      <Link to={`/caregiver/patients/${patientId}`} className="mb-4 inline-flex items-center gap-1 rounded text-brand-dark underline underline-offset-2">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to their page
      </Link>
      {patients.isError && <LoadError message="Could not load this person." onRetry={() => void patients.refetch()} />}
      {patient && !patient.photos_enabled && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2">The memory book uses photos, so it needs the family photos opt-in for {patient.name}.</p>
          <Link to={`/caregiver/patients/${patientId}#privacy`} className="text-brand-dark underline underline-offset-2">
            Turn on family photos
          </Link>
        </div>
      )}
      {patient && patient.photos_enabled && (
        <div className="flex max-w-3xl flex-col gap-4">
          <p className="text-ink-soft">
            Old photos with a short story, for {patient.name} to look through under “Who is this?” → Memories. The story is read aloud, or
            your recorded voice is played. Only the people linked to {patient.name} can see them.
          </p>
          {adding ? (
            <NewMemory patient={patient} onDone={() => setAdding(false)} />
          ) : (
            <Button variant="primary" icon={<Plus />} className="self-start" onClick={() => setAdding(true)}>
              Add a memory
            </Button>
          )}
          {memories.isPending && <Skeleton className="h-40 w-full" />}
          {memories.isError && <LoadError message="Could not load the memory book." onRetry={() => void memories.refetch()} />}
          {memories.isSuccess && memories.data.length === 0 && !adding && (
            <EmptyState icon={<BookHeart />} title="No memories yet">
              Start with one favourite photo and a few sentences about it.
            </EmptyState>
          )}
          {memories.data?.map((m) => (
            <MemoryCard key={m.id} patient={patient} memory={m} />
          ))}
        </div>
      )}
    </CaregiverLayout>
  );
}
