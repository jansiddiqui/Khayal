import { ArrowLeft, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { listFamily, type FamilyMember, type FamilyPhoto } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AuthedImage } from "../../components/AuthedImage";
import { BigButton } from "../../components/BigButton";
import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";
import { PeopleMemoriesSwitch } from "../../components/PeopleMemoriesSwitch";
import { QuestionRow } from "../../games/QuestionRow";
import { copy } from "../../copy";
import { useFeedback } from "../../ui/feedback";
import { pressable } from "../../ui/motion";
import { Busy, Skeleton } from "../../ui/Skeleton";

interface Tile {
  member: FamilyMember;
  photo: FamilyPhoto;
}

/** Help, not a test: every photo is labelled, and tapping one shows it big and says who it is. */
export function WhoIsThis() {
  const w = copy.whoIsThis;
  const { state } = useAuth();
  const patientId = state.status === "authenticated" ? state.user.id : 0;
  const family = useQuery({ queryKey: ["family", patientId], queryFn: () => listFamily(patientId), enabled: patientId > 0 });
  const { cue } = useFeedback();
  // The open photo is in the address (?photo=…), so the phone's Back button returns to the grid.
  const [params, setParams] = useSearchParams();
  const tiles: Tile[] = (family.data ?? []).flatMap((member) => member.photos.map((photo) => ({ member, photo })));
  const open = tiles.find((t) => t.photo.id === params.get("photo")) ?? null;
  const show = (tile: Tile) => setParams({ photo: tile.photo.id });
  const back = () => {
    if (window.history.state?.idx > 0) window.history.back();
    else setParams({}, { replace: true });
  };

  if (open) {
    const { member, photo } = open;
    return (
      <Layout title={member.name} spoken={w.spoken(member.name, member.relation, member.note)} compact>
        {/* The photo is as wide as the screen allows; the words and Back always stay on screen. */}
        <div className="flex min-h-0 shrink justify-center">
          <AuthedImage
            src={photo.url}
            alt={w.photoOf(member.name)}
            className="aspect-square max-h-full w-full max-w-[600px] rounded-2xl object-cover"
          />
        </div>
        <QuestionRow spoken={w.spoken(member.name, member.relation, member.note)}>
          <div className="flex flex-col gap-2">
            <p className="text-3xl font-semibold">{w.thisIs(member.name, member.relation)}</p>
            {member.note && <p className="text-2xl">{member.note}</p>}
          </div>
        </QuestionRow>
        <div className="mt-auto">
          <BigButton label={w.back} icon={<ArrowLeft className="flip-rtl" />} onClick={back} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={w.title} spokenIntro={tiles.length > 0 ? w.intro : w.empty} snug>
      <PeopleMemoriesSwitch />
      {family.isPending && (
        <Busy label={copy.common.loading} className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
          ))}
        </Busy>
      )}
      {family.isError && (
        <Card>
          <p className="mb-6 text-2xl">{w.loadFailed}</p>
          <BigButton label={copy.games.retry} icon={<RotateCcw />} onClick={() => void family.refetch()} />
        </Card>
      )}
      {family.isSuccess && tiles.length === 0 && (
        <Card>
          <p className="text-2xl">
            {w.empty}
          </p>
        </Card>
      )}
      {tiles.length > 0 && (
        <>
          <p className="text-2xl">{w.intro}</p>
          <div className="grid grid-cols-2 gap-4">
            {tiles.map((tile) => (
              <button
                key={tile.photo.id}
                type="button"
                onClick={() => {
                  cue("tap");
                  show(tile);
                }}
                aria-label={w.thisIs(tile.member.name, tile.member.relation)}
                className={`flex flex-col overflow-hidden rounded-2xl border-4 border-brand bg-surface text-start shadow-lift hover:border-brand-dark ${pressable}`}
              >
                <AuthedImage src={tile.photo.url} alt="" className="aspect-[4/3] w-full object-cover object-[center_30%]" />
                <span className="px-3 pt-2 text-2xl font-bold">{tile.member.name}</span>
                <span className="px-3 pb-3 text-xl">{tile.member.relation}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
