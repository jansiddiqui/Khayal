import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listFamily, type FamilyMember, type FamilyPhoto } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AuthedImage } from "../../components/AuthedImage";
import { BigButton } from "../../components/BigButton";
import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";

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
  const [open, setOpen] = useState<Tile | null>(null);

  if (open) {
    const { member, photo } = open;
    return (
      <Layout title={member.name} spoken={w.spoken(member.name, member.relation, member.note)}>
        {/* Height-capped so the words and the Back button stay on screen on a phone. */}
        <AuthedImage
          src={photo.url}
          alt={w.photoOf(member.name)}
          className="mx-auto aspect-square h-[30vh] max-h-[480px] w-auto max-w-full rounded-2xl object-cover"
        />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-3xl font-semibold">{w.thisIs(member.name, member.relation)}</p>
            {member.note && <p className="text-2xl">{member.note}</p>}
          </div>
          <BigButton label={w.back} icon="⬅️" onClick={() => setOpen(null)} />
        </div>
      </Layout>
    );
  }

  const tiles: Tile[] = (family.data ?? []).flatMap((member) => member.photos.map((photo) => ({ member, photo })));

  return (
    <Layout title={w.title} spokenIntro={tiles.length > 0 ? w.intro : w.empty}>
      {family.isPending && <p className="text-2xl">{copy.common.loading}</p>}
      {family.isError && (
        <Card>
          <p className="mb-6 text-2xl">{w.loadFailed}</p>
          <BigButton label={copy.games.retry} icon="🔄" onClick={() => void family.refetch()} />
        </Card>
      )}
      {family.isSuccess && tiles.length === 0 && (
        <Card>
          <p className="text-2xl">
            <span aria-hidden="true">👪 </span>
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
                onClick={() => setOpen(tile)}
                aria-label={`${tile.member.name}, ${tile.member.relation}`}
                className="flex flex-col overflow-hidden rounded-2xl border-4 border-brand bg-white text-left hover:border-brand-dark"
              >
                <AuthedImage src={tile.photo.url} alt="" className="aspect-square w-full object-cover" />
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
