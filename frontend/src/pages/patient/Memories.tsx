import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RotateCcw, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { fetchPhotoBlob, listMemories, type Memory } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AuthedImage } from "../../components/AuthedImage";
import { BigButton } from "../../components/BigButton";
import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";
import { PeopleMemoriesSwitch } from "../../components/PeopleMemoriesSwitch";
import { copy } from "../../copy";
import { useReadAloud } from "../../readAloud/ReadAloudContext";
import { useFeedback } from "../../ui/feedback";
import { pressable } from "../../ui/motion";
import { Busy, Skeleton } from "../../ui/Skeleton";

/** Plays the family's voice note, or reads the story aloud when there is none. */
function useListen(memory: Memory) {
  const { speak, cancel } = useReadAloud();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(
    () => () => {
      audio.current?.pause();
      cancel();
    },
    [memory.id, cancel],
  );

  async function start() {
    if (memory.voice_url) {
      const blob = await fetchPhotoBlob(memory.voice_url);
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      audio.current = el;
      el.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      setPlaying(true);
      await el.play().catch(() => setPlaying(false));
    } else {
      setPlaying(true);
      speak(`${memory.title}. ${memory.story}`, { force: true, onEnd: () => setPlaying(false) });
    }
  }

  function stop() {
    audio.current?.pause();
    cancel();
    setPlaying(false);
  }

  return { playing, start, stop };
}

function MemoryPage({ memory, index, total, onNext, onBack }: { memory: Memory; index: number; total: number; onNext: () => void; onBack: () => void }) {
  const m = copy.memories;
  const { cue } = useFeedback();
  const [photo, setPhoto] = useState(0);
  const listen = useListen(memory);
  useEffect(() => setPhoto(0), [memory.id]);
  const current = memory.photos[photo] ?? memory.photos[0];

  return (
    <Layout title={memory.title} spoken={memory.title} compact>
      {current && (
        <button
          type="button"
          onClick={() => {
            if (memory.photos.length < 2) return;
            cue("tap");
            setPhoto((p) => (p + 1) % memory.photos.length);
          }}
          aria-label={memory.photos.length > 1 ? `${m.photoOf(photo + 1, memory.photos.length)}. ${m.nextPhoto}` : memory.title}
          className={`flex min-h-0 shrink justify-center rounded-2xl ${memory.photos.length > 1 ? pressable : ""}`}
        >
          <AuthedImage src={current.url} alt="" className="aspect-[4/3] max-h-[34dvh] w-full max-w-[600px] rounded-2xl bg-sunken object-contain" />
        </button>
      )}
      {/* The heading is for screen readers in play mode; the title is shown here, under the photo. */}
      <p aria-hidden="true" className="text-3xl font-bold leading-tight">
        {memory.title}
      </p>
      {memory.photos.length > 1 && (
        <p className="text-xl text-ink-soft">
          {m.photoOf(photo + 1, memory.photos.length)} · {m.nextPhoto}
        </p>
      )}
      {memory.story && <p className="min-h-0 shrink overflow-y-auto text-2xl leading-snug">{memory.story}</p>}
      <div className="mt-auto flex flex-col gap-3">
        {listen.playing ? (
          <BigButton label={m.stop} icon={<Square />} variant="secondary" onClick={listen.stop} />
        ) : (
          <BigButton label={memory.voice_url ? m.listen : m.readStory} icon={<Volume2 />} variant="secondary" onClick={() => void listen.start()} />
        )}
        {total > 1 ? (
          <BigButton label={m.nextMemory} icon={<ArrowRight className="flip-rtl" />} note={m.memoryOf(index + 1, total)} onClick={onNext} />
        ) : (
          <BigButton label={copy.whoIsThis.back} icon={<ArrowLeft className="flip-rtl" />} onClick={onBack} />
        )}
      </div>
    </Layout>
  );
}

/** The memory book (Round 2 batch 4): pages from the family, one at a time, read aloud or in their voice. */
export function Memories() {
  const m = copy.memories;
  const { state } = useAuth();
  const patientId = state.status === "authenticated" ? state.user.id : 0;
  const memories = useQuery({ queryKey: ["memories", patientId], queryFn: () => listMemories(patientId), enabled: patientId > 0 });
  const { cue } = useFeedback();
  const [params, setParams] = useSearchParams();
  const list = memories.data ?? [];
  const openIndex = list.findIndex((x) => String(x.id) === params.get("memory"));
  const back = () => {
    if (window.history.state?.idx > 0) window.history.back();
    else setParams({}, { replace: true });
  };

  if (openIndex >= 0) {
    const memory = list[openIndex]!;
    return (
      <MemoryPage
        memory={memory}
        index={openIndex}
        total={list.length}
        onBack={back}
        onNext={() => setParams({ memory: String(list[(openIndex + 1) % list.length]!.id) }, { replace: true })}
      />
    );
  }

  return (
    <Layout title={m.memories} spokenIntro={list.length > 0 ? m.intro : m.empty} snug>
      <PeopleMemoriesSwitch />
      {memories.isPending && (
        <Busy label={copy.common.loading} className="grid grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
          ))}
        </Busy>
      )}
      {memories.isError && (
        <Card>
          <p className="mb-6 text-2xl">{m.loadFailed}</p>
          <BigButton label={copy.games.retry} icon={<RotateCcw />} onClick={() => void memories.refetch()} />
        </Card>
      )}
      {memories.isSuccess && list.length === 0 && (
        <Card>
          <p className="text-2xl">{m.empty}</p>
        </Card>
      )}
      {list.length > 0 && (
        <>
          <p className="text-2xl">{m.intro}</p>
          <div className="grid grid-cols-2 gap-4">
            {list.map((memory) => (
              <button
                key={memory.id}
                type="button"
                onClick={() => {
                  cue("tap");
                  setParams({ memory: String(memory.id) });
                }}
                className={`flex flex-col overflow-hidden rounded-2xl border-4 border-brand bg-surface text-start shadow-lift hover:border-brand-dark ${pressable}`}
              >
                <AuthedImage src={memory.photos[0]!.url} alt="" className="aspect-[4/3] w-full object-cover" />
                <span className="px-3 py-2 text-2xl font-bold leading-tight">{memory.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
