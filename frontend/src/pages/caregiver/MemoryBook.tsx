import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookHeart, ImagePlus, Mic, Pencil, Play, Plus, Square, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  addMemoryPhoto,
  createMemory,
  deleteMemory,
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
import { serverDetail, t } from "../../t";

const w = t.memoryBook;

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
  if (rec.state.kind === "denied") return <p className="text-danger">{w.recorder.blocked}</p>;
  const recording = rec.state.kind === "recording" || rec.state.kind === "starting";
  return (
    <div className="flex items-center gap-3">
      {recording ? (
        <Button size="sm" icon={<Square />} onClick={rec.stop}>
          {w.recorder.stop}
        </Button>
      ) : (
        <Button size="sm" icon={<Mic />} onClick={() => void rec.start()}>
          {w.recorder.record}
        </Button>
      )}
      {recording && (
        <span className="flex items-center gap-2 text-ink-soft" aria-live="polite">
          {w.recorder.recording}
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
  if (src) return <audio controls autoPlay src={src} className="h-9 max-w-full" aria-label={w.player.label} />;
  return (
    <Button size="sm" variant="quiet" icon={<Play />} loading={load.isPending} onClick={() => load.mutate()}>
      {w.player.play(ms ? length(ms) : null)}
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
        {w.form.heading}
      </h2>
      <TextInput label={w.form.title} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} hint={w.form.titleHint} />
      <label className="flex flex-col gap-1">
        <span className="font-medium">{w.form.storyOptional}</span>
        <textarea rows={4} maxLength={2000} value={story} onChange={(e) => setStory(e.target.value)} className="rounded-md border border-line-strong p-2" />
        <span className="text-sm text-ink-muted">{w.form.storyHint(patient.name)}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{w.form.photos(MAX_PHOTOS)}</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))}
        />
        {photos.length > 0 && <span className="text-sm text-ink-muted">{w.form.chosen(photos.length)}</span>}
      </label>
      {patient.voice_task_enabled ? (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{w.form.voice}</span>
          {voice ? (
            <span className="flex items-center gap-3">
              {w.form.voiceReady(length(voice.durationMs))}
              <Button size="sm" variant="quiet" icon={<X />} onClick={() => setVoice(null)}>
                {w.form.remove}
              </Button>
            </span>
          ) : (
            <VoiceNoteRecorder onRecorded={setVoice} />
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{w.form.voiceNeedsOptIn(patient.name)}</p>
      )}
      {save.isError && (
        <p role="alert" className="text-danger">
          {serverDetail(save.error) ?? w.form.saveFailed}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!title.trim() || photos.length === 0}>
          {w.form.save}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone}>
          {w.form.cancel}
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
          <TextInput label={w.form.title} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="flex flex-col gap-1">
            <span className="font-medium">{w.card.story}</span>
            <textarea rows={4} maxLength={2000} value={story} onChange={(e) => setStory(e.target.value)} className="rounded-md border border-line-strong p-2" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" loading={edit.isPending}>
              {w.card.save}
            </Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setEditing(false)}>
              {w.card.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={`memory-${memory.id}`} className="text-lg font-semibold">
              {memory.title}
            </h3>
            {memory.story ? <p className="whitespace-pre-wrap text-ink-soft">{memory.story}</p> : <p className="text-ink-muted">{w.card.noStory}</p>}
          </div>
          <Button size="sm" variant="quiet" icon={<Pencil />} onClick={() => setEditing(true)}>
            {w.card.edit}
          </Button>
        </div>
      )}

      <ul className="flex flex-wrap gap-2" aria-label={w.card.photos}>
        {memory.photos.map((p, i) => (
          <li key={p.id} className="relative">
            <AuthedImage src={p.url} alt={w.card.photoAlt(i + 1, memory.title)} className="size-24 rounded-md object-cover" />
            <button
              type="button"
              aria-label={w.card.removePhoto(i + 1)}
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
              {addPhoto.isPending ? w.card.adding : w.card.addPhoto}
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
      {memory.photos.length === 0 && <p className="text-sm text-accent-strong">{w.card.needsPhoto(patient.name)}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {memory.voice_url ? (
          <>
            <VoicePlayer url={memory.voice_url} ms={memory.voice_ms} />
            <Button size="sm" variant="quiet" icon={<Trash2 />} loading={dropVoice.isPending} onClick={() => dropVoice.mutate()}>
              {w.card.removeVoice}
            </Button>
          </>
        ) : patient.voice_task_enabled ? (
          voice.isPending ? <span className="text-ink-muted">{w.card.savingVoice}</span> : <VoiceNoteRecorder onRecorded={(r) => voice.mutate(r)} />
        ) : null}
      </div>

      {confirmDelete ? (
        <div role="alertdialog" aria-label={w.card.deleteDialog} className="flex flex-wrap items-center gap-3 rounded-md border border-danger bg-danger-soft p-3">
          <p className="min-w-0 flex-1">{w.card.deleteWarning}</p>
          <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            {w.card.deleteConfirm}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setConfirmDelete(false)}>
            {w.card.keep}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="quiet" icon={<Trash2 />} className="self-start" onClick={() => setConfirmDelete(true)}>
          {w.card.delete}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {serverDetail(error) ?? w.card.failed}
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
    <CaregiverLayout title={w.page.title(patient?.name ?? null)}>
      <Link to={`/caregiver/patients/${patientId}`} className="mb-4 inline-flex items-center gap-1 rounded text-brand-dark underline underline-offset-2">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {w.page.back}
      </Link>
      {patients.isError && <LoadError message={w.page.personFailed} onRetry={() => void patients.refetch()} />}
      {patient && !patient.photos_enabled && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2">{w.page.needsPhotos(patient.name)}</p>
          <Link to={`/caregiver/patients/${patientId}#privacy`} className="text-brand-dark underline underline-offset-2">
            {w.page.turnOnPhotos}
          </Link>
        </div>
      )}
      {patient && patient.photos_enabled && (
        <div className="flex max-w-3xl flex-col gap-4">
          <p className="text-ink-soft">
            {w.page.intro(patient.name)}
          </p>
          {adding ? (
            <NewMemory patient={patient} onDone={() => setAdding(false)} />
          ) : (
            <Button variant="primary" icon={<Plus />} className="self-start" onClick={() => setAdding(true)}>
              {w.page.add}
            </Button>
          )}
          {memories.isPending && <Skeleton className="h-40 w-full" />}
          {memories.isError && <LoadError message={w.page.loadFailed} onRetry={() => void memories.refetch()} />}
          {memories.isSuccess && memories.data.length === 0 && !adding && (
            <EmptyState icon={<BookHeart />} title={w.page.emptyTitle}>
              {w.page.emptyBody}
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
